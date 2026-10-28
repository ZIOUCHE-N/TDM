const portInput = document.getElementById('port')
const tokenInput = document.getElementById('token')
const status = document.getElementById('status')

function setStatus(text, kind = '') {
  status.textContent = text
  status.className = `status ${kind}`
}

function message(payload) {
  return new Promise((resolve) => chrome.runtime.sendMessage(payload, resolve))
}

async function load() {
  const config = await message({ type: 'tdm:config' })
  if (!config) return
  portInput.value = String(config.port)
  tokenInput.value = config.token || ''
}

document.getElementById('save').addEventListener('click', async () => {
  const port = Number(portInput.value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    setStatus('Port invalide (1024–65535).', 'error')
    return
  }
  await chrome.storage.local.set({ port, token: tokenInput.value.trim() })
  setStatus('Réglages enregistrés.', 'ok')
})

document.getElementById('test').addEventListener('click', async () => {
  setStatus('Test en cours…')
  const result = await message({ type: 'tdm:ping' })
  if (result?.ok) setStatus(`TDM ${result.version || ''} répond correctement.`, 'ok')
  else setStatus(`Échec : ${result?.error || `HTTP ${result?.status || '?'}`}`, 'error')
})

document.getElementById('download-page').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus('Cette page n’est pas une URL HTTP/HTTPS.', 'error')
    return
  }
  setStatus('Envoi à TDM…')
  const result = await message({ type: 'tdm:send', url: tab.url, referrer: undefined })
  if (result?.ok) setStatus(`Ajouté : ${result.fileName || tab.url}`, 'ok')
  else setStatus(result?.error || 'Échec de l’envoi.', 'error')
})

void load()
