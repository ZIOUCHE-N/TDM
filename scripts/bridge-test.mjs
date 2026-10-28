import { _electron as electron } from 'playwright'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const payload = Buffer.alloc(2 * 1024 * 1024 + 333)
for (let i = 0; i < payload.length; i += 1) payload[i] = (i * 17 + 3) % 256

const server = createServer((req, res) => {
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'content-length': String(payload.length),
      'content-type': 'application/octet-stream',
      'accept-ranges': 'bytes',
      'content-disposition': 'attachment; filename="bridge-test.bin"'
    })
    res.end()
    return
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
  if (match) {
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : payload.length - 1
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
const url = `http://127.0.0.1:${server.address().port}/bridge-test.bin`

const app = await electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu', '--disable-dev-shm-usage']
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  let bridge = null
  for (let attempt = 0; attempt < 120 && !bridge?.running; attempt += 1) {
    bridge = await page.evaluate(() => window.tdm.bridgeInfo()).catch(() => null)
    if (!bridge?.running) await sleep(250)
  }
  if (!bridge?.running) throw new Error('Pont non démarré')
  console.log('bridge:', bridge.port, 'token length:', bridge.token.length)

  const base = `http://127.0.0.1:${bridge.port}`

  const ping = await fetch(`${base}/v1/ping`)
  console.log('ping:', ping.status, await ping.text())

  const unauthorized = await fetch(`${base}/v1/download`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url })
  })
  console.log('sans jeton:', unauthorized.status)

  const badOrigin = await fetch(`${base}/v1/download`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', 'x-tdm-token': bridge.token },
    body: JSON.stringify({ url })
  })
  console.log('origine refusée:', badOrigin.status)

  const accepted = await fetch(`${base}/v1/download`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tdm-token': bridge.token },
    body: JSON.stringify({ url })
  })
  const acceptedBody = await accepted.json()
  console.log('ajout pont:', accepted.status, acceptedBody.task?.fileName)

  let task = null
  for (let attempt = 0; attempt < 200; attempt += 1) {
    task = await page.evaluate(async (id) => {
      const tasks = await window.tdm.request('tasks.list')
      return tasks.find((item) => item.id === id) ?? null
    }, acceptedBody.task.id)
    if (task && ['completed', 'failed', 'needs_attention'].includes(task.status)) break
    await sleep(150)
  }
  console.log('statut final:', task?.status, task?.receivedBytes, '/', task?.totalBytes)

  const expected = createHash('sha256').update(payload).digest('hex')
  const actual = createHash('sha256').update(readFileSync(task.filePath)).digest('hex')
  console.log('sha256 match:', actual === expected)

  if (unauthorized.status !== 401) throw new Error('Le pont a accepté une requête sans jeton')
  if (badOrigin.status !== 403) throw new Error('Le pont a accepté une origine inconnue')
  if (task.status !== 'completed' || actual !== expected) throw new Error('Téléchargement via le pont invalide')
  console.log('BRIDGE OK')

  await page.evaluate(async (id) => {
    await window.tdm.request('tasks.remove', { id, deleteFile: true })
  }, task.id)
} finally {
  await app.close()
  server.close()
}
