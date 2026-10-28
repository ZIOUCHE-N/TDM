import { _electron as electron, chromium } from 'playwright'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const payload = Buffer.alloc(1024 * 1024 + 123)
for (let i = 0; i < payload.length; i += 1) payload[i] = (i * 13 + 5) % 256
const expected = createHash('sha256').update(payload).digest('hex')

const server = createServer((req, res) => {
  if (req.url === '/page.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>TDM extension test</title><p>Page de test.</p>')
    return
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'content-length': String(payload.length),
      'content-type': 'application/octet-stream',
      'accept-ranges': 'bytes',
      'content-disposition': 'attachment; filename="extension-test.bin"'
    })
    res.end()
    return
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
  if (range) {
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : payload.length - 1
    const body = payload.subarray(start, Math.min(end, payload.length - 1) + 1)
    res.writeHead(206, {
      'content-length': String(body.length),
      'content-range': `bytes ${start}-${start + body.length - 1}/${payload.length}`,
      'accept-ranges': 'bytes'
    })
    res.end(body)
    return
  }
  res.writeHead(200, { 'content-length': String(payload.length), 'accept-ranges': 'bytes' })
  res.end(payload)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const fileUrl = `${base}/extension-test.bin`

const profile = await mkdtemp(path.join(tmpdir(), 'tdm-chrome-profile-'))
const extensionPath = path.resolve('extension')
const app = await electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu', '--disable-dev-shm-usage']
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let context = null
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  let bridge = null
  for (let attempt = 0; attempt < 120 && !bridge?.running; attempt += 1) {
    bridge = await page.evaluate(() => window.tdm.bridgeInfo()).catch(() => null)
    if (!bridge?.running) await sleep(250)
  }
  if (!bridge?.running) throw new Error('Pont TDM non démarré')

  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  })

  let worker = context.serviceWorkers()[0]
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 })
  const extensionId = new URL(worker.url()).host
  console.log('extension id:', extensionId)

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.locator('#port').fill(String(bridge.port))
  await popup.locator('#token').fill(bridge.token)
  await popup.getByRole('button', { name: 'Enregistrer' }).click()
  await popup.getByRole('button', { name: 'Tester' }).click()
  await popup.locator('#status').filter({ hasText: 'répond correctement' }).waitFor({ timeout: 15000 })
  console.log('ping extension:', await popup.locator('#status').innerText())

  const sent = await popup.evaluate(
    (url) => chrome.runtime.sendMessage({ type: 'tdm:send', url }),
    fileUrl
  )
  if (!sent?.ok) throw new Error(`Envoi extension refusé : ${JSON.stringify(sent)}`)
  console.log('envoyé:', sent.fileName)

  let task = null
  for (let attempt = 0; attempt < 250; attempt += 1) {
    task = await page.evaluate(async () => {
      const tasks = await window.tdm.request('tasks.list')
      return tasks.find((item) => item.fileName === 'extension-test.bin') ?? null
    })
    if (task && ['completed', 'failed', 'needs_attention'].includes(task.status)) break
    await sleep(120)
  }
  if (!task) throw new Error('Tâche absente après envoi de l’extension')
  const actual = createHash('sha256').update(await readFile(task.filePath)).digest('hex')
  console.log('statut:', task.status, task.receivedBytes, '/', task.totalBytes)
  console.log('sha256 match:', actual === expected)

  await popup.screenshot({ path: 'artifacts/extension-popup.png' })
  if (task.status !== 'completed' || actual !== expected) throw new Error('Téléchargement via extension invalide')

  await page.evaluate(async (id) => {
    await window.tdm.request('tasks.remove', { id, deleteFile: true })
  }, task.id)
  console.log('EXTENSION OK')
} finally {
  if (context) await context.close()
  await app.close()
  server.close()
  await rm(profile, { recursive: true, force: true })
}
