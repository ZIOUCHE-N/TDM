const api = globalThis.browser
const portInput = document.getElementById('port')
const tokenInput = document.getElementById('token')
const status = document.getElementById('status')

function setStatus(text, kind = '') {
  status.textContent = text
  status.className = `status ${kind}`
}

async function load() {
  const config = await api.runtime.sendMessage({ type: 'tdm:config' })
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
  await api.storage.local.set({ port, token: tokenInput.value.trim() })
  setStatus('Réglages enregistrés.', 'ok')
})

document.getElementById('test').addEventListener('click', async () => {
  setStatus('Test en cours…')
  const result = await api.runtime.sendMessage({ type: 'tdm:ping' })
  if (result?.ok) setStatus(`TDM ${result.version || ''} répond correctement.`, 'ok')
  else setStatus(`Échec : ${result?.error || `HTTP ${result?.status || '?'}`}`, 'error')
})

document.getElementById('download-page').addEventListener('click', async () => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
    setStatus('Cette page n’est pas une URL HTTP/HTTPS.', 'error')
    return
  }
  setStatus('Envoi à TDM…')
  const result = await api.runtime.sendMessage({ type: 'tdm:send', url: tab.url })
  if (result?.ok) setStatus(`Ajouté : ${result.fileName || tab.url}`, 'ok')
  else setStatus(result?.error || 'Échec de l’envoi.', 'error')
})

void load()
