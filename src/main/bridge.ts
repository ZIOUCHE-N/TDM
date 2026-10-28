import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { BridgeInfo } from '../shared/protocol'

export interface BridgeRequest {
  url: string
  referrer?: string
  fileName?: string
  categoryId?: string
  startNow?: boolean
}

export interface BridgeDeps {
  dataDir: string
  version: string
  addTask: (input: BridgeRequest) => Promise<unknown>
  log: (message: string, detail?: unknown) => void
}

const MAX_BODY = 64 * 1024
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

function json(response: ServerResponse, status: number, body: unknown, origin?: string): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...corsHeaders(origin)
  })
  response.end(payload)
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-tdm-token, authorization',
    'access-control-max-age': '600',
    vary: 'origin'
  }
  if (origin) headers['access-control-allow-origin'] = origin
  return headers
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true // extension/service worker sans Origin (test local avec jeton)
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) return true
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true
  return false
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Corps de requête trop volumineux'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export class BrowserBridge {
  private server: Server | null = null
  private readonly token: string
  private port = 0
  private running = false
  private error: string | null = null
  private origin = 'http://127.0.0.1'
  private hits: number[] = []
  private onStatus: (info: BridgeInfo) => void = () => undefined

  constructor(private readonly deps: BridgeDeps) {
    const tokenFile = path.join(deps.dataDir, 'bridge-token')
    try {
      mkdirSync(deps.dataDir, { recursive: true })
      if (existsSync(tokenFile)) {
        const stored = readFileSync(tokenFile, 'utf8').trim()
        this.token = /^[a-f0-9]{64}$/.test(stored) ? stored : this.createToken(tokenFile)
      } else {
        this.token = this.createToken(tokenFile)
      }
    } catch (error) {
      deps.log('bridge.token.failed', error)
      this.token = randomBytes(32).toString('hex')
    }
  }

  private createToken(file: string): string {
    const token = randomBytes(32).toString('hex')
    writeFileSync(file, `${token}\n`, { mode: 0o600 })
    try {
      chmodSync(file, 0o600)
    } catch {
      // système de fichiers sans permissions POSIX
    }
    return token
  }

  setStatusListener(listener: (info: BridgeInfo) => void): void {
    this.onStatus = listener
  }

  info(): BridgeInfo {
    return {
      enabled: true,
      port: this.port,
      token: this.token,
      origin: this.origin,
      running: this.running,
      error: this.error
    }
  }

  async start(port: number): Promise<BridgeInfo> {
    await this.stop()
    this.port = port
    this.origin = `http://127.0.0.1:${port}`
    this.error = null
    const server = createServer((request, response) => {
      void this.handle(request, response)
    })
    this.server = server

    await new Promise<void>((resolve) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        this.running = false
        this.error =
          error.code === 'EADDRINUSE'
            ? `Le port ${port} est déjà utilisé.`
            : `Pont indisponible : ${error.message}`
        this.deps.log('bridge.listen.failed', { port, message: error.message })
        resolve()
      })
      server.listen(port, '127.0.0.1', () => {
        this.running = true
        this.error = null
        this.deps.log('bridge.listening', { port })
        resolve()
      })
    })

    this.onStatus(this.info())
    return this.info()
  }

  async stop(): Promise<void> {
    if (!this.server) {
      this.running = false
      return
    }
    const server = this.server
    this.server = null
    await new Promise<void>((resolve) => server.close(() => resolve()))
    this.running = false
    this.onStatus(this.info())
  }

  private authorize(request: IncomingMessage): boolean {
    const header = String(request.headers['x-tdm-token'] ?? '')
    const bearer = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const candidate = header || bearer
    if (candidate.length !== this.token.length) return false
    try {
      return timingSafeEqual(Buffer.from(candidate), Buffer.from(this.token))
    } catch {
      return false
    }
  }

  private rateLimited(): boolean {
    const now = Date.now()
    this.hits = this.hits.filter((at) => now - at < 60_000)
    if (this.hits.length >= 60) return true
    this.hits.push(now)
    return false
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const originHeader = request.headers.origin ? String(request.headers.origin) : undefined
    if (!isAllowedOrigin(originHeader)) {
      json(response, 403, { ok: false, error: 'Origine non autorisée' })
      return
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders(originHeader))
      response.end()
      return
    }

    const url = new URL(request.url ?? '/', this.origin)

    if (request.method === 'GET' && (url.pathname === '/v1/ping' || url.pathname === '/v1/health')) {
      json(
        response,
        200,
        {
          ok: true,
          app: 'TDM',
          name: 'Téléchargement Download Manager',
          version: this.deps.version,
          api: 1,
          authRequired: true
        },
        originHeader
      )
      return
    }

    if (!this.authorize(request)) {
      json(response, 401, { ok: false, error: 'Jeton TDM manquant ou invalide' }, originHeader)
      return
    }

    if (this.rateLimited()) {
      json(response, 429, { ok: false, error: 'Trop de requêtes, réessayez dans une minute' }, originHeader)
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/download') {
      let body: unknown
      try {
        body = JSON.parse(await readBody(request))
      } catch {
        json(response, 400, { ok: false, error: 'JSON invalide' }, originHeader)
        return
      }
      if (!body || typeof body !== 'object') {
        json(response, 400, { ok: false, error: 'Corps attendu : { url }' }, originHeader)
        return
      }
      const input = body as Record<string, unknown>
      const target = typeof input.url === 'string' ? input.url.trim() : ''
      let parsed: URL
      try {
        parsed = new URL(target)
      } catch {
        json(response, 400, { ok: false, error: 'URL invalide' }, originHeader)
        return
      }
      if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        json(response, 400, { ok: false, error: 'Seules les URL HTTP/HTTPS sont acceptées' }, originHeader)
        return
      }
      if (target.length > 4096) {
        json(response, 400, { ok: false, error: 'URL trop longue' }, originHeader)
        return
      }

      try {
        const task = await this.deps.addTask({
          url: target,
          referrer: typeof input.referrer === 'string' ? input.referrer.slice(0, 2048) : undefined,
          fileName: typeof input.fileName === 'string' ? input.fileName.slice(0, 240) : undefined,
          categoryId: typeof input.categoryId === 'string' ? input.categoryId.slice(0, 100) : undefined,
          startNow: input.startNow === false ? false : true
        })
        this.deps.log('bridge.download.added', { url: parsed.origin + parsed.pathname })
        json(response, 200, { ok: true, task }, originHeader)
      } catch (error) {
        this.deps.log('bridge.download.failed', {
          message: error instanceof Error ? error.message : String(error)
        })
        json(
          response,
          502,
          { ok: false, error: error instanceof Error ? error.message : 'Échec de l’ajout' },
          originHeader
        )
      }
      return
    }

    json(response, 404, { ok: false, error: 'Route inconnue' }, originHeader)
  }
}
