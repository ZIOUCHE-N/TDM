/**
 * Pont explicite entre le navigateur et TDM.
 * L'extension n'agit que sur un clic de l'utilisateur et n'injecte rien dans les pages.
 */

const DEFAULTS = { port: 47831, token: '' }

async function getConfig() {
  const stored = await chrome.storage.local.get(DEFAULTS)
  return {
    port: Number(stored.port) || DEFAULTS.port,
    token: String(stored.token || '')
  }
}

function baseUrl(port) {
  return `http://127.0.0.1:${port}`
}

async function sendDownload(payload) {
  const { port, token } = await getConfig()
  if (!token) {
    throw new Error('Jeton TDM manquant. Ouvrez la fenêtre de l’extension et collez le jeton affiché dans TDM → Paramètres → Navigateur.')
  }
  const response = await fetch(`${baseUrl(port)}/v1/download`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tdm-token': token
    },
    body: JSON.stringify(payload)
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `TDM a répondu HTTP ${response.status}`)
  }
  return data
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/128.png',
      title,
      message
    })
  } catch {
    // les notifications peuvent être refusées par le navigateur
  }
}

async function handleUrl(url, referrer) {
  try {
    const data = await sendDownload({ url, referrer })
    await notify('TDM', `Ajouté : ${data.task?.fileName || url}`)
    return { ok: true, fileName: data.task?.fileName }
  } catch (error) {
    await notify('TDM — ajout impossible', error.message)
    return { ok: false, error: error.message }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tdm-download-link',
      title: 'Télécharger le lien avec TDM',
      contexts: ['link']
    })
    chrome.contextMenus.create({
      id: 'tdm-download-page',
      title: 'Télécharger cette page avec TDM',
      contexts: ['page']
    })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'tdm-download-link' && info.linkUrl) {
    void handleUrl(info.linkUrl, info.pageUrl || tab?.url)
  } else if (info.menuItemId === 'tdm-download-page' && info.pageUrl) {
    void handleUrl(info.pageUrl, undefined)
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'tdm:send') {
    handleUrl(message.url, message.referrer).then(sendResponse)
    return true
  }
  if (message?.type === 'tdm:config') {
    getConfig().then(sendResponse)
    return true
  }
  if (message?.type === 'tdm:ping') {
    getConfig()
      .then(async ({ port }) => {
        const response = await fetch(`${baseUrl(port)}/v1/ping`, { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        sendResponse({ ok: response.ok && data.app === 'TDM', version: data.version, status: response.status })
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }))
    return true
  }
  return false
})
