const require_rolldown_runtime = require("./chunks/rolldown-runtime-CmQyd0Gu.js");
let node_crypto = require("node:crypto");
let node_fs = require("node:fs");
let node_os = require("node:os");
let node_path = require("node:path");
node_path = require_rolldown_runtime.__toESM(node_path);
let zod = require("zod");
let node_fs_promises = require("node:fs/promises");
let undici = require("undici");
// src/shared/settings.ts
var settingsSchema = zod.z.object({
	defaultDownloadDir: zod.z.string().min(1),
	maxConcurrentDownloads: zod.z.number().int().min(1).max(16),
	maxConnectionsPerTask: zod.z.number().int().min(1).max(16),
	globalSpeedLimitKib: zod.z.number().int().min(0).max(1e7),
	perTaskSpeedLimitKib: zod.z.number().int().min(0).max(1e7),
	retryCount: zod.z.number().int().min(0).max(20),
	resumeOnStartup: zod.z.boolean(),
	clipboardMonitoring: zod.z.boolean(),
	notifications: zod.z.boolean(),
	theme: zod.z.enum([
		"system",
		"light",
		"dark"
	]),
	proxyMode: zod.z.enum([
		"system",
		"direct",
		"manual"
	]),
	proxyUrl: zod.z.string(),
	proxyBypass: zod.z.string(),
	userAgent: zod.z.string().max(512),
	autoStart: zod.z.boolean(),
	minimizeToTray: zod.z.boolean(),
	confirmDelete: zod.z.boolean(),
	historyRetentionDays: zod.z.number().int().min(0).max(3650),
	logLevel: zod.z.enum([
		"error",
		"warn",
		"info",
		"debug"
	]),
	bridgeEnabled: zod.z.boolean(),
	bridgePort: zod.z.number().int().min(1024).max(65535),
	segmentThresholdMib: zod.z.number().int().min(1).max(1024)
});
var defaultSettings = (downloadsDir) => ({
	defaultDownloadDir: downloadsDir,
	maxConcurrentDownloads: 3,
	maxConnectionsPerTask: 4,
	globalSpeedLimitKib: 0,
	perTaskSpeedLimitKib: 0,
	retryCount: 3,
	resumeOnStartup: true,
	clipboardMonitoring: false,
	notifications: true,
	theme: "system",
	proxyMode: "system",
	proxyUrl: "",
	proxyBypass: "",
	userAgent: "",
	autoStart: false,
	minimizeToTray: true,
	confirmDelete: true,
	historyRetentionDays: 90,
	logLevel: "info",
	bridgeEnabled: true,
	bridgePort: 47831,
	segmentThresholdMib: 8
});
// src/engine/categories.ts
var DEFAULTS = [
	{
		id: "cat-compressed",
		name: "Compressés",
		folder: "Compresses",
		extensions: [
			"zip",
			"rar",
			"7z",
			"tar",
			"gz",
			"bz2",
			"xz",
			"zst",
			"iso"
		]
	},
	{
		id: "cat-documents",
		name: "Documents",
		folder: "Documents",
		extensions: [
			"pdf",
			"doc",
			"docx",
			"xls",
			"xlsx",
			"ppt",
			"pptx",
			"odt",
			"ods",
			"txt",
			"rtf",
			"epub",
			"csv"
		]
	},
	{
		id: "cat-music",
		name: "Musique",
		folder: "Musique",
		extensions: [
			"mp3",
			"flac",
			"wav",
			"ogg",
			"m4a",
			"aac",
			"opus",
			"wma"
		]
	},
	{
		id: "cat-programs",
		name: "Programmes",
		folder: "Programmes",
		extensions: [
			"exe",
			"msi",
			"msix",
			"deb",
			"rpm",
			"appimage",
			"dmg",
			"pkg",
			"apk",
			"jar"
		]
	},
	{
		id: "cat-video",
		name: "Vidéos",
		folder: "Videos",
		extensions: [
			"mp4",
			"mkv",
			"avi",
			"mov",
			"webm",
			"flv",
			"wmv",
			"m4v",
			"ts"
		]
	},
	{
		id: "cat-images",
		name: "Images",
		folder: "Images",
		extensions: [
			"jpg",
			"jpeg",
			"png",
			"gif",
			"webp",
			"bmp",
			"svg",
			"tiff",
			"avif"
		]
	},
	{
		id: "cat-other",
		name: "Autres",
		folder: "Autres",
		extensions: []
	}
];
function parseList(value) {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}
function toCategory(row) {
	return {
		id: row.id,
		name: row.name,
		dir: row.dir,
		extensions: parseList(row.extensions),
		domains: parseList(row.domains),
		builtin: row.builtin === 1
	};
}
function domainMatches(hostname, patterns) {
	const host = hostname.toLowerCase();
	return patterns.some((pattern) => {
		const normalized = pattern.trim().toLowerCase();
		if (!normalized) return false;
		if (normalized.startsWith("*.")) {
			const suffix = normalized.slice(2);
			return host === suffix || host.endsWith(`.${suffix}`);
		}
		return host === normalized;
	});
}
var CategoryService = class {
	db;
	downloadsRoot;
	constructor(db, downloadsRoot) {
		this.db = db;
		this.downloadsRoot = downloadsRoot;
		if (this.db.listCategories().length === 0) this.seed();
	}
	seed() {
		for (const item of DEFAULTS) this.db.insertCategory({
			id: item.id,
			name: item.name,
			dir: node_path.default.join(this.downloadsRoot, item.folder),
			extensions: JSON.stringify(item.extensions),
			domains: "[]",
			builtin: 1
		});
	}
	list() {
		return this.db.listCategories().map(toCategory);
	}
	get(id) {
		const row = this.db.listCategories().find((item) => item.id === id);
		return row ? toCategory(row) : null;
	}
	match(fileName, url) {
		const categories = this.list();
		let hostname = "";
		try {
			hostname = new URL(url).hostname;
		} catch {}
		if (hostname) {
			const byDomain = categories.find((category) => domainMatches(hostname, category.domains));
			if (byDomain) return byDomain;
		}
		const extension = node_path.default.extname(fileName).replace(/^\./, "").toLowerCase();
		if (extension) {
			const byExtension = categories.find((category) => category.extensions.includes(extension));
			if (byExtension) return byExtension;
		}
		return categories.find((category) => category.id === "cat-other") ?? categories[categories.length - 1];
	}
	resolveDirectory(categoryId, fallback) {
		if (!categoryId) return fallback;
		return this.get(categoryId)?.dir || fallback;
	}
};
// src/engine/db.ts
var SCHEMA_VERSION = 1;
var TASK_FIELDS = [
	["url", "url"],
	["finalUrl", "final_url"],
	["fileName", "file_name"],
	["destDir", "dest_dir"],
	["tempPath", "temp_path"],
	["categoryId", "category_id"],
	["queueId", "queue_id"],
	["status", "status"],
	["totalBytes", "total_bytes"],
	["receivedBytes", "received_bytes"],
	["resumable", "resumable"],
	["etag", "etag"],
	["lastModified", "last_modified"],
	["contentType", "content_type"],
	["createdAt", "created_at"],
	["startedAt", "started_at"],
	["completedAt", "completed_at"],
	["errorCode", "error_code"],
	["errorMessage", "error_message"],
	["priority", "priority"],
	["connections", "connections"],
	["speedLimit", "speed_limit"],
	["checksumExpected", "checksum_expected"],
	["checksumActual", "checksum_actual"],
	["description", "description"],
	["updatedAt", "updated_at"]
];
function mapTask(row) {
	return {
		id: String(row.id),
		url: String(row.url),
		finalUrl: row.final_url === null ? null : String(row.final_url),
		fileName: String(row.file_name),
		destDir: String(row.dest_dir),
		tempPath: String(row.temp_path),
		categoryId: row.category_id === null ? null : String(row.category_id),
		queueId: row.queue_id === null ? null : String(row.queue_id),
		status: String(row.status),
		totalBytes: row.total_bytes === null ? null : Number(row.total_bytes),
		receivedBytes: Number(row.received_bytes ?? 0),
		resumable: Number(row.resumable ?? 0),
		etag: row.etag === null ? null : String(row.etag),
		lastModified: row.last_modified === null ? null : String(row.last_modified),
		contentType: row.content_type === null ? null : String(row.content_type),
		createdAt: String(row.created_at),
		startedAt: row.started_at === null ? null : String(row.started_at),
		completedAt: row.completed_at === null ? null : String(row.completed_at),
		errorCode: row.error_code === null ? null : String(row.error_code),
		errorMessage: row.error_message === null ? null : String(row.error_message),
		priority: Number(row.priority ?? 0),
		connections: Number(row.connections ?? 1),
		speedLimit: Number(row.speed_limit ?? 0),
		checksumExpected: row.checksum_expected === null ? null : String(row.checksum_expected),
		checksumActual: row.checksum_actual === null ? null : String(row.checksum_actual),
		description: String(row.description ?? ""),
		updatedAt: String(row.updated_at)
	};
}
function mapSegment(row) {
	return {
		id: String(row.id),
		taskId: String(row.task_id),
		idx: Number(row.idx),
		startOffset: Number(row.start_offset),
		endOffset: Number(row.end_offset),
		position: Number(row.position),
		status: String(row.status),
		updatedAt: String(row.updated_at)
	};
}
function mapQueue(row) {
	return {
		id: String(row.id),
		name: String(row.name),
		kind: String(row.kind),
		concurrency: Number(row.concurrency),
		status: String(row.status),
		createdAt: String(row.created_at)
	};
}
function mapSchedule(row) {
	return {
		id: String(row.id),
		queueId: String(row.queue_id),
		mode: String(row.mode),
		startAt: row.start_at === null ? null : String(row.start_at),
		stopAt: row.stop_at === null ? null : String(row.stop_at),
		daysMask: row.days_mask === null ? null : Number(row.days_mask),
		intervalMinutes: row.interval_minutes === null ? null : Number(row.interval_minutes),
		retries: Number(row.retries ?? 0),
		enabled: Number(row.enabled ?? 0),
		nextRunAt: row.next_run_at === null ? null : String(row.next_run_at),
		lastRunAt: row.last_run_at === null ? null : String(row.last_run_at),
		action: String(row.action ?? "none"),
		actionTarget: row.action_target === null ? null : String(row.action_target)
	};
}
var Database = class Database {
	db;
	constructor(db) {
		this.db = db;
	}
	static open(filePath, logger) {
		(0, node_fs.mkdirSync)(node_path.default.dirname(filePath), { recursive: true });
		try {
			return Database.openInternal(filePath, logger);
		} catch (error) {
			const backup = `${filePath}.corrupt-${Date.now()}`;
			logger.error("db.open.failed", {
				message: error instanceof Error ? error.message : String(error),
				backup
			});
			if ((0, node_fs.existsSync)(filePath)) (0, node_fs.renameSync)(filePath, backup);
			const database = Database.openInternal(filePath, logger);
			database.setSetting("db.lastRecovery", {
				at: (/* @__PURE__ */ new Date()).toISOString(),
				backup,
				message: error instanceof Error ? error.message : String(error)
			});
			return database;
		}
	}
	static openInternal(filePath, logger) {
		const db = new (process.getBuiltinModule("node:sqlite")).DatabaseSync(filePath);
		db.exec("PRAGMA journal_mode = WAL");
		db.exec("PRAGMA synchronous = NORMAL");
		db.exec("PRAGMA foreign_keys = ON");
		db.exec("PRAGMA busy_timeout = 5000");
		const database = new Database(db);
		database.migrate(logger);
		return database;
	}
	migrate(logger) {
		const row = this.db.prepare("PRAGMA user_version").get();
		const version = Number(row.user_version ?? 0);
		if (version >= SCHEMA_VERSION) return;
		logger.info("db.migrate", {
			from: version,
			to: SCHEMA_VERSION
		});
		this.db.exec("BEGIN");
		try {
			if (version < 1) this.db.exec(`
          CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            final_url TEXT,
            file_name TEXT NOT NULL,
            dest_dir TEXT NOT NULL,
            temp_path TEXT NOT NULL,
            category_id TEXT,
            queue_id TEXT,
            status TEXT NOT NULL,
            total_bytes INTEGER,
            received_bytes INTEGER NOT NULL DEFAULT 0,
            resumable INTEGER NOT NULL DEFAULT 0,
            etag TEXT,
            last_modified TEXT,
            content_type TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            error_code TEXT,
            error_message TEXT,
            priority INTEGER NOT NULL DEFAULT 0,
            connections INTEGER NOT NULL DEFAULT 1,
            speed_limit INTEGER NOT NULL DEFAULT 0,
            checksum_expected TEXT,
            checksum_actual TEXT,
            description TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS segments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            idx INTEGER NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            position INTEGER NOT NULL,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(task_id, idx)
          );

          CREATE TABLE IF NOT EXISTS queues (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL DEFAULT 'download',
            concurrency INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'stopped',
            created_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS queue_items (
            queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            PRIMARY KEY(queue_id, task_id)
          );

          CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
            mode TEXT NOT NULL,
            start_at TEXT,
            stop_at TEXT,
            days_mask INTEGER,
            interval_minutes INTEGER,
            retries INTEGER NOT NULL DEFAULT 3,
            enabled INTEGER NOT NULL DEFAULT 1,
            next_run_at TEXT,
            last_run_at TEXT,
            action TEXT NOT NULL DEFAULT 'none',
            action_target TEXT
          );

          CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            dir TEXT NOT NULL,
            extensions TEXT NOT NULL,
            domains TEXT NOT NULL,
            builtin INTEGER NOT NULL DEFAULT 0
          );

          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            task_id TEXT,
            event TEXT NOT NULL,
            at TEXT NOT NULL,
            detail_json TEXT
          );

          CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
          CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
          CREATE INDEX IF NOT EXISTS idx_history_at ON history(at);
        `);
			this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	close() {
		this.db.close();
	}
	insertTask(task) {
		const columns = ["id", ...TASK_FIELDS.map(([, column]) => column)];
		const placeholders = columns.map(() => "?").join(", ");
		const values = [task.id, ...TASK_FIELDS.map(([key]) => this.toSqlite(task[key]))];
		this.db.prepare(`INSERT INTO tasks (${columns.join(", ")}) VALUES (${placeholders})`).run(...values);
	}
	updateTask(id, patch) {
		const entries = TASK_FIELDS.filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key));
		if (entries.length === 0) return;
		const assignments = entries.map(([, column]) => `${column} = ?`).join(", ");
		const values = entries.map(([key]) => this.toSqlite(patch[key]));
		this.db.prepare(`UPDATE tasks SET ${assignments} WHERE id = ?`).run(...values, id);
	}
	getTask(id) {
		const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
		return row ? mapTask(row) : null;
	}
	listTasks() {
		return this.db.prepare("SELECT * FROM tasks ORDER BY created_at ASC").all().map(mapTask);
	}
	deleteTask(id) {
		this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
	}
	countTasksByStatus(status) {
		const row = this.db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = ?").get(status);
		return Number(row?.count ?? 0);
	}
	replaceSegments(taskId, segments) {
		this.db.exec("BEGIN");
		try {
			this.db.prepare("DELETE FROM segments WHERE task_id = ?").run(taskId);
			const stmt = this.db.prepare("INSERT INTO segments (id, task_id, idx, start_offset, end_offset, position, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
			for (const segment of segments) stmt.run(segment.id, taskId, segment.idx, segment.startOffset, segment.endOffset, segment.position, segment.status, segment.updatedAt);
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	listSegments(taskId) {
		return this.db.prepare("SELECT * FROM segments WHERE task_id = ? ORDER BY idx ASC").all(taskId).map(mapSegment);
	}
	updateSegmentPosition(id, position, status) {
		this.db.prepare("UPDATE segments SET position = ?, status = ?, updated_at = ? WHERE id = ?").run(position, status, (/* @__PURE__ */ new Date()).toISOString(), id);
	}
	insertQueue(queue) {
		this.db.prepare("INSERT INTO queues (id, name, kind, concurrency, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(queue.id, queue.name, queue.kind, queue.concurrency, queue.status, queue.createdAt);
	}
	updateQueue(id, patch) {
		const entries = [
			["name", "name"],
			["kind", "kind"],
			["concurrency", "concurrency"],
			["status", "status"]
		].filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key));
		if (entries.length === 0) return;
		const assignments = entries.map(([, column]) => `${column} = ?`).join(", ");
		const values = entries.map(([key]) => this.toSqlite(patch[key]));
		this.db.prepare(`UPDATE queues SET ${assignments} WHERE id = ?`).run(...values, id);
	}
	listQueues() {
		return this.db.prepare("SELECT * FROM queues ORDER BY created_at ASC").all().map(mapQueue);
	}
	getQueue(id) {
		const row = this.db.prepare("SELECT * FROM queues WHERE id = ?").get(id);
		return row ? mapQueue(row) : null;
	}
	deleteQueue(id) {
		this.db.prepare("DELETE FROM queues WHERE id = ?").run(id);
	}
	setQueueTasks(queueId, taskIds) {
		this.db.exec("BEGIN");
		try {
			this.db.prepare("DELETE FROM queue_items WHERE queue_id = ?").run(queueId);
			const stmt = this.db.prepare("INSERT INTO queue_items (queue_id, task_id, position) VALUES (?, ?, ?)");
			taskIds.forEach((taskId, index) => stmt.run(queueId, taskId, index));
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}
	listQueueTaskIds(queueId) {
		return this.db.prepare("SELECT task_id FROM queue_items WHERE queue_id = ? ORDER BY position ASC").all(queueId).map((row) => row.task_id);
	}
	listSchedules() {
		return this.db.prepare("SELECT * FROM schedules").all().map(mapSchedule);
	}
	getSchedule(id) {
		const row = this.db.prepare("SELECT * FROM schedules WHERE id = ?").get(id);
		return row ? mapSchedule(row) : null;
	}
	upsertSchedule(schedule) {
		this.db.prepare(`INSERT INTO schedules (id, queue_id, mode, start_at, stop_at, days_mask, interval_minutes, retries, enabled, next_run_at, last_run_at, action, action_target)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           queue_id = excluded.queue_id, mode = excluded.mode, start_at = excluded.start_at,
           stop_at = excluded.stop_at, days_mask = excluded.days_mask, interval_minutes = excluded.interval_minutes,
           retries = excluded.retries, enabled = excluded.enabled, next_run_at = excluded.next_run_at,
           last_run_at = excluded.last_run_at, action = excluded.action, action_target = excluded.action_target`).run(schedule.id, schedule.queueId, schedule.mode, schedule.startAt, schedule.stopAt, schedule.daysMask, schedule.intervalMinutes, schedule.retries, schedule.enabled, schedule.nextRunAt, schedule.lastRunAt, schedule.action, schedule.actionTarget);
	}
	deleteSchedule(id) {
		this.db.prepare("DELETE FROM schedules WHERE id = ?").run(id);
	}
	listCategories() {
		return this.db.prepare("SELECT * FROM categories ORDER BY name ASC").all();
	}
	insertCategory(category) {
		this.db.prepare("INSERT INTO categories (id, name, dir, extensions, domains, builtin) VALUES (?, ?, ?, ?, ?, ?)").run(category.id, category.name, category.dir, category.extensions, category.domains, category.builtin);
	}
	updateCategory(id, patch) {
		const entries = [
			["name", "name"],
			["dir", "dir"],
			["extensions", "extensions"],
			["domains", "domains"]
		].filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key));
		if (entries.length === 0) return;
		const assignments = entries.map(([, column]) => `${column} = ?`).join(", ");
		const values = entries.map(([key]) => this.toSqlite(patch[key]));
		this.db.prepare(`UPDATE categories SET ${assignments} WHERE id = ?`).run(...values, id);
	}
	deleteCategory(id) {
		this.db.prepare("DELETE FROM categories WHERE id = ? AND builtin = 0").run(id);
	}
	getSetting(key) {
		const row = this.db.prepare("SELECT value_json FROM settings WHERE key = ?").get(key);
		if (!row) return null;
		try {
			return JSON.parse(row.value_json);
		} catch {
			return null;
		}
	}
	setSetting(key, value) {
		this.db.prepare("INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at").run(key, JSON.stringify(value), (/* @__PURE__ */ new Date()).toISOString());
	}
	addHistory(event, taskId, detail = null) {
		this.db.prepare("INSERT INTO history (id, task_id, event, at, detail_json) VALUES (?, ?, ?, ?, ?)").run((0, node_crypto.randomUUID)(), taskId, event, (/* @__PURE__ */ new Date()).toISOString(), detail === null ? null : JSON.stringify(detail));
	}
	listHistory(limit = 200) {
		return this.db.prepare("SELECT * FROM history ORDER BY at DESC LIMIT ?").all(limit);
	}
	purgeHistory(before) {
		const result = this.db.prepare("DELETE FROM history WHERE at < ?").run(before);
		return Number(result.changes ?? 0);
	}
	toSqlite(value) {
		if (value === void 0 || value === null) return null;
		if (typeof value === "boolean") return value ? 1 : 0;
		if (typeof value === "number") return value;
		return String(value);
	}
};
// src/engine/logger.ts
var LEVEL_WEIGHT = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3
};
var SECRET_KEYS = /token|password|secret|authorization|cookie/i;
function redact(value, depth = 0) {
	if (depth > 5) return "[profondeur]";
	if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
	if (value && typeof value === "object") {
		const result = {};
		for (const [key, item] of Object.entries(value)) result[key] = SECRET_KEYS.test(key) ? "[expurgé]" : redact(item, depth + 1);
		return result;
	}
	if (typeof value === "string" && value.length > 2e3) return `${value.slice(0, 2e3)}…`;
	return value;
}
var Logger = class {
	file;
	level;
	constructor(logDir, level = "info") {
		this.level = level;
		(0, node_fs.mkdirSync)(logDir, { recursive: true });
		this.file = node_path.default.join(logDir, "tdm.log");
		this.rotateIfNeeded();
	}
	setLevel(level) {
		this.level = level;
	}
	error(event, detail) {
		this.write("error", event, detail);
	}
	warn(event, detail) {
		this.write("warn", event, detail);
	}
	info(event, detail) {
		this.write("info", event, detail);
	}
	debug(event, detail) {
		this.write("debug", event, detail);
	}
	write(level, event, detail) {
		if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[this.level]) return;
		const line = JSON.stringify({
			ts: (/* @__PURE__ */ new Date()).toISOString(),
			level,
			event,
			detail: detail === void 0 ? void 0 : redact(detail)
		});
		if (level === "error") console.error(`[tdm] ${event}`, detail ?? "");
		else if (level === "warn") console.warn(`[tdm] ${event}`, detail ?? "");
		else console.log(`[tdm] ${event}`, detail ?? "");
		try {
			(0, node_fs.appendFileSync)(this.file, `${line}\n`, {
				encoding: "utf8",
				mode: 384
			});
		} catch {}
	}
	rotateIfNeeded() {
		try {
			if ((0, node_fs.existsSync)(this.file) && (0, node_fs.statSync)(this.file).size > 10485760) (0, node_fs.renameSync)(this.file, `${this.file}.1`);
		} catch {}
	}
};
// src/engine/paths.ts
var WINDOWS_RESERVED = /* @__PURE__ */ new Set([
	"con",
	"prn",
	"aux",
	"nul",
	"com1",
	"com2",
	"com3",
	"com4",
	"com5",
	"com6",
	"com7",
	"com8",
	"com9",
	"lpt1",
	"lpt2",
	"lpt3",
	"lpt4",
	"lpt5",
	"lpt6",
	"lpt7",
	"lpt8",
	"lpt9"
]);
var CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
var ILLEGAL_CHARS = /[<>:"/\\|?*]/g;
function sanitizeFileName(input, fallback = "telechargement") {
	let name = input.normalize("NFC").replace(CONTROL_CHARS, "").replace(ILLEGAL_CHARS, "_");
	name = name.replace(/\s+/g, " ").trim();
	name = name.replace(/[. ]+$/g, "");
	if (!name || name === "." || name === "..") return fallback;
	const extension = node_path.default.extname(name);
	const stem = extension ? name.slice(0, -extension.length) : name;
	if (WINDOWS_RESERVED.has(stem.toLowerCase())) name = `${stem}_${extension}`;
	if (name.length > 180) {
		const ext = node_path.default.extname(name).slice(0, 20);
		name = `${name.slice(0, 180 - ext.length)}${ext}`;
	}
	return name || fallback;
}
function fileNameFromUrl(url) {
	try {
		const last = new URL(url).pathname.split("/").filter(Boolean).pop();
		if (!last) return null;
		return sanitizeFileName(decodeURIComponent(last));
	} catch {
		return null;
	}
}
function fileNameFromContentDisposition(value) {
	if (!value) return null;
	const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(value);
	if (utf8?.[1]) try {
		return sanitizeFileName(decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, "")));
	} catch {}
	const plain = /filename\s*=\s*("([^"]+)"|([^;]+))/i.exec(value);
	const raw = plain?.[2] ?? plain?.[3];
	if (!raw) return null;
	return sanitizeFileName(raw.trim());
}
function isPathInside(child, parent) {
	const relative = node_path.default.relative(node_path.default.resolve(parent), node_path.default.resolve(child));
	return relative === "" || !relative.startsWith("..") && !node_path.default.isAbsolute(relative);
}
async function uniqueFilePath(dir, fileName) {
	const { access } = await import("node:fs/promises");
	const parsed = node_path.default.parse(fileName);
	let candidate = node_path.default.join(dir, fileName);
	let counter = 1;
	while (true) try {
		await access(candidate);
		candidate = node_path.default.join(dir, `${parsed.name} (${counter})${parsed.ext}`);
		counter += 1;
		if (counter > 9999) throw new Error("Impossible de trouver un nom de fichier libre");
	} catch {
		return candidate;
	}
}
// src/engine/http.ts
var MAX_REDIRECTS = 8;
var PROBE_TIMEOUT_MS = 25e3;
var HttpError = class extends Error {
	code;
	status;
	constructor(code, message, status) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "HttpError";
	}
};
function assertHttpUrl(input) {
	let parsed;
	try {
		parsed = new URL(input);
	} catch {
		throw new HttpError("TDM-E-URL", "URL invalide.");
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new HttpError("TDM-E-URL-SCHEME", "Seules les URL HTTP et HTTPS sont prises en charge.");
	if (!parsed.hostname) throw new HttpError("TDM-E-URL-HOST", "URL sans nom d’hôte.");
	return parsed;
}
function bypassesProxy(hostname, bypass) {
	if (!bypass.trim()) return false;
	return bypass.split(/[,;]/).map((item) => item.trim().toLowerCase()).filter(Boolean).some((pattern) => {
		if (pattern === "*") return true;
		const normalized = pattern.replace(/^\./, "");
		return hostname === normalized || hostname.endsWith(`.${normalized}`);
	});
}
var cachedKey = "";
var cachedAgent;
function dispatcherFor(settings, url) {
	const hostname = new URL(url).hostname;
	if (settings.proxyMode === "direct") return void 0;
	if (settings.proxyMode === "system") {
		if (cachedKey !== "system") {
			cachedKey = "system";
			cachedAgent = new undici.EnvHttpProxyAgent();
		}
		return cachedAgent;
	}
	if (settings.proxyMode === "manual") {
		if (!settings.proxyUrl.trim()) return void 0;
		if (bypassesProxy(hostname, settings.proxyBypass)) return void 0;
		const key = `manual:${settings.proxyUrl}`;
		if (cachedKey !== key) {
			cachedKey = key;
			try {
				cachedAgent = new undici.ProxyAgent(settings.proxyUrl);
			} catch {
				cachedAgent = void 0;
			}
		}
		return cachedAgent;
	}
}
function baseHeaders(settings) {
	return {
		"user-agent": settings.userAgent.trim() || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36 TDM/0.1",
		accept: "*/*",
		"accept-encoding": "identity"
	};
}
function filenameFromDisposition(value) {
	return fileNameFromContentDisposition(value ?? null);
}
function parseContentRange(value) {
	if (!value) return null;
	const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());
	if (!match) return null;
	return {
		start: Number(match[1]),
		end: Number(match[2]),
		total: match[3] === "*" ? null : Number(match[3])
	};
}
function discardBody(response) {
	const body = response.body;
	if (body.destroyed || body.readableEnded) return;
	body.on("error", () => void 0);
	body.destroy();
}
async function followRedirects(url, settings, init) {
	let current = assertHttpUrl(url).toString();
	const redirects = [];
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const dispatcher = dispatcherFor(settings, current);
		let response;
		try {
			response = await (0, undici.request)(current, {
				method: init.method,
				headers: {
					...baseHeaders(settings),
					...init.headers ?? {}
				},
				dispatcher,
				signal: init.signal,
				headersTimeout: init.headersTimeout ?? PROBE_TIMEOUT_MS,
				bodyTimeout: init.bodyTimeout ?? 12e4
			});
		} catch (error) {
			if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new HttpError("TDM-E-TIMEOUT", "Le serveur ne répond pas (délai dépassé).");
			throw new HttpError("TDM-E-NETWORK", `Connexion impossible : ${error instanceof Error ? error.message : String(error)}`);
		}
		if (response.statusCode >= 300 && response.statusCode < 400) {
			const location = response.headers.location;
			discardBody(response);
			if (!location) throw new HttpError("TDM-E-REDIRECT", "Redirection sans destination.", response.statusCode);
			redirects.push(current);
			current = new URL(String(location), current).toString();
			assertHttpUrl(current);
			continue;
		}
		return {
			response,
			finalUrl: current,
			redirects,
			dispatcher
		};
	}
	throw new HttpError("TDM-E-REDIRECT-LOOP", "Trop de redirections.");
}
function buildProbe(url, finalUrl, status, headers, contentLength, acceptRanges, redirects) {
	const header = (name) => {
		const value = headers[name];
		if (Array.isArray(value)) return value.join(", ");
		return value === void 0 ? void 0 : String(value);
	};
	const contentType = header("content-type") ?? null;
	const suggested = filenameFromDisposition(header("content-disposition")) ?? fileNameFromUrl(finalUrl);
	return {
		url,
		finalUrl,
		status,
		contentType,
		contentLength,
		acceptRanges,
		etag: header("etag") ?? null,
		lastModified: header("last-modified") ?? null,
		suggestedFileName: suggested,
		resumable: acceptRanges && contentLength !== null && contentLength > 0,
		redirects
	};
}
/**
* Inspecte une URL sans télécharger le corps. HEAD d'abord, puis une requête
* Range: bytes=0-0 pour les serveurs qui refusent HEAD ou n'annoncent pas la taille.
*/
async function probe(url, settings, signal) {
	const head = await followRedirects(url, settings, {
		method: "HEAD",
		signal
	});
	const headHeaders = head.response.headers;
	const lengthHeader = head.response.headers["content-length"];
	const headLength = lengthHeader ? Number(lengthHeader) : null;
	const headRanges = String(head.response.headers["accept-ranges"] ?? "").toLowerCase().includes("bytes");
	discardBody(head.response);
	if (head.response.statusCode >= 200 && head.response.statusCode < 300 && headLength !== null && Number.isFinite(headLength) && headLength > 0) return buildProbe(url, head.finalUrl, head.response.statusCode, headHeaders, headLength, headRanges, head.redirects);
	const get = await followRedirects(url, settings, {
		method: "GET",
		headers: { range: "bytes=0-0" },
		signal
	});
	const getHeaders = get.response.headers;
	if (get.response.statusCode === 416) {
		discardBody(get.response);
		const range = parseContentRange(String(get.response.headers["content-range"] ?? ""));
		return buildProbe(url, get.finalUrl, get.response.statusCode, getHeaders, range?.total ?? 0, true, get.redirects);
	}
	if (get.response.statusCode < 200 || get.response.statusCode >= 300) {
		discardBody(get.response);
		throw new HttpError("TDM-E-HTTP", `Le serveur a refusé la requête (HTTP ${get.response.statusCode}).`, get.response.statusCode);
	}
	const contentRange = parseContentRange(String(get.response.headers["content-range"] ?? ""));
	const acceptRanges = get.response.statusCode === 206 || String(get.response.headers["accept-ranges"] ?? "").toLowerCase().includes("bytes");
	const contentLength = contentRange?.total ?? (get.response.statusCode === 200 && getHeaders["content-length"] ? Number(getHeaders["content-length"]) : null);
	discardBody(get.response);
	return buildProbe(url, get.finalUrl, get.response.statusCode, getHeaders, contentLength !== null && Number.isFinite(contentLength) ? contentLength : null, acceptRanges, get.redirects);
}
function openStream(url, settings, options) {
	const headers = {};
	if (options.rangeStart !== void 0) headers.range = `bytes=${options.rangeStart}-${options.rangeEnd ?? ""}`;
	if (options.ifRange) headers["if-range"] = options.ifRange;
	if (options.referrer) headers.referer = options.referrer;
	return followRedirects(url, settings, {
		method: "GET",
		headers,
		signal: options.signal,
		headersTimeout: options.timeoutMs ?? 3e4
	});
}
function parseContentRangeHeader(value) {
	return parseContentRange(value);
}
// src/engine/downloader.ts
var MIN_SEGMENT_BYTES = 1048576;
var FLUSH_INTERVAL_MS = 500;
var PROGRESS_INTERVAL_MS = 300;
var RestartSequential = class extends Error {};
function planSegments(taskId, totalBytes, connections, thresholdBytes) {
	if (!Number.isFinite(totalBytes) || totalBytes <= 0) return [];
	const safeConnections = Math.max(1, Math.min(16, Math.floor(connections)));
	const bySize = Math.floor(totalBytes / MIN_SEGMENT_BYTES);
	const count = Math.max(1, Math.min(safeConnections, bySize));
	if (totalBytes < thresholdBytes || count <= 1) return [makeSegment(taskId, 0, 0, totalBytes - 1)];
	const base = Math.floor(totalBytes / count);
	const segments = [];
	let start = 0;
	for (let index = 0; index < count; index += 1) {
		const end = index === count - 1 ? totalBytes - 1 : start + base - 1;
		segments.push(makeSegment(taskId, index, start, end));
		start = end + 1;
	}
	return segments;
}
function makeSegment(taskId, idx, start, end, position = start) {
	return {
		id: (0, node_crypto.randomUUID)(),
		taskId,
		idx,
		startOffset: start,
		endOffset: end,
		position,
		status: position > start ? "partial" : "pending",
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function delay(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException("Aborted", "AbortError"));
			return;
		}
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
var DownloadJob = class {
	taskId;
	db;
	logger;
	hooks;
	aborter = new AbortController();
	paused = false;
	cancelled = false;
	total = null;
	resumable = false;
	positions = /* @__PURE__ */ new Map();
	segmentStarts = /* @__PURE__ */ new Map();
	lastFlush = 0;
	lastProgress = 0;
	lastEmittedBytes = 0;
	startedAt = (/* @__PURE__ */ new Date()).toISOString();
	constructor(taskId, db, logger, hooks) {
		this.taskId = taskId;
		this.db = db;
		this.logger = logger;
		this.hooks = hooks;
	}
	pause() {
		if (this.cancelled) return;
		this.paused = true;
		this.aborter.abort();
	}
	cancel() {
		this.cancelled = true;
		this.aborter.abort();
	}
	async run() {
		const task = this.db.getTask(this.taskId);
		if (!task) return "failed";
		try {
			this.setStatus(task, "probing", {
				startedAt: this.startedAt,
				error: null,
				completedAt: null
			});
			const settings = this.hooks.settings();
			const result = await probe(task.finalUrl || task.url, settings, this.aborter.signal);
			if (this.cancelled || this.paused) throw new DOMException("Aborted", "AbortError");
			this.total = result.contentLength;
			this.resumable = result.resumable;
			this.db.updateTask(task.id, {
				finalUrl: result.finalUrl,
				totalBytes: result.contentLength,
				resumable: result.resumable ? 1 : 0,
				etag: result.etag,
				lastModified: result.lastModified,
				contentType: result.contentType,
				errorCode: null,
				errorMessage: null
			});
			if (!task.fileName && result.suggestedFileName) {
				task.fileName = result.suggestedFileName;
				this.db.updateTask(task.id, { fileName: result.suggestedFileName });
			}
			const previousSegments = this.db.listSegments(task.id);
			const sameShape = previousSegments.length > 0 && task.totalBytes === result.contentLength && (task.etag ?? null) === (result.etag ?? null) && (task.lastModified ?? null) === (result.lastModified ?? null) && previousSegments.every((segment) => segment.position >= segment.startOffset);
			const existingTemp = await (0, node_fs_promises.stat)(task.tempPath).catch(() => null);
			const reusable = sameShape && existingTemp !== null && (this.resumable || previousSegments.length === 1) && previousSegments.every((segment) => segment.position <= segment.endOffset + 1);
			let segments = reusable ? previousSegments.map((segment) => ({
				...segment,
				position: Math.min(segment.position, segment.endOffset + 1)
			})) : this.resumable ? planSegments(task.id, result.contentLength ?? 0, task.connections, settings.segmentThresholdMib * 1024 * 1024) : result.contentLength !== null && result.contentLength > 0 ? [makeSegment(task.id, 0, 0, result.contentLength - 1)] : [];
			if (!this.resumable && result.contentLength === null) segments = [makeSegment(task.id, 0, 0, Number.MAX_SAFE_INTEGER)];
			this.db.replaceSegments(task.id, segments);
			this.segmentStarts.clear();
			for (const segment of segments) {
				this.positions.set(segment.id, segment.position);
				this.segmentStarts.set(segment.id, segment.startOffset);
			}
			await (0, node_fs_promises.mkdir)(task.destDir, { recursive: true });
			const handle = await (0, node_fs_promises.open)(task.tempPath, reusable ? "r+" : "w+");
			try {
				if (!reusable) await handle.truncate(0);
				if (this.total !== null && this.total >= 0) await handle.truncate(this.total);
				this.setStatus(task, "downloading", {});
				this.flush(task, true);
				if (segments.length === 0) return await this.finalize(task) ? "completed" : "needs_attention";
				try {
					await this.runSegments(task, segments, handle);
				} catch (error) {
					if (error instanceof RestartSequential) {
						this.logger.warn("download.sequential-fallback", { taskId: task.id });
						this.resumable = false;
						const fallback = result.contentLength !== null && result.contentLength > 0 ? [makeSegment(task.id, 0, 0, result.contentLength - 1)] : [makeSegment(task.id, 0, 0, Number.MAX_SAFE_INTEGER)];
						this.db.updateTask(task.id, { resumable: 0 });
						this.db.replaceSegments(task.id, fallback);
						this.positions.clear();
						this.segmentStarts.clear();
						for (const segment of fallback) {
							this.positions.set(segment.id, segment.position);
							this.segmentStarts.set(segment.id, segment.startOffset);
						}
						await handle.truncate(0);
						if (this.total !== null) await handle.truncate(this.total);
						await this.runSegments(task, fallback, handle);
					} else throw error;
				}
				this.flush(task, true);
				return await this.finalize(task) ? "completed" : "needs_attention";
			} finally {
				await handle.close().catch(() => void 0);
			}
		} catch (error) {
			return await this.handleFailure(task, error);
		}
	}
	async runSegments(task, segments, handle) {
		const failure = (await Promise.allSettled(segments.map((segment) => this.runSegment(task, segment, handle)))).find((result) => result.status === "rejected");
		if (failure) throw failure.reason;
	}
	async runSegment(task, segment, handle) {
		let attempts = 0;
		const retries = this.hooks.settings().retryCount;
		while (!this.aborter.signal.aborted) {
			if (segment.position > segment.endOffset && this.total !== null) return;
			try {
				await this.transfer(task, segment, handle);
				return;
			} catch (error) {
				if (this.aborter.signal.aborted) throw error;
				if (error instanceof RestartSequential) throw error;
				if (attempts >= retries) throw error;
				attempts += 1;
				this.logger.warn("download.segment-retry", {
					taskId: task.id,
					segment: segment.idx,
					attempt: attempts,
					message: error instanceof Error ? error.message : String(error)
				});
				await delay(Math.min(15e3, 500 * 2 ** attempts), this.aborter.signal);
			}
		}
		throw new DOMException("Aborted", "AbortError");
	}
	async transfer(task, segment, handle) {
		const settings = this.hooks.settings();
		const perTaskKib = task.speedLimit > 0 ? task.speedLimit : settings.perTaskSpeedLimitKib;
		const perTask = perTaskKib > 0 ? perTaskKib * 1024 : 0;
		const limiter = this.hooks.taskLimiter(task.id, perTask);
		const ranged = this.resumable && this.total !== null;
		const start = segment.position;
		const { response, finalUrl } = await openStream(task.finalUrl || task.url, settings, {
			rangeStart: ranged ? start : void 0,
			rangeEnd: ranged ? segment.endOffset : void 0,
			ifRange: ranged ? task.etag : null,
			referrer: null,
			signal: this.aborter.signal
		});
		if (ranged && response.statusCode === 416 && segment.position > segment.endOffset) return;
		if (ranged && response.statusCode !== 206) {
			await response.body.dump();
			if (response.statusCode === 200) throw new RestartSequential("Le serveur ignore les requêtes partielles");
			throw new HttpError("TDM-E-RANGE", `Réponse inattendue du serveur (HTTP ${response.statusCode}).`, response.statusCode);
		}
		if (!ranged && response.statusCode >= 400) {
			await response.body.dump();
			throw new HttpError("TDM-E-HTTP", `Le serveur a refusé la requête (HTTP ${response.statusCode}).`, response.statusCode);
		}
		if (!ranged && response.statusCode === 206) {
			const range = parseContentRangeHeader(String(response.headers["content-range"] ?? ""));
			if (range && range.start !== 0) {
				await response.body.dump();
				throw new RestartSequential("Réponse partielle inattendue");
			}
		}
		if (finalUrl !== task.finalUrl) this.db.updateTask(task.id, { finalUrl });
		try {
			for await (const raw of response.body) {
				if (this.aborter.signal.aborted) throw new DOMException("Aborted", "AbortError");
				const chunk = Buffer.from(raw);
				if (chunk.length === 0) continue;
				if (this.aborter.signal.aborted) throw new DOMException("Aborted", "AbortError");
				await this.hooks.globalLimiter.acquire(chunk.length);
				await limiter.acquire(chunk.length);
				if (this.aborter.signal.aborted) throw new DOMException("Aborted", "AbortError");
				await handle.write(chunk, 0, chunk.length, segment.position);
				segment.position += chunk.length;
				this.positions.set(segment.id, segment.position);
				const now = Date.now();
				if (now - this.lastProgress >= PROGRESS_INTERVAL_MS) {
					this.lastProgress = now;
					this.emitProgress(task.id);
				}
				if (now - this.lastFlush >= FLUSH_INTERVAL_MS) {
					this.lastFlush = now;
					this.flush(task);
				}
			}
		} catch (error) {
			if (this.aborter.signal.aborted) throw error;
			if (this.resumable) throw error;
			segment.position = segment.startOffset;
			this.positions.set(segment.id, segment.position);
			await handle.truncate(0);
			if (this.total !== null) await handle.truncate(this.total);
			throw error;
		}
		if (this.resumable && this.total !== null && segment.position <= segment.endOffset) throw new HttpError("TDM-E-PARTIAL", "Le flux s’est interrompu avant la fin du segment.");
		this.db.updateSegmentPosition(segment.id, segment.position, "done");
		this.flush(task, true);
	}
	emitProgress(taskId) {
		const received = this.receivedBytes();
		this.lastEmittedBytes = received;
		this.hooks.onProgress(taskId, received, this.total);
	}
	receivedBytes() {
		let received = 0;
		for (const [id, position] of this.positions) received += Math.max(0, position - (this.segmentStarts.get(id) ?? 0));
		return received;
	}
	flush(task, force = false) {
		const received = this.receivedBytes();
		if (!force && received === this.lastEmittedBytes) return;
		this.db.updateTask(task.id, { receivedBytes: received });
		for (const segment of this.db.listSegments(task.id)) {
			const position = this.positions.get(segment.id);
			if (position !== void 0 && position !== segment.position) this.db.updateSegmentPosition(segment.id, position, position > segment.endOffset ? "done" : "partial");
		}
	}
	setStatus(task, status, patch) {
		const update = { status };
		if (patch.startedAt) update.startedAt = patch.startedAt;
		if (patch.completedAt !== void 0) update.completedAt = patch.completedAt;
		if (patch.error === null) {
			update.errorCode = null;
			update.errorMessage = null;
		}
		this.db.updateTask(task.id, update);
		this.hooks.onStatus(task.id, status, update.errorCode ?? null, update.errorMessage ?? null);
	}
	async finalize(task) {
		const latest = this.db.getTask(task.id) ?? task;
		let expectedChecksum = null;
		if (latest.checksumExpected) {
			expectedChecksum = latest.checksumExpected.trim().toLowerCase();
			const actual = await sha256(latest.tempPath);
			if (actual !== expectedChecksum) {
				await (0, node_fs_promises.rm)(latest.tempPath, { force: true }).catch(() => void 0);
				this.db.replaceSegments(task.id, []);
				this.db.updateTask(task.id, {
					checksumActual: actual,
					receivedBytes: 0,
					status: "needs_attention",
					errorCode: "TDM-E-CHECKSUM",
					errorMessage: "La somme de contrôle ne correspond pas au fichier téléchargé.",
					completedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				this.hooks.onStatus(task.id, "needs_attention", "TDM-E-CHECKSUM", "La somme de contrôle ne correspond pas au fichier téléchargé.");
				return false;
			}
		}
		const finalPath = await uniqueFilePath(latest.destDir, latest.fileName);
		const finalName = node_path.default.basename(finalPath);
		await (0, node_fs_promises.rename)(latest.tempPath, finalPath);
		const size = await (0, node_fs_promises.stat)(finalPath).then((info) => info.size).catch(() => this.total);
		this.db.updateTask(task.id, {
			fileName: finalName,
			tempPath: finalPath,
			status: "completed",
			receivedBytes: size ?? this.total ?? this.receivedBytes(),
			totalBytes: size ?? this.total,
			completedAt: (/* @__PURE__ */ new Date()).toISOString(),
			errorCode: null,
			errorMessage: null,
			checksumActual: expectedChecksum
		});
		this.hooks.onProgress(task.id, size ?? 0, size ?? this.total);
		this.hooks.onStatus(task.id, "completed");
		return true;
	}
	async handleFailure(task, error) {
		this.flush(task, true);
		if (this.cancelled) {
			await (0, node_fs_promises.rm)(task.tempPath, { force: true }).catch(() => void 0);
			this.db.updateTask(task.id, {
				status: "cancelled",
				completedAt: (/* @__PURE__ */ new Date()).toISOString(),
				errorCode: null,
				errorMessage: null
			});
			this.hooks.onStatus(task.id, "cancelled");
			return "cancelled";
		}
		if (this.paused) {
			this.db.updateTask(task.id, { status: "paused" });
			this.hooks.onStatus(task.id, "paused");
			return "paused";
		}
		const mapped = mapError(error);
		this.logger.error("download.failed", {
			taskId: task.id,
			code: mapped.code,
			message: mapped.message,
			stack: error instanceof Error ? error.stack : void 0
		});
		this.db.updateTask(task.id, {
			status: "failed",
			errorCode: mapped.code,
			errorMessage: mapped.message,
			completedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		this.hooks.onStatus(task.id, "failed", mapped.code, mapped.message);
		return "failed";
	}
};
async function sha256(filePath) {
	return new Promise((resolve, reject) => {
		const hash = (0, node_crypto.createHash)("sha256");
		const stream = (0, node_fs.createReadStream)(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}
function mapError(error) {
	if (error instanceof HttpError) return {
		code: error.code,
		message: error.message
	};
	switch (error?.code) {
		case "ENOSPC": return {
			code: "TDM-E-DISK-FULL",
			message: "Espace disque insuffisant pour terminer le téléchargement."
		};
		case "EACCES":
		case "EPERM": return {
			code: "TDM-E-PERMISSION",
			message: "Accès refusé : vérifiez les droits du dossier de destination."
		};
		case "ENOENT": return {
			code: "TDM-E-PATH",
			message: "Dossier de destination introuvable."
		};
		case "EROFS": return {
			code: "TDM-E-READONLY",
			message: "Le dossier de destination est en lecture seule."
		};
	}
	if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return {
		code: "TDM-E-TIMEOUT",
		message: "Le téléchargement a été interrompu (délai dépassé)."
	};
	return {
		code: "TDM-E-UNKNOWN",
		message: error instanceof Error ? error.message : "Erreur inconnue pendant le téléchargement."
	};
}
// src/engine/limiter.ts
/**
* Limiteur de débit à jetons. La limite est exprimée en octets/seconde.
* Plusieurs travailleurs peuvent consommer le même limiteur : le débit total
* reste borné, sans rafale supérieure à un quart de seconde.
*/
var RateLimiter = class {
	rate;
	tokens;
	lastRefill;
	maxBurst;
	constructor(bytesPerSecond = 0) {
		this.rate = Math.max(0, bytesPerSecond);
		this.tokens = this.rate > 0 ? Math.max(32768, this.rate / 4) : 0;
		this.lastRefill = Date.now();
		this.maxBurst = Math.max(32768, this.rate / 4);
	}
	setRate(bytesPerSecond) {
		const next = Math.max(0, Math.round(bytesPerSecond));
		if (next === this.rate) return;
		this.rate = next;
		if (next === 0) {
			this.tokens = 0;
			return;
		}
		this.tokens = Math.min(this.tokens, Math.max(32768, next / 4));
	}
	getRate() {
		return this.rate;
	}
	async acquire(bytes) {
		if (this.rate <= 0 || bytes <= 0) return;
		let remaining = Math.min(bytes, Math.max(32768, this.rate));
		while (remaining > 0) {
			const now = Date.now();
			const elapsed = (now - this.lastRefill) / 1e3;
			this.lastRefill = now;
			this.tokens = Math.min(this.maxBurst, this.tokens + elapsed * this.rate);
			if (this.tokens >= remaining) {
				this.tokens -= remaining;
				return;
			}
			const needed = remaining - this.tokens;
			this.tokens = 0;
			remaining = needed;
			const waitMs = Math.max(1, Math.ceil(needed / this.rate * 1e3));
			await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 1e3)));
		}
	}
};
var LimiterRegistry = class {
	global = new RateLimiter(0);
	perTask = /* @__PURE__ */ new Map();
	forTask(taskId, bytesPerSecond) {
		let limiter = this.perTask.get(taskId);
		if (!limiter) {
			limiter = new RateLimiter(bytesPerSecond);
			this.perTask.set(taskId, limiter);
		} else limiter.setRate(bytesPerSecond);
		return limiter;
	}
	release(taskId) {
		this.perTask.delete(taskId);
	}
};
// src/engine/manager.ts
var DEFAULT_QUEUE_ID = "queue-default";
var TaskManager = class {
	db;
	settingsService;
	categories;
	logger;
	emit;
	downloadsRoot;
	jobs = /* @__PURE__ */ new Map();
	speeds = /* @__PURE__ */ new Map();
	limiters = new LimiterRegistry();
	resumeAfterStop = /* @__PURE__ */ new Set();
	pumping = false;
	stopping = false;
	constructor(db, settingsService, categories, logger, emit, downloadsRoot) {
		this.db = db;
		this.settingsService = settingsService;
		this.categories = categories;
		this.logger = logger;
		this.emit = emit;
		this.downloadsRoot = downloadsRoot;
	}
	init() {
		if (this.db.listQueues().length === 0) {
			const now = (/* @__PURE__ */ new Date()).toISOString();
			this.db.insertQueue({
				id: DEFAULT_QUEUE_ID,
				name: "Principal",
				kind: "download",
				concurrency: 1,
				status: "running",
				createdAt: now
			});
		}
		const settings = this.settingsService.get();
		for (const task of this.db.listTasks()) if (task.status === "downloading" || task.status === "probing" || task.status === "cancelling") this.db.updateTask(task.id, {
			status: settings.resumeOnStartup ? "queued" : "paused",
			errorCode: null,
			errorMessage: null
		});
		const retention = settings.historyRetentionDays;
		if (retention > 0) {
			const cutoff = (/* @__PURE__ */ new Date(Date.now() - retention * 864e5)).toISOString();
			const purged = this.db.purgeHistory(cutoff);
			if (purged > 0) this.logger.info("history.purged", { count: purged });
		}
		this.applyLimits();
		this.pump();
	}
	applyLimits() {
		const settings = this.settingsService.get();
		this.limiters.global.setRate(settings.globalSpeedLimitKib * 1024);
	}
	list(filter = {}) {
		const categories = new Map(this.categories.list().map((category) => [category.id, category.name]));
		const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]));
		let tasks = this.db.listTasks().map((task) => this.toView(task, categories, queues));
		if (filter.categoryId !== void 0) tasks = tasks.filter((task) => (task.categoryId ?? null) === (filter.categoryId ?? null));
		if (filter.queueId !== void 0) tasks = tasks.filter((task) => (task.queueId ?? null) === (filter.queueId ?? null));
		if (filter.status && filter.status !== "all") {
			const active = [
				"downloading",
				"probing",
				"queued"
			];
			const finished = [
				"completed",
				"failed",
				"cancelled",
				"needs_attention"
			];
			tasks = tasks.filter((task) => filter.status === "active" ? active.includes(task.status) : filter.status === "finished" ? finished.includes(task.status) : task.status === filter.status);
		}
		if (filter.search && filter.search.trim()) {
			const needle = filter.search.trim().toLowerCase();
			tasks = tasks.filter((task) => task.fileName.toLowerCase().includes(needle) || task.url.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle));
		}
		return tasks;
	}
	get(id) {
		const task = this.requireTask(id);
		const categories = new Map(this.categories.list().map((category) => [category.id, category.name]));
		const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]));
		return this.toView(task, categories, queues);
	}
	listQueues() {
		return this.db.listQueues().map((queue) => this.toQueueView(queue));
	}
	listSchedules() {
		const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]));
		return this.db.listSchedules().map((schedule) => mapScheduleView(schedule, queues.get(schedule.queueId) ?? null));
	}
	scheduleRow(id) {
		return this.db.getSchedule(id);
	}
	listCategories() {
		const counts = /* @__PURE__ */ new Map();
		for (const task of this.db.listTasks()) if (task.categoryId) counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1);
		return this.categories.list().map((category) => ({
			id: category.id,
			name: category.name,
			dir: category.dir,
			extensions: category.extensions,
			domains: category.domains,
			builtin: category.builtin,
			taskCount: counts.get(category.id) ?? 0
		}));
	}
	listHistory(limit = 300) {
		return this.db.listHistory(limit).map((row) => ({
			id: row.id,
			taskId: row.taskId,
			event: row.event,
			at: row.at,
			detail: row.detailJson ? safeJson(row.detailJson) : null
		}));
	}
	stats() {
		const tasks = this.db.listTasks();
		const counts = /* @__PURE__ */ new Map();
		for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
		let totalSpeed = 0;
		for (const sample of this.speeds.values()) totalSpeed += sample.speed;
		return {
			queued: counts.get("queued") ?? 0,
			downloading: counts.get("downloading") ?? 0,
			paused: counts.get("paused") ?? 0,
			completed: counts.get("completed") ?? 0,
			failed: counts.get("failed") ?? 0,
			cancelled: counts.get("cancelled") ?? 0,
			totalSpeed: Math.round(totalSpeed),
			totalReceived: tasks.reduce((sum, task) => sum + task.receivedBytes, 0),
			activeDownloads: this.jobs.size
		};
	}
	async probeUrl(url) {
		return { ...await probe(url, this.settingsService.get()) };
	}
	async add(input) {
		const settings = this.settingsService.get();
		assertHttpUrl(input.url);
		const probed = await probe(input.url, settings);
		const fileName = sanitizeFileName(input.fileName?.trim() || probed.suggestedFileName || fileNameFromUrl(probed.finalUrl) || "telechargement");
		const category = (input.categoryId ? this.categories.get(input.categoryId) : null) ?? this.categories.match(fileName, probed.finalUrl);
		const destDir = node_path.default.resolve(input.destDir?.trim() || category.dir || settings.defaultDownloadDir);
		const taskId = (0, node_crypto.randomUUID)();
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const connections = Math.max(1, Math.min(16, input.connections ?? settings.maxConnectionsPerTask));
		const queueId = input.queueId ?? null;
		if (queueId && !this.db.getQueue(queueId)) throw new Error("File d’attente inconnue");
		const task = {
			id: taskId,
			url: input.url,
			finalUrl: probed.finalUrl,
			fileName,
			destDir,
			tempPath: node_path.default.join(destDir, `.${fileName}.${taskId.slice(0, 8)}.tdm-part`),
			categoryId: category?.id ?? null,
			queueId,
			status: input.startNow === false ? "paused" : "queued",
			totalBytes: probed.contentLength,
			receivedBytes: 0,
			resumable: probed.resumable ? 1 : 0,
			etag: probed.etag,
			lastModified: probed.lastModified,
			contentType: probed.contentType,
			createdAt: now,
			startedAt: null,
			completedAt: null,
			errorCode: null,
			errorMessage: null,
			priority: 0,
			connections,
			speedLimit: settings.perTaskSpeedLimitKib,
			checksumExpected: normalizeChecksum(input.checksumExpected),
			checksumActual: null,
			description: (input.description ?? "").slice(0, 500),
			updatedAt: now
		};
		this.db.insertTask(task);
		if (probed.contentLength && probed.contentLength > 0) {
			const segments = probed.resumable ? planSegments(taskId, probed.contentLength, connections, settings.segmentThresholdMib * 1024 * 1024) : planSegments(taskId, probed.contentLength, 1, Number.MAX_SAFE_INTEGER);
			this.db.replaceSegments(taskId, segments);
		}
		this.db.addHistory("task.added", taskId, {
			url: input.url,
			fileName
		});
		this.emit("task.updated", this.get(taskId));
		this.emit("task.added", this.get(taskId));
		this.pump();
		return this.get(taskId);
	}
	pause(id) {
		const task = this.requireTask(id);
		const running = this.jobs.get(id);
		if (running) {
			this.db.updateTask(id, { status: "paused" });
			running.job.pause();
		} else if (task.status === "queued" || task.status === "downloading" || task.status === "probing") this.db.updateTask(id, { status: "paused" });
		this.db.addHistory("task.paused", id, null);
		this.emit("task.updated", this.get(id));
		return this.get(id);
	}
	resume(id) {
		if (this.requireTask(id).status === "completed") throw new Error("Ce téléchargement est déjà terminé.");
		if (this.jobs.has(id)) {
			this.resumeAfterStop.add(id);
			return this.get(id);
		}
		this.db.updateTask(id, {
			status: "queued",
			errorCode: null,
			errorMessage: null
		});
		this.db.addHistory("task.resumed", id, null);
		this.emit("task.updated", this.get(id));
		this.pump();
		return this.get(id);
	}
	retry(id) {
		return this.resume(id);
	}
	cancel(id) {
		const task = this.requireTask(id);
		const running = this.jobs.get(id);
		if (running) {
			this.db.updateTask(id, { status: "cancelling" });
			running.job.cancel();
		} else {
			this.db.updateTask(id, {
				status: "cancelled",
				completedAt: (/* @__PURE__ */ new Date()).toISOString(),
				errorCode: null,
				errorMessage: null
			});
			(0, node_fs_promises.rm)(task.tempPath, { force: true }).catch(() => void 0);
		}
		this.db.addHistory("task.cancelled", id, null);
		this.emit("task.updated", this.get(id));
		return this.get(id);
	}
	async remove(id, deleteFile) {
		const task = this.requireTask(id);
		const running = this.jobs.get(id);
		if (running) {
			running.job.cancel();
			await running.promise.catch(() => void 0);
		}
		if (deleteFile && task.status === "completed") {
			const finalPath = node_path.default.join(task.destDir, task.fileName);
			if (isPathInside(finalPath, task.destDir)) await (0, node_fs_promises.rm)(finalPath, { force: true }).catch(() => void 0);
		}
		if (deleteFile || task.status !== "completed") await (0, node_fs_promises.rm)(task.tempPath, { force: true }).catch(() => void 0);
		this.db.deleteTask(id);
		this.db.addHistory("task.removed", id, {
			fileName: task.fileName,
			deleteFile
		});
		this.speeds.delete(id);
		this.limiters.release(id);
		this.emit("task.removed", { id });
		this.pump();
	}
	async clearFinished(deleteFiles) {
		const finished = this.db.listTasks().filter((task) => [
			"completed",
			"failed",
			"cancelled",
			"needs_attention"
		].includes(task.status));
		for (const task of finished) await this.remove(task.id, deleteFiles);
		return finished.length;
	}
	updateTask(id, patch) {
		const task = this.requireTask(id);
		const update = {};
		if (patch.queueId !== void 0) {
			if (patch.queueId !== null && !this.db.getQueue(patch.queueId)) throw new Error("File inconnue");
			update.queueId = patch.queueId;
		}
		if (patch.priority !== void 0) update.priority = Math.max(-10, Math.min(10, Math.round(patch.priority)));
		if (patch.description !== void 0) update.description = patch.description.slice(0, 500);
		if (patch.connections !== void 0) {
			if (task.status === "downloading") throw new Error("Modifiez les connexions après une pause.");
			update.connections = Math.max(1, Math.min(16, Math.round(patch.connections)));
		}
		if (patch.speedLimitKib !== void 0) update.speedLimit = Math.max(0, Math.min(1e7, Math.round(patch.speedLimitKib)));
		if (patch.checksumExpected !== void 0) update.checksumExpected = normalizeChecksum(patch.checksumExpected);
		this.db.updateTask(id, update);
		this.emit("task.updated", this.get(id));
		this.pump();
		return this.get(id);
	}
	createQueue(name, concurrency) {
		const trimmed = name.trim();
		if (!trimmed) throw new Error("Nom de file requis.");
		const queue = {
			id: (0, node_crypto.randomUUID)(),
			name: trimmed.slice(0, 80),
			kind: "download",
			concurrency: Math.max(1, Math.min(16, Math.round(concurrency))),
			status: "stopped",
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.db.insertQueue(queue);
		this.emit("queues.changed", this.listQueues());
		return this.toQueueView(queue);
	}
	updateQueue(id, patch) {
		if (!this.db.getQueue(id)) throw new Error("File inconnue.");
		const update = {};
		if (patch.name !== void 0) {
			if (!patch.name.trim()) throw new Error("Nom de file requis.");
			update.name = patch.name.trim().slice(0, 80);
		}
		if (patch.concurrency !== void 0) update.concurrency = Math.max(1, Math.min(16, Math.round(patch.concurrency)));
		this.db.updateQueue(id, update);
		const next = this.db.getQueue(id);
		this.emit("queues.changed", this.listQueues());
		this.pump();
		return this.toQueueView(next);
	}
	deleteQueue(id) {
		if (id === DEFAULT_QUEUE_ID) throw new Error("La file principale ne peut pas être supprimée.");
		if (!this.db.getQueue(id)) return;
		const tasks = this.db.listTasks().filter((task) => task.queueId === id);
		for (const task of tasks) this.db.updateTask(task.id, { queueId: null });
		this.db.deleteQueue(id);
		this.emit("queues.changed", this.listQueues());
		this.pump();
	}
	startQueue(id) {
		if (!this.db.getQueue(id)) throw new Error("File inconnue.");
		this.db.updateQueue(id, { status: "running" });
		for (const task of this.db.listTasks()) {
			if (task.queueId !== id) continue;
			if (task.status === "paused" || task.status === "failed") this.db.updateTask(task.id, {
				status: "queued",
				errorCode: null,
				errorMessage: null
			});
		}
		this.db.addHistory("queue.started", null, { queueId: id });
		this.emit("queues.changed", this.listQueues());
		this.emit("tasks.changed", null);
		this.pump();
	}
	stopQueue(id) {
		if (!this.db.getQueue(id)) throw new Error("File inconnue.");
		this.db.updateQueue(id, { status: "stopped" });
		this.db.addHistory("queue.stopped", null, { queueId: id });
		for (const [taskId, running] of this.jobs) if (running.queueId === id) {
			this.db.updateTask(taskId, { status: "paused" });
			running.job.pause();
		}
		this.emit("queues.changed", this.listQueues());
	}
	startAll() {
		for (const queue of this.db.listQueues()) this.db.updateQueue(queue.id, { status: "running" });
		for (const task of this.db.listTasks()) if (task.status === "paused" || task.status === "failed" || task.status === "queued") this.db.updateTask(task.id, {
			status: "queued",
			errorCode: null,
			errorMessage: null
		});
		this.emit("queues.changed", this.listQueues());
		this.emit("tasks.changed", null);
		this.pump();
	}
	pauseAll() {
		for (const [id, running] of this.jobs) {
			this.db.updateTask(id, { status: "paused" });
			running.job.pause();
		}
		for (const task of this.db.listTasks()) if (task.status === "queued") this.db.updateTask(task.id, { status: "paused" });
		this.emit("tasks.changed", null);
	}
	saveSchedule(input) {
		if (!this.db.getQueue(input.queueId)) throw new Error("File inconnue.");
		const existing = input.id ? this.db.getSchedule(input.id) : null;
		const schedule = {
			id: existing?.id ?? (0, node_crypto.randomUUID)(),
			queueId: input.queueId,
			mode: input.mode,
			startAt: input.startAt,
			stopAt: input.stopAt,
			daysMask: input.daysMask,
			intervalMinutes: input.intervalMinutes,
			retries: Math.max(0, Math.min(20, input.retries)),
			enabled: input.enabled ? 1 : 0,
			nextRunAt: null,
			lastRunAt: existing?.lastRunAt ?? null,
			action: input.action,
			actionTarget: input.queueId
		};
		this.db.upsertSchedule(schedule);
		this.emit("schedules.changed", this.listSchedules());
	}
	deleteSchedule(id) {
		this.db.deleteSchedule(id);
		this.emit("schedules.changed", this.listSchedules());
	}
	setScheduleNextRun(id, nextRunAt, lastRunAt, enabled) {
		const schedule = this.db.getSchedule(id);
		if (!schedule) return;
		this.db.upsertSchedule({
			...schedule,
			nextRunAt,
			lastRunAt: lastRunAt ?? schedule.lastRunAt,
			enabled: enabled === void 0 ? schedule.enabled : enabled ? 1 : 0
		});
		this.emit("schedules.changed", this.listSchedules());
	}
	saveCategory(input) {
		const name = input.name.trim();
		if (!name) throw new Error("Nom de catégorie requis.");
		const dir = node_path.default.resolve(input.dir.trim() || this.downloadsRoot);
		const extensions = JSON.stringify(input.extensions.map((item) => item.trim().replace(/^\./, "").toLowerCase()).filter(Boolean));
		const domains = JSON.stringify(input.domains.map((item) => item.trim().toLowerCase()).filter(Boolean));
		if (input.id) {
			if (!this.db.listCategories().find((category) => category.id === input.id)) throw new Error("Catégorie inconnue.");
			this.db.updateCategory(input.id, {
				name,
				dir,
				extensions,
				domains
			});
		} else this.db.insertCategory({
			id: (0, node_crypto.randomUUID)(),
			name,
			dir,
			extensions,
			domains,
			builtin: 0
		});
		this.emit("categories.changed", this.listCategories());
		return this.listCategories().find((category) => category.name === name);
	}
	deleteCategory(id) {
		this.db.deleteCategory(id);
		this.emit("categories.changed", this.listCategories());
	}
	pump() {
		if (this.pumping || this.stopping) return;
		this.pumping = true;
		try {
			const max = this.settingsService.get().maxConcurrentDownloads;
			if (this.jobs.size >= max) return;
			const queues = new Map(this.db.listQueues().map((queue) => [queue.id, queue]));
			const candidates = this.db.listTasks().filter((task) => task.status === "queued").sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
			for (const task of candidates) {
				if (this.jobs.size >= max) break;
				if (this.jobs.has(task.id)) continue;
				if (task.queueId) {
					const queue = queues.get(task.queueId);
					if (!queue || queue.status !== "running") continue;
					if ([...this.jobs.values()].filter((job) => job.queueId === task.queueId).length >= queue.concurrency) continue;
				}
				this.startJob(task);
			}
		} finally {
			this.pumping = false;
		}
	}
	startJob(task) {
		const job = new DownloadJob(task.id, this.db, this.logger, {
			settings: () => this.settingsService.get(),
			globalLimiter: this.limiters.global,
			taskLimiter: (id, rate) => this.limiters.forTask(id, rate),
			releaseTaskLimiter: (id) => this.limiters.release(id),
			onProgress: (id, received, total) => this.handleProgress(id, received, total),
			onStatus: (id, status, code, message) => this.handleStatus(id, status, code, message)
		});
		const promise = job.run().then((outcome) => {
			this.logger.debug("download.outcome", {
				taskId: task.id,
				outcome
			});
			return outcome;
		}).catch((error) => {
			this.logger.error("download.crash", {
				taskId: task.id,
				message: error instanceof Error ? error.message : String(error)
			});
			const mapped = mapError(error);
			this.db.updateTask(task.id, {
				status: "failed",
				errorCode: mapped.code,
				errorMessage: mapped.message
			});
			this.handleStatus(task.id, "failed", mapped.code, mapped.message);
			return "failed";
		}).finally(() => {
			this.jobs.delete(task.id);
			this.speeds.delete(task.id);
			this.limiters.release(task.id);
			if (this.resumeAfterStop.delete(task.id)) this.db.updateTask(task.id, {
				status: "queued",
				errorCode: null,
				errorMessage: null
			});
			this.emit("task.updated", this.get(task.id));
			this.emit("stats.tick", this.stats());
			this.pump();
		});
		this.jobs.set(task.id, {
			job,
			promise,
			queueId: task.queueId
		});
		this.emit("task.updated", this.get(task.id));
	}
	handleProgress(id, received, total) {
		if (!this.db.getTask(id)) return;
		const now = Date.now();
		const previous = this.speeds.get(id);
		let speed = previous?.speed ?? 0;
		if (previous) {
			const elapsed = (now - previous.at) / 1e3;
			if (elapsed >= .2) {
				const instant = Math.max(0, (received - previous.bytes) / elapsed);
				speed = previous.speed > 0 ? previous.speed * .65 + instant * .35 : instant;
				this.speeds.set(id, {
					bytes: received,
					at: now,
					speed,
					lastEmit: previous.lastEmit
				});
			}
		} else this.speeds.set(id, {
			bytes: received,
			at: now,
			speed: 0,
			lastEmit: 0
		});
		const sample = this.speeds.get(id);
		if (now - sample.lastEmit < 400 && received < (total ?? Number.MAX_SAFE_INTEGER)) return;
		sample.lastEmit = now;
		this.db.updateTask(id, { receivedBytes: received });
		const view = this.toView(this.db.getTask(id), this.categoryNames(), this.queueNames());
		view.speed = Math.round(speed);
		view.etaSeconds = speed > 0 && total !== null ? Math.max(0, (total - received) / speed) : null;
		this.emit("task.updated", view);
		this.emit("stats.tick", this.stats());
	}
	handleStatus(id, status, code, message) {
		const task = this.db.getTask(id);
		if (!task) return;
		this.db.addHistory(`task.${status}`, id, code ? {
			code,
			message
		} : null);
		const view = this.toView(task, this.categoryNames(), this.queueNames());
		if (status === "completed") {
			view.speed = 0;
			view.etaSeconds = 0;
			this.emit("notification", {
				kind: "success",
				title: "Téléchargement terminé",
				body: task.fileName,
				taskId: id
			});
		} else if (status === "failed") {
			view.speed = 0;
			this.emit("notification", {
				kind: "error",
				title: "Échec du téléchargement",
				body: message ?? task.fileName,
				taskId: id
			});
		}
		this.emit("task.updated", view);
		this.emit("stats.tick", this.stats());
	}
	categoryNames() {
		return new Map(this.categories.list().map((category) => [category.id, category.name]));
	}
	queueNames() {
		return new Map(this.db.listQueues().map((queue) => [queue.id, queue.name]));
	}
	toQueueView(queue) {
		const tasks = this.db.listTasks().filter((task) => task.queueId === queue.id);
		return {
			id: queue.id,
			name: queue.name,
			kind: queue.kind,
			concurrency: queue.concurrency,
			status: queue.status,
			createdAt: queue.createdAt,
			taskCount: tasks.length,
			activeCount: tasks.filter((task) => task.status === "downloading" || task.status === "probing").length
		};
	}
	toView(task, categories, queues) {
		const filePath = node_path.default.join(task.destDir, task.fileName);
		const sample = this.speeds.get(task.id);
		const speed = task.status === "downloading" ? Math.round(sample?.speed ?? 0) : 0;
		const remaining = task.totalBytes !== null ? task.totalBytes - task.receivedBytes : null;
		return {
			id: task.id,
			url: task.url,
			finalUrl: task.finalUrl,
			fileName: task.fileName,
			filePath,
			destDir: task.destDir,
			categoryId: task.categoryId,
			categoryName: task.categoryId ? categories.get(task.categoryId) ?? null : null,
			queueId: task.queueId,
			queueName: task.queueId ? queues.get(task.queueId) ?? null : null,
			status: task.status,
			totalBytes: task.totalBytes,
			receivedBytes: task.receivedBytes,
			speed,
			etaSeconds: speed > 0 && remaining !== null ? Math.max(0, remaining / speed) : null,
			resumable: task.resumable === 1,
			createdAt: task.createdAt,
			startedAt: task.startedAt,
			completedAt: task.completedAt,
			errorCode: task.errorCode,
			errorMessage: task.errorMessage,
			priority: task.priority,
			connections: task.connections,
			speedLimitKib: task.speedLimit,
			description: task.description,
			mimeType: task.contentType,
			checksumExpected: task.checksumExpected,
			checksumActual: task.checksumActual
		};
	}
	requireTask(id) {
		const task = this.db.getTask(id);
		if (!task) throw new Error("Téléchargement inconnu.");
		return task;
	}
	async shutdown() {
		this.stopping = true;
		for (const [, running] of this.jobs) running.job.pause();
		await Promise.all([...this.jobs.values()].map((running) => running.promise.catch(() => void 0)));
		this.jobs.clear();
	}
};
function normalizeChecksum(value) {
	if (!value) return null;
	const trimmed = value.trim().toLowerCase().replace(/^sha256:/, "");
	if (!/^[a-f0-9]{64}$/.test(trimmed)) throw new Error("La somme SHA-256 doit contenir 64 caractères hexadécimaux.");
	return trimmed;
}
function mapScheduleView(schedule, queueName) {
	return {
		id: schedule.id,
		queueId: schedule.queueId,
		queueName,
		mode: schedule.mode,
		startAt: schedule.startAt,
		stopAt: schedule.stopAt,
		daysMask: schedule.daysMask,
		intervalMinutes: schedule.intervalMinutes,
		retries: schedule.retries,
		enabled: schedule.enabled === 1,
		nextRunAt: schedule.nextRunAt,
		lastRunAt: schedule.lastRunAt,
		action: schedule.action,
		actionTarget: schedule.actionTarget
	};
}
function safeJson(value) {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
// src/engine/scheduler.ts
var TICK_MS = 2e4;
function parseTimeOfDay(value) {
	if (!value) return null;
	const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return {
		hours,
		minutes
	};
}
/** bit 0 = lundi … bit 6 = dimanche */
function dayBit(date) {
	return (date.getDay() + 6) % 7;
}
function matchesDay(date, daysMask) {
	if (!daysMask) return true;
	return (daysMask & 1 << dayBit(date)) !== 0;
}
function atTime(day, time) {
	const result = new Date(day);
	result.setHours(time.hours, time.minutes, 0, 0);
	return result;
}
/**
* Prochaine occurrence strictement après `from`.
* - once : date/heure ISO unique
* - daily : HH:MM, filtré par daysMask
* - interval : toutes les N minutes depuis le dernier lancement (ou maintenant)
*/
function nextOccurrence(schedule, from) {
	if (!schedule.enabled) return null;
	if (schedule.mode === "once") {
		if (!schedule.startAt) return null;
		const date = new Date(schedule.startAt);
		if (Number.isNaN(date.getTime())) return null;
		return date.getTime() > from.getTime() ? date : null;
	}
	if (schedule.mode === "interval") {
		const minutes = schedule.intervalMinutes ?? 0;
		if (minutes <= 0) return null;
		const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
		const base = last && !Number.isNaN(last.getTime()) && last.getTime() > from.getTime() ? last : from;
		return new Date(base.getTime() + minutes * 6e4);
	}
	if (schedule.mode === "daily") {
		const time = parseTimeOfDay(schedule.startAt);
		if (!time) return null;
		for (let offset = 0; offset <= 8; offset += 1) {
			const day = new Date(from);
			day.setDate(day.getDate() + offset);
			if (!matchesDay(day, schedule.daysMask)) continue;
			const candidate = atTime(day, time);
			if (candidate.getTime() > from.getTime()) return candidate;
		}
		return null;
	}
	return null;
}
function isStartAction(action) {
	return action === "start_queue" || action === "start_all";
}
var SchedulerService = class {
	manager;
	logger;
	timer = null;
	activeWindows = /* @__PURE__ */ new Set();
	constructor(manager, logger) {
		this.manager = manager;
		this.logger = logger;
	}
	start() {
		if (this.timer) return;
		this.refresh();
		this.timer = setInterval(() => {
			try {
				this.tick();
			} catch (error) {
				this.logger.error("scheduler.tick.failed", { message: error instanceof Error ? error.message : String(error) });
			}
		}, TICK_MS);
		if (typeof this.timer.unref === "function") this.timer.unref();
	}
	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
	/** Recalcule les prochaines exécutions après création/modification d'un planning. */
	refresh() {
		const now = /* @__PURE__ */ new Date();
		for (const view of this.manager.listSchedules()) {
			if (!view.enabled) continue;
			const row = this.manager.scheduleRow(view.id);
			if (!row) continue;
			if (row.mode === "interval" || row.nextRunAt === null) {
				const next = nextOccurrence(row, now);
				this.manager.setScheduleNextRun(row.id, next ? next.toISOString() : null);
			} else if (row.mode === "daily") {
				const next = nextOccurrence(row, now);
				const value = next ? next.toISOString() : null;
				if (value !== row.nextRunAt) this.manager.setScheduleNextRun(row.id, value);
			}
		}
	}
	tick(now = /* @__PURE__ */ new Date()) {
		for (const view of this.manager.listSchedules()) {
			if (!view.enabled) continue;
			const row = this.manager.scheduleRow(view.id);
			if (!row) continue;
			if (row.mode === "daily" && isStartAction(row.action) && parseTimeOfDay(row.stopAt)) {
				this.tickWindow(row, now);
				continue;
			}
			if (!row.nextRunAt) {
				const next = nextOccurrence(row, now);
				this.manager.setScheduleNextRun(row.id, next ? next.toISOString() : null);
				continue;
			}
			const due = new Date(row.nextRunAt);
			if (Number.isNaN(due.getTime()) || due.getTime() > now.getTime()) continue;
			this.execute(row, now);
			const next = nextOccurrence({
				...row,
				lastRunAt: now.toISOString(),
				enabled: row.mode === "once" ? 0 : 1
			}, new Date(now.getTime() + 1e3));
			this.manager.setScheduleNextRun(row.id, next ? next.toISOString() : null, now.toISOString(), row.mode !== "once");
		}
	}
	tickWindow(row, now) {
		const window = this.windowFor(row, now);
		const active = this.activeWindows.has(row.id);
		if (!window) {
			if (active) {
				this.executeStop(row);
				this.activeWindows.delete(row.id);
			}
			this.manager.setScheduleNextRun(row.id, null);
			return;
		}
		if (window.inside && !active) {
			this.executeStart(row);
			this.activeWindows.add(row.id);
			this.logger.info("scheduler.window.start", {
				scheduleId: row.id,
				queueId: row.queueId
			});
		} else if (!window.inside && active) {
			this.executeStop(row);
			this.activeWindows.delete(row.id);
			this.logger.info("scheduler.window.stop", {
				scheduleId: row.id,
				queueId: row.queueId
			});
		}
		const nextStart = nextOccurrence({
			...row,
			stopAt: null
		}, now);
		const value = nextStart ? nextStart.toISOString() : null;
		if (row.nextRunAt !== value) this.manager.setScheduleNextRun(row.id, value);
	}
	windowFor(row, now) {
		const startTime = parseTimeOfDay(row.startAt);
		const stopTime = parseTimeOfDay(row.stopAt);
		if (!startTime || !stopTime) return null;
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		const startToday = atTime(today, startTime);
		const stopToday = atTime(today, stopTime);
		let start = startToday;
		let stop = stopToday;
		if (stopToday.getTime() <= startToday.getTime()) {
			if (now.getTime() < stopToday.getTime()) {
				const yesterday = new Date(today);
				yesterday.setDate(yesterday.getDate() - 1);
				start = atTime(yesterday, startTime);
			} else {
				const tomorrow = new Date(today);
				tomorrow.setDate(tomorrow.getDate() + 1);
				stop = atTime(tomorrow, stopTime);
			}
		}
		if (!matchesDay(start, row.daysMask)) return null;
		const inside = now.getTime() >= start.getTime() && now.getTime() < stop.getTime();
		return {
			start,
			stop,
			inside
		};
	}
	execute(row, now) {
		try {
			if (row.action === "start_all") this.manager.startAll();
			else if (row.action === "stop_all") this.manager.pauseAll();
			else if (row.action === "start_queue") this.manager.startQueue(row.queueId);
			else if (row.action === "stop_queue") this.manager.stopQueue(row.queueId);
			this.logger.info("scheduler.run", {
				scheduleId: row.id,
				action: row.action,
				at: now.toISOString()
			});
		} catch (error) {
			this.logger.error("scheduler.run.failed", {
				scheduleId: row.id,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
	executeStart(row) {
		try {
			if (row.action === "start_all") this.manager.startAll();
			else this.manager.startQueue(row.queueId);
		} catch (error) {
			this.logger.error("scheduler.start.failed", {
				scheduleId: row.id,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
	executeStop(row) {
		try {
			if (row.action === "start_all") this.manager.pauseAll();
			else this.manager.stopQueue(row.queueId);
		} catch (error) {
			this.logger.error("scheduler.stop.failed", {
				scheduleId: row.id,
				message: error instanceof Error ? error.message : String(error)
			});
		}
	}
};
// src/engine/settings.ts
var SettingsService = class {
	db;
	logger;
	current;
	constructor(db, defaults, logger) {
		this.db = db;
		this.logger = logger;
		const stored = this.db.getSetting("settings");
		const merged = {
			...defaults,
			...stored ?? {}
		};
		const parsed = settingsSchema.safeParse(merged);
		if (parsed.success) this.current = parsed.data;
		else {
			this.logger.warn("settings.invalid", parsed.error.flatten());
			this.current = defaults;
		}
		this.logger.setLevel(this.current.logLevel);
	}
	get() {
		return { ...this.current };
	}
	update(patch) {
		const next = settingsSchema.parse({
			...this.current,
			...patch
		});
		this.current = next;
		this.db.setSetting("settings", next);
		this.logger.setLevel(next.logLevel);
		return this.get();
	}
};
// src/engine/entry.ts
var parentPort = process.parentPort;
if (!parentPort) throw new Error("TDM engine must run inside an Electron utility process");
var PROTOCOL_VERSION = 1;
var APP_VERSION = process.env.TDM_APP_VERSION ?? "0.0.0";
var DATA_DIR = process.env.TDM_DATA_DIR ?? node_path.default.join((0, node_os.homedir)(), ".config", "tdm");
var DOWNLOADS_ROOT = process.env.TDM_DOWNLOADS_DIR ?? node_path.default.join((0, node_os.homedir)(), "Downloads", "TDM");
function send(message) {
	parentPort.postMessage(message);
}
function emit(type, payload) {
	send({
		protocolVersion: PROTOCOL_VERSION,
		type,
		payload,
		at: (/* @__PURE__ */ new Date()).toISOString()
	});
}
function sqliteVersion() {
	try {
		const db = new (process.getBuiltinModule("node:sqlite")).DatabaseSync(":memory:");
		const row = db.prepare("select sqlite_version() as version").get();
		db.close();
		return row.version;
	} catch (error) {
		return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
	}
}
var filterSchema = zod.z.object({
	status: zod.z.enum([
		"all",
		"active",
		"finished",
		"queued",
		"probing",
		"downloading",
		"paused",
		"completed",
		"failed",
		"cancelled",
		"needs_attention"
	]).optional(),
	categoryId: zod.z.string().nullable().optional(),
	queueId: zod.z.string().nullable().optional(),
	search: zod.z.string().max(300).optional()
}).optional();
var addSchema = zod.z.object({
	url: zod.z.string().min(1).max(4096),
	fileName: zod.z.string().max(240).optional(),
	destDir: zod.z.string().max(1024).optional(),
	categoryId: zod.z.string().max(100).optional(),
	queueId: zod.z.string().max(100).nullable().optional(),
	connections: zod.z.number().int().min(1).max(16).optional(),
	description: zod.z.string().max(500).optional(),
	checksumExpected: zod.z.string().max(80).nullable().optional(),
	startNow: zod.z.boolean().optional(),
	referrer: zod.z.string().max(2048).optional()
});
var taskIdSchema = zod.z.object({ id: zod.z.string().min(1) });
var settingsPatchSchema = zod.z.object({
	defaultDownloadDir: zod.z.string().min(1).optional(),
	maxConcurrentDownloads: zod.z.number().int().min(1).max(16).optional(),
	maxConnectionsPerTask: zod.z.number().int().min(1).max(16).optional(),
	globalSpeedLimitKib: zod.z.number().int().min(0).max(1e7).optional(),
	perTaskSpeedLimitKib: zod.z.number().int().min(0).max(1e7).optional(),
	retryCount: zod.z.number().int().min(0).max(20).optional(),
	resumeOnStartup: zod.z.boolean().optional(),
	clipboardMonitoring: zod.z.boolean().optional(),
	notifications: zod.z.boolean().optional(),
	theme: zod.z.enum([
		"system",
		"light",
		"dark"
	]).optional(),
	proxyMode: zod.z.enum([
		"system",
		"direct",
		"manual"
	]).optional(),
	proxyUrl: zod.z.string().max(2048).optional(),
	proxyBypass: zod.z.string().max(2048).optional(),
	userAgent: zod.z.string().max(512).optional(),
	autoStart: zod.z.boolean().optional(),
	minimizeToTray: zod.z.boolean().optional(),
	confirmDelete: zod.z.boolean().optional(),
	historyRetentionDays: zod.z.number().int().min(0).max(3650).optional(),
	logLevel: zod.z.enum([
		"error",
		"warn",
		"info",
		"debug"
	]).optional(),
	bridgeEnabled: zod.z.boolean().optional(),
	bridgePort: zod.z.number().int().min(1024).max(65535).optional(),
	segmentThresholdMib: zod.z.number().int().min(1).max(1024).optional()
});
var scheduleSchema = zod.z.object({
	id: zod.z.string().optional(),
	queueId: zod.z.string().min(1),
	mode: zod.z.enum([
		"once",
		"daily",
		"interval"
	]),
	startAt: zod.z.string().max(64).nullable(),
	stopAt: zod.z.string().max(64).nullable(),
	daysMask: zod.z.number().int().min(0).max(127).nullable(),
	intervalMinutes: zod.z.number().int().min(1).max(10080).nullable(),
	retries: zod.z.number().int().min(0).max(20),
	enabled: zod.z.boolean(),
	action: zod.z.enum([
		"start_queue",
		"stop_queue",
		"start_all",
		"stop_all"
	])
});
var categorySchema = zod.z.object({
	id: zod.z.string().optional(),
	name: zod.z.string().min(1).max(80),
	dir: zod.z.string().min(1).max(1024),
	extensions: zod.z.array(zod.z.string().max(20)).max(100),
	domains: zod.z.array(zod.z.string().max(253)).max(100)
});
function createContext() {
	const logger = new Logger(node_path.default.join(DATA_DIR, "logs"), "info");
	logger.info("engine.start", {
		version: APP_VERSION,
		dataDir: DATA_DIR
	});
	const sqlite = sqliteVersion();
	const db = Database.open(node_path.default.join(DATA_DIR, "tdm.db"), logger);
	const settings = new SettingsService(db, defaultSettings(DOWNLOADS_ROOT), logger);
	const manager = new TaskManager(db, settings, new CategoryService(db, DOWNLOADS_ROOT), logger, emit, DOWNLOADS_ROOT);
	const scheduler = new SchedulerService(manager, logger);
	manager.init();
	scheduler.start();
	return {
		db,
		logger,
		settings,
		manager,
		scheduler,
		startedAt: (/* @__PURE__ */ new Date()).toISOString(),
		sqlite
	};
}
var context = null;
function requireContext() {
	if (!context) throw new Error("Moteur non initialisé");
	return context;
}
async function handle(command, payload) {
	const ctx = requireContext();
	switch (command) {
		case "engine.ping": return {
			ok: true,
			pongAt: (/* @__PURE__ */ new Date()).toISOString(),
			info: engineInfo(ctx)
		};
		case "engine.info": return engineInfo(ctx);
		case "engine.stats": return ctx.manager.stats();
		case "settings.get": return ctx.settings.get();
		case "settings.update": {
			const patch = settingsPatchSchema.parse(payload ?? {});
			const next = ctx.settings.update(patch);
			ctx.manager.applyLimits();
			ctx.scheduler.refresh();
			emit("settings.changed", next);
			return next;
		}
		case "tasks.list": {
			const filter = filterSchema.parse(payload ?? {});
			return ctx.manager.list(filter ?? {});
		}
		case "tasks.get": return ctx.manager.get(taskIdSchema.parse(payload).id);
		case "tasks.probe": return ctx.manager.probeUrl(zod.z.object({ url: zod.z.string().min(1).max(4096) }).parse(payload).url);
		case "tasks.add":
			const parsed = addSchema.parse(payload);
			return ctx.manager.add({
				...parsed,
				checksumExpected: parsed.checksumExpected ?? void 0
			});
		case "tasks.pause": return ctx.manager.pause(taskIdSchema.parse(payload).id);
		case "tasks.resume": return ctx.manager.resume(taskIdSchema.parse(payload).id);
		case "tasks.retry": return ctx.manager.retry(taskIdSchema.parse(payload).id);
		case "tasks.cancel": return ctx.manager.cancel(taskIdSchema.parse(payload).id);
		case "tasks.remove": {
			const parsed = zod.z.object({
				id: zod.z.string().min(1),
				deleteFile: zod.z.boolean().optional()
			}).parse(payload);
			await ctx.manager.remove(parsed.id, parsed.deleteFile ?? false);
			return { ok: true };
		}
		case "tasks.update": {
			const parsed = zod.z.object({
				id: zod.z.string().min(1),
				patch: zod.z.object({
					queueId: zod.z.string().nullable().optional(),
					priority: zod.z.number().int().min(-10).max(10).optional(),
					description: zod.z.string().max(500).optional(),
					connections: zod.z.number().int().min(1).max(16).optional(),
					speedLimitKib: zod.z.number().int().min(0).max(1e7).optional(),
					checksumExpected: zod.z.string().max(80).nullable().optional()
				})
			}).parse(payload);
			return ctx.manager.updateTask(parsed.id, parsed.patch);
		}
		case "tasks.clearFinished": {
			const parsed = zod.z.object({ deleteFiles: zod.z.boolean().optional() }).parse(payload ?? {});
			return { removed: await ctx.manager.clearFinished(parsed.deleteFiles ?? false) };
		}
		case "tasks.startAll":
			ctx.manager.startAll();
			return { ok: true };
		case "tasks.pauseAll":
			ctx.manager.pauseAll();
			return { ok: true };
		case "queues.list": return ctx.manager.listQueues();
		case "queues.create": {
			const parsed = zod.z.object({
				name: zod.z.string().min(1).max(80),
				concurrency: zod.z.number().int().min(1).max(16)
			}).parse(payload);
			return ctx.manager.createQueue(parsed.name, parsed.concurrency);
		}
		case "queues.update": {
			const parsed = zod.z.object({
				id: zod.z.string().min(1),
				patch: zod.z.object({
					name: zod.z.string().min(1).max(80).optional(),
					concurrency: zod.z.number().int().min(1).max(16).optional()
				})
			}).parse(payload);
			return ctx.manager.updateQueue(parsed.id, parsed.patch);
		}
		case "queues.delete":
			ctx.manager.deleteQueue(zod.z.object({ id: zod.z.string().min(1) }).parse(payload).id);
			return { ok: true };
		case "queues.start":
			ctx.manager.startQueue(zod.z.object({ id: zod.z.string().min(1) }).parse(payload).id);
			return { ok: true };
		case "queues.stop":
			ctx.manager.stopQueue(zod.z.object({ id: zod.z.string().min(1) }).parse(payload).id);
			return { ok: true };
		case "schedules.list": return ctx.manager.listSchedules();
		case "schedules.save":
			ctx.manager.saveSchedule(scheduleSchema.parse(payload));
			ctx.scheduler.refresh();
			return ctx.manager.listSchedules();
		case "schedules.delete":
			ctx.manager.deleteSchedule(zod.z.object({ id: zod.z.string().min(1) }).parse(payload).id);
			return ctx.manager.listSchedules();
		case "categories.list": return ctx.manager.listCategories();
		case "categories.save": return ctx.manager.saveCategory(categorySchema.parse(payload));
		case "categories.delete":
			ctx.manager.deleteCategory(zod.z.object({ id: zod.z.string().min(1) }).parse(payload).id);
			return ctx.manager.listCategories();
		case "history.list": {
			const parsed = zod.z.object({ limit: zod.z.number().int().min(1).max(1e3).optional() }).parse(payload ?? {});
			return ctx.manager.listHistory(parsed.limit);
		}
		case "engine.diagnostics": return {
			...engineInfo(ctx),
			databasePath: node_path.default.join(DATA_DIR, "tdm.db"),
			downloadsRoot: DOWNLOADS_ROOT,
			stats: ctx.manager.stats(),
			uptimeSeconds: Math.round((Date.now() - new Date(ctx.startedAt).getTime()) / 1e3)
		};
		case "engine.shutdown":
			ctx.scheduler.stop();
			await ctx.manager.shutdown();
			ctx.db.close();
			context = null;
			return { ok: true };
		default: throw Object.assign(/* @__PURE__ */ new Error(`Commande inconnue : ${command}`), { code: "TDM-E-UNKNOWN-COMMAND" });
	}
}
function engineInfo(ctx) {
	return {
		status: ctx.sqlite.startsWith("unavailable") ? "degraded" : "ready",
		version: APP_VERSION,
		sqliteVersion: ctx.sqlite,
		protocolVersion: PROTOCOL_VERSION,
		startedAt: ctx.startedAt,
		platform: `${process.platform}/${process.arch}`,
		dataDir: DATA_DIR
	};
}
async function main() {
	try {
		context = createContext();
	} catch (error) {
		send({
			protocolVersion: PROTOCOL_VERSION,
			type: "engine.status",
			payload: {
				status: "error",
				message: error instanceof Error ? error.message : String(error)
			},
			at: (/* @__PURE__ */ new Date()).toISOString()
		});
		return;
	}
	const ctx = context;
	emit("engine.status", {
		status: ctx.sqlite.startsWith("unavailable") ? "degraded" : "ready",
		sqliteVersion: ctx.sqlite,
		version: APP_VERSION,
		startedAt: ctx.startedAt
	});
	emit("settings.changed", ctx.settings.get());
	emit("tasks.changed", null);
	emit("queues.changed", ctx.manager.listQueues());
	emit("categories.changed", ctx.manager.listCategories());
	emit("schedules.changed", ctx.manager.listSchedules());
	const heartbeat = setInterval(() => {
		emit("stats.tick", ctx.manager.stats());
	}, 3e3);
	if (typeof heartbeat.unref === "function") heartbeat.unref();
	parentPort.on("message", (event) => {
		const request = event.data;
		if (!request || typeof request.requestId !== "string" || typeof request.command !== "string") return;
		const requestId = request.requestId;
		const command = request.command;
		const payload = request.payload;
		(async () => {
			try {
				if (request.protocolVersion !== PROTOCOL_VERSION) throw Object.assign(/* @__PURE__ */ new Error("Version de protocole incompatible."), { code: "TDM-E-PROTOCOL" });
				const result = await handle(command, payload);
				send({
					protocolVersion: PROTOCOL_VERSION,
					requestId,
					ok: true,
					result
				});
			} catch (error) {
				const mapped = error instanceof zod.z.ZodError ? {
					code: "TDM-E-VALIDATION",
					message: "Données invalides.",
					details: zod.z.prettifyError(error)
				} : error instanceof Error ? {
					code: error.code ?? mapError(error).code,
					message: error.message,
					details: void 0
				} : {
					code: "TDM-E-UNKNOWN",
					message: String(error),
					details: void 0
				};
				send({
					protocolVersion: PROTOCOL_VERSION,
					requestId,
					ok: false,
					error: mapped
				});
			}
		})();
	});
}
process.on("SIGTERM", () => {
	context?.manager.shutdown().finally(() => process.exit(0));
});
main();
