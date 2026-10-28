import { _electron as electron } from 'playwright'
import { createServer } from 'node:http'
import { mkdirSync, rmSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

const OUT = 'artifacts'
mkdirSync(OUT, { recursive: true })
const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads', 'TDM', 'Autres')

function pattern(size) {
  const buffer = Buffer.allocUnsafe(size)
  for (let i = 0; i < size; i += 1) buffer[i] = (i * 31 + 7) % 256
  return buffer
}

const payload = pattern(4 * 1024 * 1024 + 511)
const etag = '"tdm-e2e"'

const server = createServer((req, res) => {
  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'content-length': String(payload.length),
      'content-type': 'application/octet-stream',
      'accept-ranges': 'bytes',
      etag,
      'content-disposition': 'attachment; filename="tdm-e2e.bin"'
    })
    res.end()
    return
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''))
  if (match) {
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : payload.length - 1
    if (start >= payload.length) {
      res.writeHead(416, { 'content-range': `bytes */${payload.length}` })
      res.end()
      return
    }
    const body = payload.subarray(start, Math.min(end, payload.length - 1) + 1)
    res.writeHead(206, {
      'content-length': String(body.length),
      'content-type': 'application/octet-stream',
      'content-range': `bytes ${start}-${start + body.length - 1}/${payload.length}`,
      'accept-ranges': 'bytes',
      etag
    })
    void pump(res, body)
    return
  }
  res.writeHead(200, {
    'content-length': String(payload.length),
    'content-type': 'application/octet-stream',
    'accept-ranges': 'bytes',
    etag
  })
  void pump(res, payload)
})

async function pump(res, body) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let offset = 0
  while (offset < body.length) {
    if (res.destroyed) return
    const chunk = body.subarray(offset, Math.min(offset + 32 * 1024, body.length))
    offset += chunk.length
    if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve))
    await sleep(25)
  }
  res.end()
}

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const url = `http://127.0.0.1:${port}/tdm-e2e.bin`
const expected = createHash('sha256').update(payload).digest('hex')
console.log('server:', url)

const app = await electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu', '--disable-dev-shm-usage']
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForTask(page, id, predicate, label, timeout = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const task = await page.evaluate(async (taskId) => {
      const tasks = await window.tdm.request('tasks.list')
      return tasks.find((item) => item.id === taskId) ?? null
    }, id)
    if (task && predicate(task)) return task
    await sleep(120)
  }
  throw new Error(`Délai dépassé : ${label}`)
}

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await page
      .evaluate(async () => {
        try {
          await window.tdm.request('engine.ping')
          return true
        } catch {
          return false
        }
      })
      .catch(() => false)
    if (ready) break
    await sleep(250)
  }

  await page.getByRole('button', { name: 'Nouveau', exact: true }).click()
  await page.locator('input[type="url"]').fill(url)
  await page.getByRole('button', { name: 'Analyser' }).click()
  await page.getByText('Reprise et segments disponibles').waitFor({ timeout: 15000 })
  await page.screenshot({ path: `${OUT}/e2e-add-dialog.png` })

  await page.getByRole('button', { name: 'Télécharger', exact: true }).click()

  const row = page.locator('.task-row', { hasText: 'tdm-e2e.bin' }).first()
  await row.waitFor({ timeout: 15000 })
  await sleep(600)
  await page.screenshot({ path: `${OUT}/e2e-downloading.png` })

  const task = await page.evaluate(async () => {
    const tasks = await window.tdm.request('tasks.list')
    return tasks.find((item) => item.fileName === 'tdm-e2e.bin')
  })

  await row.getByRole('button', { name: 'Suspendre tdm-e2e.bin' }).click()
  const paused = await waitForTask(page, task.id, (item) => item.status === 'paused', 'pause')
  await page.locator('.status-badge--paused').first().waitFor({ timeout: 15000 })
  await page.screenshot({ path: `${OUT}/e2e-paused.png` })
  if (paused.receivedBytes <= 0 || paused.receivedBytes >= paused.totalBytes) {
    throw new Error(`Progression suspendue inattendue : ${paused.receivedBytes}/${paused.totalBytes}`)
  }
  console.log('pause:', paused.receivedBytes, '/', paused.totalBytes)

  await row.getByRole('button', { name: 'Reprendre tdm-e2e.bin' }).click()
  const finished = await waitForTask(
    page,
    task.id,
    (item) => ['completed', 'failed', 'needs_attention'].includes(item.status),
    'fin du téléchargement après reprise'
  )
  await page.locator('.status-badge--completed').first().waitFor({ timeout: 30000 })
  await page.screenshot({ path: `${OUT}/e2e-completed.png` })
  console.log('final:', finished.status, finished.receivedBytes, '/', finished.totalBytes)

  const actual = createHash('sha256').update(readFileSync(finished.filePath)).digest('hex')
  console.log('sha256 match:', actual === expected)

  await row.click()
  await page.waitForSelector('.properties')
  await page.screenshot({ path: `${OUT}/e2e-properties.png` })

  const before = await page.evaluate(() => window.tdm.request('settings.get'))
  const target = before.maxConcurrentDownloads === 3 ? 4 : 3
  await page.getByRole('button', { name: 'Paramètres', exact: true }).first().click()
  await page.waitForSelector('.modal')
  await page.getByRole('tab', { name: 'Téléchargements' }).click()
  const concurrency = page.getByLabel('Téléchargements simultanés (1–16)')
  await concurrency.fill(String(target))
  await page.screenshot({ path: `${OUT}/e2e-settings.png` })
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.waitForSelector('.modal', { state: 'detached', timeout: 15000 })
  const after = await page.evaluate(() => window.tdm.request('settings.get'))
  if (after.maxConcurrentDownloads !== target) {
    throw new Error(`Réglage non appliqué : ${after.maxConcurrentDownloads}`)
  }
  console.log('settings:', before.maxConcurrentDownloads, '->', after.maxConcurrentDownloads)

  await page.evaluate(
    async ({ s, previous, id }) => {
      await window.tdm.request('settings.update', {
        ...s,
        maxConcurrentDownloads: previous.maxConcurrentDownloads
      })
      await window.tdm.request('tasks.remove', { id, deleteFile: true })
    },
    { s: after, previous: before, id: task.id }
  )

  if (finished.status !== 'completed') throw new Error('Statut final inattendu')
  if (actual !== expected) throw new Error('Empreinte SHA-256 différente')
  rmSync(path.join(DOWNLOAD_DIR, 'tdm-e2e.bin'), { force: true })
  console.log('E2E OK')
} finally {
  await app.close()
  server.close()
}
