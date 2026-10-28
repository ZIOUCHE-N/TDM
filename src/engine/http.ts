import { EnvHttpProxyAgent, ProxyAgent, request, type Dispatcher } from 'undici'
import type { Settings } from '../shared/settings'
import type { ProbeResult } from './types'
import { fileNameFromContentDisposition, fileNameFromUrl } from './paths'

const MAX_REDIRECTS = 8
const PROBE_TIMEOUT_MS = 25_000

export class HttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function assertHttpUrl(input: string): URL {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new HttpError('TDM-E-URL', 'URL invalide.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError('TDM-E-URL-SCHEME', 'Seules les URL HTTP et HTTPS sont prises en charge.')
  }
  if (!parsed.hostname) {
    throw new HttpError('TDM-E-URL-HOST', 'URL sans nom d’hôte.')
  }
  return parsed
}

function bypassesProxy(hostname: string, bypass: string): boolean {
  if (!bypass.trim()) return false
  return bypass
    .split(/[,;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((pattern) => {
      if (pattern === '*') return true
      const normalized = pattern.replace(/^\./, '')
      return hostname === normalized || hostname.endsWith(`.${normalized}`)
    })
}

let cachedKey = ''
let cachedAgent: Dispatcher | undefined

export function dispatcherFor(settings: Settings, url: string): Dispatcher | undefined {
  const hostname = new URL(url).hostname
  if (settings.proxyMode === 'direct') return undefined
  if (settings.proxyMode === 'system') {
    if (cachedKey !== 'system') {
      cachedKey = 'system'
      cachedAgent = new EnvHttpProxyAgent()
    }
    return cachedAgent
  }
  if (settings.proxyMode === 'manual') {
    if (!settings.proxyUrl.trim()) return undefined
    if (bypassesProxy(hostname, settings.proxyBypass)) return undefined
    const key = `manual:${settings.proxyUrl}`
    if (cachedKey !== key) {
      cachedKey = key
      try {
        cachedAgent = new ProxyAgent(settings.proxyUrl)
      } catch {
        cachedAgent = undefined
      }
    }
    return cachedAgent
  }
  return undefined
}

function baseHeaders(settings: Settings): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent':
      settings.userAgent.trim() ||
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36 TDM/0.1',
    accept: '*/*',
    'accept-encoding': 'identity'
  }
  return headers
}

function filenameFromDisposition(value: string | undefined): string | null {
  return fileNameFromContentDisposition(value ?? null)
}

function parseContentRange(value: string | undefined): {
  start: number
  end: number
  total: number | null
} | null {
  if (!value) return null
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim())
  if (!match) return null
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === '*' ? null : Number(match[3])
  }
}

function discardBody(response: Awaited<ReturnType<typeof request>>): void {
  const body = response.body
  if (body.destroyed || body.readableEnded) return
  // undici détruit le flux avec RequestAbortedError : le gestionnaire évite
  // qu'une erreur non capturée ne fasse échouer le processus.
  body.on('error', () => undefined)
  body.destroy()
}

export interface FollowResult {
  response: Awaited<ReturnType<typeof request>>
  finalUrl: string
  redirects: string[]
  dispatcher: Dispatcher | undefined
}

export async function followRedirects(
  url: string,
  settings: Settings,
  init: {
    method: 'GET' | 'HEAD'
    headers?: Record<string, string>
    signal?: AbortSignal
    headersTimeout?: number
    bodyTimeout?: number
  }
): Promise<FollowResult> {
  let current = assertHttpUrl(url).toString()
  const redirects: string[] = []
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const dispatcher = dispatcherFor(settings, current)
    let response: Awaited<ReturnType<typeof request>>
    try {
      response = await request(current, {
        method: init.method,
        headers: { ...baseHeaders(settings), ...(init.headers ?? {}) },
        dispatcher,
        signal: init.signal,
        headersTimeout: init.headersTimeout ?? PROBE_TIMEOUT_MS,
        bodyTimeout: init.bodyTimeout ?? 120_000
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new HttpError('TDM-E-TIMEOUT', 'Le serveur ne répond pas (délai dépassé).')
      }
      throw new HttpError(
        'TDM-E-NETWORK',
        `Connexion impossible : ${error instanceof Error ? error.message : String(error)}`
      )
    }

    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location
      discardBody(response)
      if (!location) {
        throw new HttpError('TDM-E-REDIRECT', 'Redirection sans destination.', response.statusCode)
      }
      redirects.push(current)
      current = new URL(String(location), current).toString()
      assertHttpUrl(current)
      continue
    }

    return { response, finalUrl: current, redirects, dispatcher }
  }
  throw new HttpError('TDM-E-REDIRECT-LOOP', 'Trop de redirections.')
}

