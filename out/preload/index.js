let electron = require("electron");
// src/preload/index.ts
electron.contextBridge.exposeInMainWorld("tdm", {
	request: (command, payload) => electron.ipcRenderer.invoke("engine:request", {
		command,
		payload
	}),
	onHostEvent: (callback) => {
		const listener = (_event, data) => callback(data);
		electron.ipcRenderer.on("host:event", listener);
		return () => electron.ipcRenderer.removeListener("host:event", listener);
	},
	onEvent: (callback) => {
		const listener = (_event, data) => callback(data);
		electron.ipcRenderer.on("engine:event", listener);
		return () => electron.ipcRenderer.removeListener("engine:event", listener);
	},
	getInfo: () => electron.ipcRenderer.invoke("app:info"),
	openExternal: (url) => electron.ipcRenderer.invoke("app:open-external", url),
	showItemInFolder: (path) => electron.ipcRenderer.invoke("app:show-item", path),
	openTaskFile: (id) => electron.ipcRenderer.invoke("app:open-task-file", id),
	openExtensionFolder: () => electron.ipcRenderer.invoke("app:open-extension-folder"),
	openLogs: () => electron.ipcRenderer.invoke("app:open-logs"),
	selectDirectory: (defaultPath) => electron.ipcRenderer.invoke("dialog:select-directory", defaultPath),
	confirm: (body) => electron.ipcRenderer.invoke("dialog:confirm", body),
	bridgeInfo: () => electron.ipcRenderer.invoke("bridge:info"),
	bridgeTest: () => electron.ipcRenderer.invoke("bridge:test"),
	readClipboard: () => electron.ipcRenderer.invoke("clipboard:read"),
	getTask: (id) => electron.ipcRenderer.invoke("engine:request", {
		command: "tasks.get",
		payload: { id }
	})
});
