import { _electron as electron } from 'playwright'
import path from 'node:path'

const executablePath = path.resolve(process.argv[2] ?? 'dist/linux-unpacked/tdm')
const app = await electron.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu', '--in-process-gpu', '--disable-dev-shm-usage'],
  env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' }
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  console.log('title:', await page.title())
  let ping = null
  for (let attempt = 0; attempt < 160 && !ping; attempt += 1) {
    try {
      ping = await page.evaluate(async () => window.tdm.request('engine.ping'))
    } catch {
      await sleep(250)
    }
  }
  if (!ping) throw new Error('Moteur non disponible dans le paquet')
  const info = await page.evaluate(async () => window.tdm.getInfo())
  console.log('ping:', ping.info.status, ping.info.sqliteVersion)
  console.log('packaged:', info.isPackaged, 'version:', info.version)
  const bridge = await page.evaluate(async () => window.tdm.bridgeInfo())
  console.log('bridge running:', bridge.running, bridge.port)
  console.log('PACKAGED OK')
} finally {
  await app.close()
}
