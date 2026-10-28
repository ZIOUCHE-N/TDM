const require_rolldown_runtime = require("./chunks/rolldown-runtime-CmQyd0Gu.js");
let electron = require("electron");
let node_crypto = require("node:crypto");
let node_fs = require("node:fs");
let node_os = require("node:os");
let node_path = require("node:path");
node_path = require_rolldown_runtime.__toESM(node_path);
let node_http = require("node:http");
// src/main/bridge.ts
var MAX_BODY = 65536;
var ALLOWED_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
function json(response, status, body, origin) {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store",
		...corsHeaders(origin)
	});
	response.end(payload);
}
function corsHeaders(origin) {
	const headers = {
		"access-control-allow-methods": "GET, POST, OPTIONS",
		"access-control-allow-headers": "content-type, x-tdm-token, authorization",
		"access-control-max-age": "600",
		vary: "origin"
	};
	if (origin) headers["access-control-allow-origin"] = origin;
	return headers;
}
function isAllowedOrigin(origin) {
	if (!origin) return true;
	if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) return true;
	if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return true;
	return false;
}
function readBody(request) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		request.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY) {
				reject(/* @__PURE__ */ new Error("Corps de requête trop volumineux"));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		request.on("error", reject);
	});
}
var BrowserBridge = class {
	deps;
	server = null;
	token;
	port = 0;
	running = false;
	error = null;
	origin = "http://127.0.0.1";
	hits = [];
	onStatus = () => void 0;
	constructor(deps) {
		this.deps = deps;
		const tokenFile = node_path.default.join(deps.dataDir, "bridge-token");
		try {
			(0, node_fs.mkdirSync)(deps.dataDir, { recursive: true });
			if ((0, node_fs.existsSync)(tokenFile)) {
				const stored = (0, node_fs.readFileSync)(tokenFile, "utf8").trim();
				this.token = /^[a-f0-9]{64}$/.test(stored) ? stored : this.createToken(tokenFile);
			} else this.token = this.createToken(tokenFile);
		} catch (error) {
			deps.log("bridge.token.failed", error);
			this.token = (0, node_crypto.randomBytes)(32).toString("hex");
		}
	}
	createToken(file) {
		const token = (0, node_crypto.randomBytes)(32).toString("hex");
		(0, node_fs.writeFileSync)(file, `${token}\n`, { mode: 384 });
		try {
			(0, node_fs.chmodSync)(file, 384);
		} catch {}
		return token;
	}
	setStatusListener(listener) {
		this.onStatus = listener;
	}
	info() {
		return {
			enabled: true,
			port: this.port,
			token: this.token,
			origin: this.origin,
			running: this.running,
			error: this.error
		};
	}
	async start(port) {
		await this.stop();
		this.port = port;
		this.origin = `http://127.0.0.1:${port}`;
		this.error = null;
		const server = (0, node_http.createServer)((request, response) => {
			this.handle(request, response);
		});
		this.server = server;
		await new Promise((resolve) => {
			server.once("error", (error) => {
				this.running = false;
				this.error = error.code === "EADDRINUSE" ? `Le port ${port} est déjà utilisé.` : `Pont indisponible : ${error.message}`;
				this.deps.log("bridge.listen.failed", {
					port,
					message: error.message
				});
				resolve();
			});
			server.listen(port, "127.0.0.1", () => {
				this.running = true;
				this.error = null;
				this.deps.log("bridge.listening", { port });
				resolve();
			});
		});
		this.onStatus(this.info());
		return this.info();
	}
	async stop() {
		if (!this.server) {
			this.running = false;
			return;
		}
		const server = this.server;
		this.server = null;
		await new Promise((resolve) => server.close(() => resolve()));
		this.running = false;
		this.onStatus(this.info());
	}
	authorize(request) {
		const header = String(request.headers["x-tdm-token"] ?? "");
		const bearer = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
		const candidate = header || bearer;
		if (candidate.length !== this.token.length) return false;
		try {
			return (0, node_crypto.timingSafeEqual)(Buffer.from(candidate), Buffer.from(this.token));
		} catch {
			return false;
		}
	}
	rateLimited() {
		const now = Date.now();
		this.hits = this.hits.filter((at) => now - at < 6e4);
		if (this.hits.length >= 60) return true;
		this.hits.push(now);
		return false;
	}
	async handle(request, response) {
		const originHeader = request.headers.origin ? String(request.headers.origin) : void 0;
		if (!isAllowedOrigin(originHeader)) {
			json(response, 403, {
				ok: false,
				error: "Origine non autorisée"
			});
			return;
		}
		if (request.method === "OPTIONS") {
			response.writeHead(204, corsHeaders(originHeader));
			response.end();
			return;
		}
		const url = new URL(request.url ?? "/", this.origin);
		if (request.method === "GET" && (url.pathname === "/v1/ping" || url.pathname === "/v1/health")) {
			json(response, 200, {
				ok: true,
				app: "TDM",
				name: "Téléchargement Download Manager",
				version: this.deps.version,
				api: 1,
				authRequired: true
			}, originHeader);
			return;
		}
		if (!this.authorize(request)) {
			json(response, 401, {
				ok: false,
				error: "Jeton TDM manquant ou invalide"
			}, originHeader);
			return;
		}
		if (this.rateLimited()) {
			json(response, 429, {
				ok: false,
				error: "Trop de requêtes, réessayez dans une minute"
			}, originHeader);
			return;
		}
		if (request.method === "POST" && url.pathname === "/v1/download") {
			let body;
			try {
				body = JSON.parse(await readBody(request));
			} catch {
				json(response, 400, {
					ok: false,
					error: "JSON invalide"
				}, originHeader);
				return;
			}
			if (!body || typeof body !== "object") {
				json(response, 400, {
					ok: false,
					error: "Corps attendu : { url }"
				}, originHeader);
				return;
			}
			const input = body;
			const target = typeof input.url === "string" ? input.url.trim() : "";
			let parsed;
			try {
				parsed = new URL(target);
			} catch {
				json(response, 400, {
					ok: false,
					error: "URL invalide"
				}, originHeader);
				return;
			}
			if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
				json(response, 400, {
					ok: false,
					error: "Seules les URL HTTP/HTTPS sont acceptées"
				}, originHeader);
				return;
			}
			if (target.length > 4096) {
				json(response, 400, {
					ok: false,
					error: "URL trop longue"
				}, originHeader);
				return;
			}
			try {
				const task = await this.deps.addTask({
					url: target,
					referrer: typeof input.referrer === "string" ? input.referrer.slice(0, 2048) : void 0,
					fileName: typeof input.fileName === "string" ? input.fileName.slice(0, 240) : void 0,
					categoryId: typeof input.categoryId === "string" ? input.categoryId.slice(0, 100) : void 0,
					startNow: input.startNow === false ? false : true
				});
				this.deps.log("bridge.download.added", { url: parsed.origin + parsed.pathname });
				json(response, 200, {
					ok: true,
					task
				}, originHeader);
			} catch (error) {
				this.deps.log("bridge.download.failed", { message: error instanceof Error ? error.message : String(error) });
				json(response, 502, {
					ok: false,
					error: error instanceof Error ? error.message : "Échec de l’ajout"
				}, originHeader);
			}
			return;
		}
		json(response, 404, {
			ok: false,
			error: "Route inconnue"
		}, originHeader);
	}
};
// src/main/index.ts
var mainWindow = null;
var tray = null;
var engine = null;
var engineReady = false;
var engineRestarts = 0;
var settings = null;
var bridge = null;
var bridgePort = 0;
var quitting = false;
var stopped = false;
var startHidden = process.argv.includes("--hidden");
var lastClipboard = "";
var argvHandled = false;
var pending = /* @__PURE__ */ new Map();
var DOWNLOADS_ROOT = node_path.default.join((0, node_os.homedir)(), "Downloads", "TDM");
function assetPath(name) {
	return electron.app.isPackaged ? node_path.default.join(process.resourcesPath, name) : node_path.default.join(electron.app.getAppPath(), "build", name);
}
function extensionPath() {
	return electron.app.isPackaged ? node_path.default.join(process.resourcesPath, "extension") : node_path.default.join(electron.app.getAppPath(), "extension");
}
function sendHost(type, payload) {
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("host:event", {
		type,
		payload,
		at: (/* @__PURE__ */ new Date()).toISOString()
	});
}
function showWindow() {
	if (!mainWindow) {
		createWindow();
		return;
	}
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.show();
	mainWindow.focus();
}
function trusted(event) {
	if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Appel IPC refusé");
}
function formatSpeed(bytesPerSecond) {
	if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 o/s";
	const units = [
		"o/s",
		"Kio/s",
		"Mio/s",
		"Gio/s"
	];
	let value = bytesPerSecond;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
function sendToRendererEvent(data) {
	if (typeof data.requestId === "string") {
		const entry = pending.get(data.requestId);
		if (entry) {
			clearTimeout(entry.timer);
			pending.delete(data.requestId);
			if (data.ok) entry.resolve(data.result);
			else {
				const error = new Error(data.error?.message ?? "Erreur du moteur");
				error.code = data.error?.code;
				error.details = data.error?.details;
				entry.reject(error);
			}
		}
		return;
	}
	if (typeof data.type !== "string") return;
	if (data.type === "engine.status") {
		const status = data.payload?.status;
		const wasReady = engineReady;
		engineReady = status === "ready" || status === "degraded";
		if (engineReady) engineRestarts = 0;
		if (engineReady && !wasReady) onEngineReady();
	}
	if (data.type === "settings.changed" && data.payload && typeof data.payload === "object") {
		settings = data.payload;
		applySettings(settings);
	}
	if (data.type === "notification") {
		const info = data.payload;
		showNotification(info.title ?? "TDM", info.body ?? "", info.taskId);
	}
	if (data.type === "stats.tick") {
		const stats = data.payload;
		if (tray) tray.setToolTip(stats?.downloading ? `TDM — ${stats.downloading} téléchargement(s), ${formatSpeed(stats.totalSpeed ?? 0)}` : "TDM — Téléchargement Download Manager");
	}
	sendHost("engine", {
		type: data.type,
		payload: data.payload,
		at: data.at
	});
}
function startEngine() {
	if (stopped) return;
	engineReady = false;
	const enginePath = node_path.default.join(__dirname, "engine.js");
	engine = electron.utilityProcess.fork(enginePath, [], {
		serviceName: "TDM Engine",
		stdio: "pipe",
		env: {
			...process.env,
			TDM_APP_VERSION: electron.app.getVersion(),
			TDM_DATA_DIR: electron.app.getPath("userData"),
			TDM_DOWNLOADS_DIR: DOWNLOADS_ROOT
		}
	});
	engine.stdout?.on("data", (chunk) => {
		console.log(`[engine] ${chunk.toString().trimEnd()}`);
	});
	engine.stderr?.on("data", (chunk) => {
		console.error(`[engine] ${chunk.toString().trimEnd()}`);
	});
	engine.on("message", (message) => {
		sendToRendererEvent(message);
	});
	engine.on("spawn", () => {
		console.log("[engine] spawned");
	});
	engine.on("exit", (code) => {
		engineReady = false;
		engine = null;
		for (const [, entry] of pending) {
			clearTimeout(entry.timer);
			entry.reject(/* @__PURE__ */ new Error("Le moteur s’est arrêté"));
		}
		pending.clear();
		console.error(`[engine] exited with code ${code}`);
		if (stopped || quitting) return;
		engineRestarts += 1;
		sendHost("engine.status", {
			status: "error",
			message: `Moteur arrêté (code ${code}). Redémarrage ${engineRestarts}/5…`
		});
		if (engineRestarts <= 5) setTimeout(() => startEngine(), Math.min(8e3, 800 * engineRestarts));
		else sendHost("engine.status", {
			status: "error",
			message: "Le moteur n’a pas pu redémarrer. Consultez le journal."
		});
	});
}
function requestEngine(command, payload, timeoutMs = 6e4) {
	if (!engine) return Promise.reject(/* @__PURE__ */ new Error("Moteur non démarré"));
	if (!engineReady) return Promise.reject(/* @__PURE__ */ new Error("Moteur en cours de démarrage"));
	const requestId = (0, node_crypto.randomUUID)();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(requestId);
			reject(/* @__PURE__ */ new Error("Délai dépassé en attendant le moteur"));
		}, timeoutMs);
		pending.set(requestId, {
			resolve,
			reject,
			timer
		});
		engine.postMessage({
			protocolVersion: 1,
			requestId,
			command,
			payload
		});
	});
}
async function onEngineReady() {
	try {
		const current = await requestEngine("settings.get");
		settings = current;
		applySettings(current);
	} catch (error) {
		console.error("[main] settings load failed", error);
	}
	await applyBridge();
	if (!argvHandled) {
		argvHandled = true;
		addFromArgv(process.argv);
	}
}
function applySettings(next) {
	electron.nativeTheme.themeSource = next.theme;
	sendHost("theme", {
		theme: next.theme,
		resolved: electron.nativeTheme.shouldUseDarkColors ? "dark" : "light"
	});
	applyAutoStart(next.autoStart);
	if (bridge) applyBridge();
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle("TDM — Téléchargement Download Manager");
}
function applyAutoStart(enabled) {
	if (!electron.app.isPackaged) return;
	try {
		if (process.platform === "linux") {
			const dir = node_path.default.join(electron.app.getPath("home"), ".config", "autostart");
			const file = node_path.default.join(dir, "tdm.desktop");
			if (enabled) {
				(0, node_fs.mkdirSync)(dir, { recursive: true });
				const exec = electron.app.getPath("exe").replace(/(["\\$`])/g, "\\$1");
				(0, node_fs.writeFileSync)(file, [
					"[Desktop Entry]",
					"Type=Application",
					"Name=TDM",
					"Comment=Téléchargement Download Manager",
					`Exec="${exec}" --hidden`,
					"Terminal=false",
					"X-GNOME-Autostart-enabled=true",
					""
				].join("\n"), { mode: 420 });
			} else (0, node_fs.rmSync)(file, { force: true });
		} else electron.app.setLoginItemSettings({
			openAtLogin: enabled,
			args: ["--hidden"]
		});
	} catch (error) {
		console.error("[main] autostart failed", error);
	}
}
async function applyBridge() {
	if (!settings) return;
	if (!bridge) {
		bridge = new BrowserBridge({
			dataDir: electron.app.getPath("userData"),
			version: electron.app.getVersion(),
			addTask: (input) => requestEngine("tasks.add", {
				...input,
				startNow: input.startNow ?? true
			}, 9e4),
			log: (message, detail) => console.log(`[bridge] ${message}`, detail ?? "")
		});
		bridge.setStatusListener((info) => {
			bridgePort = info.port;
			sendHost("bridge.status", info);
		});
	}
	if (!settings.bridgeEnabled) {
		await bridge.stop();
		sendHost("bridge.status", {
			...bridge.info(),
			enabled: false
		});
		return;
	}
	if (bridge.info().running && bridgePort === settings.bridgePort) return;
	bridgePort = settings.bridgePort;
	sendHost("bridge.status", await bridge.start(settings.bridgePort));
}
function showNotification(title, body, taskId) {
	if (settings && !settings.notifications) return;
	if (!electron.Notification.isSupported()) return;
	const notification = new electron.Notification({
		title,
		body,
		icon: assetPath("notification.png"),
		silent: false
	});
	notification.on("click", () => {
		showWindow();
		if (taskId) sendHost("focus-task", taskId);
	});
	notification.show();
}
function looksDownloadable(text) {
	let url;
	try {
		url = new URL(text);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;
	const pathname = url.pathname.toLowerCase();
	if (/\.(zip|rar|7z|tar|gz|bz2|xz|zst|iso|pdf|docx?|xlsx?|pptx?|epub|mp3|flac|wav|ogg|mp4|mkv|avi|mov|webm|exe|msi|msix|deb|rpm|appimage|dmg|pkg|apk|jar)$/.test(pathname)) return true;
	return /(?:^|[?&])(download|dl|attachment)=?/i.test(url.search);
}
setInterval(() => {
	(async () => {
		if (!settings?.clipboardMonitoring) return;
		if (!mainWindow || mainWindow.isDestroyed()) return;
		const text = (await electron.clipboard.readText()).trim();
		if (!text || text === lastClipboard || text.length > 4096) return;
		if (!looksDownloadable(text)) return;
		lastClipboard = text;
		sendHost("clipboard.detected", { url: text });
	})().catch(() => void 0);
}, 2e3);
function sendCommand(command) {
	showWindow();
	sendHost("ui:command", command);
}
function buildMenu() {
	const template = [
		{
			label: "Fichier",
			submenu: [
				{
					label: "Nouveau téléchargement…",
					accelerator: "CmdOrCtrl+N",
					click: () => sendCommand("new-download")
				},
				{ type: "separator" },
				{
					label: "Paramètres…",
					accelerator: "CmdOrCtrl+,",
					click: () => sendCommand("settings")
				},
				{ type: "separator" },
				process.platform === "darwin" ? {
					role: "quit",
					label: "Quitter TDM"
				} : {
					label: "Quitter",
					accelerator: "Ctrl+Q",
					click: () => electron.app.quit()
				}
			]
		},
		{
			label: "Téléchargements",
			submenu: [
				{
					label: "Tout démarrer",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendCommand("resume-all")
				},
				{
					label: "Tout suspendre",
					accelerator: "CmdOrCtrl+Shift+P",
					click: () => sendCommand("pause-all")
				},
				{ type: "separator" },
				{
					label: "Vider les téléchargements terminés…",
					click: () => sendCommand("clear-finished")
				},
				{
					label: "Ajouter depuis le presse-papiers",
					click: () => void addFromClipboard()
				}
			]
		},
		{
			label: "Affichage",
			submenu: [
				{
					role: "reload",
					label: "Recharger l’interface"
				},
				{
					role: "toggleDevTools",
					label: "Outils de développement",
					visible: !electron.app.isPackaged
				},
				{ type: "separator" },
				{
					role: "resetZoom",
					label: "Taille réelle"
				},
				{
					role: "zoomIn",
					label: "Agrandir"
				},
				{
					role: "zoomOut",
					label: "Réduire"
				},
				{ type: "separator" },
				{
					role: "togglefullscreen",
					label: "Plein écran"
				}
			]
		},
		{
			label: "Outils",
			submenu: [
				{
					label: "Dossier de l’extension navigateur",
					click: () => void electron.shell.openPath(extensionPath())
				},
				{
					label: "Dossier des journaux",
					click: () => void electron.shell.openPath(node_path.default.join(electron.app.getPath("userData"), "logs"))
				},
				{
					label: "Dossier des téléchargements",
					click: () => void electron.shell.openPath(settings?.defaultDownloadDir ?? DOWNLOADS_ROOT)
				},
				{ type: "separator" },
				{
					label: "Diagnostic du moteur",
					click: () => sendCommand("diagnostics")
				}
			]
		},
		{
			label: "Aide",
			submenu: [{
				label: "À propos de TDM",
				click: () => void showAbout()
			}, {
				label: "Limites de cette version",
				click: () => sendCommand("about-limitations")
			}]
		}
	];
	electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
async function addFromClipboard() {
	const text = (await electron.clipboard.readText()).trim();
	if (!text) {
		electron.dialog.showMessageBox({
			type: "info",
			message: "Le presse-papiers est vide."
		});
		return;
	}
	showWindow();
	sendHost("ui:command", {
		command: "new-download",
		url: text
	});
}
async function showAbout() {
	await electron.dialog.showMessageBox({
		type: "info",
		title: "À propos de TDM",
		message: "TDM — Téléchargement Download Manager",
		detail: [
			`Version ${electron.app.getVersion()}`,
			`Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}`,
			`SQLite : moteur local (node:sqlite)`,
			"",
			"Gestionnaire de téléchargements original pour Linux et Windows.",
			"Inspiré de fonctions documentées publiquement ; aucun code, icône ou ressource d’un autre produit n’est utilisé.",
			"Aucun contournement de DRM, d’authentification ou de protection de site."
		].join("\n"),
		buttons: ["Fermer"]
	});
}
function buildTray() {
	if (tray) return;
	const image = electron.nativeImage.createFromPath(assetPath("tray.png")).resize({
		width: process.platform === "linux" ? 22 : 16,
		height: process.platform === "linux" ? 22 : 16
	});
	tray = new electron.Tray(image);
	tray.setToolTip("TDM — Téléchargement Download Manager");
	const menu = electron.Menu.buildFromTemplate([
		{
			label: "Afficher TDM",
			click: () => showWindow()
		},
		{
			label: "Nouveau téléchargement…",
			click: () => sendCommand("new-download")
		},
		{ type: "separator" },
		{
			label: "Tout démarrer",
			click: () => void requestEngine("tasks.startAll").catch(() => void 0)
		},
		{
			label: "Tout suspendre",
			click: () => void requestEngine("tasks.pauseAll").catch(() => void 0)
		},
		{ type: "separator" },
		{
			label: "Quitter TDM",
			click: () => electron.app.quit()
		}
	]);
	tray.setContextMenu(menu);
	tray.on("double-click", () => showWindow());
	tray.on("click", () => showWindow());
}
function createWindow() {
	mainWindow = new electron.BrowserWindow({
		width: 1360,
		height: 840,
		minWidth: 1020,
		minHeight: 620,
		show: false,
		backgroundColor: "#0e1317",
		title: "TDM — Téléchargement Download Manager",
		icon: assetPath("icon.png"),
		autoHideMenuBar: false,
		webPreferences: {
			preload: node_path.default.join(__dirname, "../preload/index.js"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
			webSecurity: true,
			spellcheck: false,
			backgroundThrottling: false,
			devTools: !electron.app.isPackaged
		}
	});
	mainWindow.on("ready-to-show", () => {
		if (!startHidden) mainWindow?.show();
		startHidden = false;
	});
	mainWindow.on("close", (event) => {
		if (quitting || !settings?.minimizeToTray) return;
		event.preventDefault();
		mainWindow?.hide();
		if (process.platform === "darwin") electron.app.dock?.hide();
	});
	mainWindow.on("closed", () => {
		mainWindow = null;
	});
	mainWindow.on("show", () => {
		if (process.platform === "darwin") electron.app.dock?.show();
	});
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https://") || url.startsWith("http://")) electron.shell.openExternal(url);
		return { action: "deny" };
	});
	mainWindow.webContents.on("will-navigate", (event, url) => {
		const devUrl = process.env.ELECTRON_RENDERER_URL;
		if (devUrl && url.startsWith(devUrl)) return;
		event.preventDefault();
	});
	mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
	if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
	else mainWindow.loadFile(node_path.default.join(__dirname, "../renderer/index.html"));
}
function registerIpc() {
	electron.ipcMain.handle("engine:request", async (event, body) => {
		trusted(event);
		if (!body || typeof body.command !== "string") throw new Error("Commande invalide");
		return requestEngine(body.command, body.payload);
	});
	electron.ipcMain.handle("app:info", (event) => {
		trusted(event);
		return {
			version: electron.app.getVersion(),
			platform: process.platform,
			arch: process.arch,
			isPackaged: electron.app.isPackaged,
			dataDir: electron.app.getPath("userData"),
			downloadsDir: settings?.defaultDownloadDir ?? DOWNLOADS_ROOT,
			theme: settings?.theme ?? "system",
			resolvedTheme: electron.nativeTheme.shouldUseDarkColors ? "dark" : "light"
		};
	});
	electron.ipcMain.handle("app:open-external", async (event, url) => {
		trusted(event);
		if (typeof url !== "string" || !url.startsWith("https://") && !url.startsWith("http://")) throw new Error("URL non autorisée");
		await electron.shell.openExternal(url);
	});
	electron.ipcMain.handle("app:show-item", async (event, target) => {
		trusted(event);
		if (typeof target !== "string" || !node_path.default.isAbsolute(target)) throw new Error("Chemin invalide");
		electron.shell.showItemInFolder(target);
	});
	electron.ipcMain.handle("app:open-task-file", async (event, id) => {
		trusted(event);
		if (typeof id !== "string") throw new Error("Identifiant invalide");
		const task = await requestEngine("tasks.get", { id });
		if (task.status !== "completed") throw new Error("Le fichier n’est pas encore disponible.");
		if ((await electron.dialog.showMessageBox(mainWindow, {
			type: "question",
			title: "Ouvrir le fichier",
			message: task.fileName,
			detail: task.filePath,
			buttons: ["Ouvrir", "Annuler"],
			defaultId: 1,
			cancelId: 1
		})).response !== 0) return { opened: false };
		const error = await electron.shell.openPath(task.filePath);
		if (error) throw new Error(error);
		return { opened: true };
	});
	electron.ipcMain.handle("app:open-extension-folder", async (event) => {
		trusted(event);
		return electron.shell.openPath(extensionPath());
	});
	electron.ipcMain.handle("app:open-logs", async (event) => {
		trusted(event);
		return electron.shell.openPath(node_path.default.join(electron.app.getPath("userData"), "logs"));
	});
	electron.ipcMain.handle("dialog:select-directory", async (event, defaultPath) => {
		trusted(event);
		const result = await electron.dialog.showOpenDialog(mainWindow, {
			title: "Choisir un dossier",
			defaultPath: typeof defaultPath === "string" ? defaultPath : DOWNLOADS_ROOT,
			properties: ["openDirectory", "createDirectory"]
		});
		return result.canceled ? null : result.filePaths[0] ?? null;
	});
	electron.ipcMain.handle("dialog:confirm", async (event, body) => {
		trusted(event);
		return (await electron.dialog.showMessageBox(mainWindow, {
			type: "question",
			title: typeof body?.title === "string" ? body.title.slice(0, 120) : "Confirmer",
			message: typeof body?.message === "string" ? body.message.slice(0, 400) : "Confirmer l’action ?",
			detail: typeof body?.detail === "string" ? body.detail.slice(0, 1e3) : void 0,
			buttons: ["Confirmer", "Annuler"],
			defaultId: 1,
			cancelId: 1
		})).response === 0;
	});
	electron.ipcMain.handle("bridge:info", (event) => {
		trusted(event);
		if (!bridge) return {
			enabled: false,
			port: 0,
			token: "",
			origin: "",
			running: false,
			error: null
		};
		return {
			...bridge.info(),
			enabled: settings?.bridgeEnabled ?? false
		};
	});
	electron.ipcMain.handle("bridge:test", async (event) => {
		trusted(event);
		if (!bridge || !settings?.bridgeEnabled) return {
			ok: false,
			message: "Le pont est désactivé."
		};
		try {
			const response = await fetch(`http://127.0.0.1:${settings.bridgePort}/v1/ping`, { signal: AbortSignal.timeout(3e3) });
			const data = await response.json();
			return {
				ok: response.ok && data.app === "TDM",
				message: response.ok ? `Pont actif — version ${data.version ?? "?"}` : `HTTP ${response.status}`
			};
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : "Échec du test"
			};
		}
	});
	electron.ipcMain.handle("clipboard:read", async (event) => {
		trusted(event);
		return (await electron.clipboard.readText()).slice(0, 4096);
	});
}
async function addFromArgv(argv) {
	const candidate = argv.find((arg) => /^https?:\/\//i.test(arg));
	if (!candidate) return;
	try {
		await requestEngine("tasks.add", { url: candidate });
		showWindow();
	} catch (error) {
		console.error("[main] add from argv failed", error);
		electron.dialog.showMessageBox({
			type: "error",
			message: "Impossible d’ajouter ce lien.",
			detail: error instanceof Error ? error.message : String(error)
		});
	}
}
if (!electron.app.requestSingleInstanceLock()) electron.app.quit();
else {
	electron.app.setAppUserModelId("org.tdm.downloadmanager");
	electron.app.on("second-instance", (_event, argv) => {
		showWindow();
		addFromArgv(argv);
	});
	electron.app.whenReady().then(() => {
		electron.session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
		electron.session.defaultSession.setPermissionCheckHandler(() => false);
		registerIpc();
		buildMenu();
		buildTray();
		createWindow();
		startEngine();
		electron.app.on("activate", () => {
			if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
			else showWindow();
		});
	});
	electron.app.on("window-all-closed", () => {
		if (process.platform !== "darwin" && !settings?.minimizeToTray) electron.app.quit();
	});
	electron.app.on("before-quit", (event) => {
		if (quitting) return;
		if (!engine || !engineReady) {
			stopped = true;
			engine?.kill();
			return;
		}
		event.preventDefault();
		quitting = true;
		stopped = true;
		const hardExit = setTimeout(() => {
			engine?.kill();
			electron.app.exit(0);
		}, 5e3);
		requestEngine("engine.shutdown", void 0, 4e3).catch(() => void 0).finally(() => {
			clearTimeout(hardExit);
			engine?.kill();
			electron.app.exit(0);
		});
	});
}
