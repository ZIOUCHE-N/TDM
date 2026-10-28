import { _electron as electron } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'artifacts'
mkdirSync(OUT, { recursive: true })

const app = await electron.launch({
  args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu', '--disable-dev-shm-usage'],
  env: { ...process.env, TDM_SMOKE: '1' }
})

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  console.log('title:', await page.title())

  let ping = null
  for (let attempt = 0; attempt < 120 && !ping; attempt += 1) {
    try {
      ping = await page.evaluate(async () => window.tdm.request('engine.ping'))
    } catch {
      await sleep(250)
    }
  }
  if (!ping) throw new Error('Le moteur ne répond pas après 30 secondes')
  console.log('ping:', JSON.stringify(ping, null, 2))

  const text = await page.locator('body').innerText()
  console.log('body:', text.slice(0, 500).replace(/\n+/g, ' | '))
  await page.screenshot({ path: `${OUT}/smoke-empty.png` })
  console.log('screenshot:', `${OUT}/smoke-empty.png`)
} finally {
  await app.close()
}