function buildProbe(
  url: string,
  finalUrl: string,
  status: number,
  headers: Record<string, string | string[] | undefined>,
  contentLength: number | null,
  acceptRanges: boolean,
  redirects: string[]
): ProbeResult {
  const header = (name: string): string | undefined => {
    const value = headers[name]
    if (Array.isArray(value)) return value.join(', ')
    return value === undefined ? undefined : String(value)
  }
  const contentType = header('content-type') ?? null
  const suggested =
    filenameFromDisposition(header('content-disposition')) ?? fileNameFromUrl(finalUrl)
  return {
    url,
    finalUrl,
    status,
    contentType,
    contentLength,
    acceptRanges,
    etag: header('etag') ?? null,
    lastModified: header('last-modified') ?? null,
    suggestedFileName: suggested,
    resumable: acceptRanges && contentLength !== null && contentLength > 0,
    redirects
  }
}

/**
 * Inspecte une URL sans télécharger le corps. HEAD d'abord, puis une requête
 * Range: bytes=0-0 pour les serveurs qui refusent HEAD ou n'annoncent pas la taille.
 */
export async function probe(url: string, settings: Settings, signal?: AbortSignal): Promise<ProbeResult> {
  const head = await followRedirects(url, settings, { method: 'HEAD', signal })
  const headHeaders = head.response.headers as Record<string, string | string[] | undefined>
  const lengthHeader = head.response.headers['content-length']
  const headLength = lengthHeader ? Number(lengthHeader) : null
  const headRanges = String(head.response.headers['accept-ranges'] ?? '').toLowerCase().includes('bytes')

  discardBody(head.response)

  const headOk = head.response.statusCode >= 200 && head.response.statusCode < 300
  if (headOk && headLength !== null && Number.isFinite(headLength) && headLength > 0) {
    return buildProbe(
      url,
      head.finalUrl,
      head.response.statusCode,
      headHeaders,
      headLength,
      headRanges,
      head.redirects
    )
  }

  const get = await followRedirects(url, settings, {
    method: 'GET',
    headers: { range: 'bytes=0-0' },
    signal
  })
  const getHeaders = get.response.headers as Record<string, string | string[] | undefined>

  if (get.response.statusCode === 416) {
    discardBody(get.response)
    const range = parseContentRange(String(get.response.headers['content-range'] ?? ''))
    return buildProbe(url, get.finalUrl, get.response.statusCode, getHeaders, range?.total ?? 0, true, get.redirects)
  }

  if (get.response.statusCode < 200 || get.response.statusCode >= 300) {
    discardBody(get.response)
    throw new HttpError(
      'TDM-E-HTTP',
      `Le serveur a refusé la requête (HTTP ${get.response.statusCode}).`,
      get.response.statusCode
    )
  }

  const contentRange = parseContentRange(String(get.response.headers['content-range'] ?? ''))
  const acceptRanges =
    get.response.statusCode === 206 ||
    String(get.response.headers['accept-ranges'] ?? '').toLowerCase().includes('bytes')
  const contentLength = contentRange?.total ?? (get.response.statusCode === 200 && getHeaders['content-length'] ? Number(getHeaders['content-length']) : null)

  discardBody(get.response)

  return buildProbe(
    url,
    get.finalUrl,
    get.response.statusCode,
    getHeaders,
    contentLength !== null && Number.isFinite(contentLength) ? contentLength : null,
    acceptRanges,
    get.redirects
  )
}

export function openStream(
  url: string,
  settings: Settings,
  options: {
    rangeStart?: number
    rangeEnd?: number
    ifRange?: string | null
    referrer?: string | null
    signal: AbortSignal
    timeoutMs?: number
  }
): Promise<FollowResult> {
  const headers: Record<string, string> = {}
  if (options.rangeStart !== undefined) {
    headers.range = `bytes=${options.rangeStart}-${options.rangeEnd ?? ''}`
  }
  if (options.ifRange) headers['if-range'] = options.ifRange
  if (options.referrer) headers.referer = options.referrer
  return followRedirects(url, settings, {
    method: 'GET',
    headers,
    signal: options.signal,
    headersTimeout: options.timeoutMs ?? 30_000
  })
}

export function parseContentRangeHeader(value: string | undefined): {
  start: number
  end: number
  total: number | null
} | null {
  return parseContentRange(value)
}
