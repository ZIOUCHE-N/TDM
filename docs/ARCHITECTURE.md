# TDM — Architecture

- **Version** : 1.0
- **Date** : 2026-10-23
- **Statut** : **implémentée et vérifiée sous Linux x64 ; Windows non validé**
- **Dépend de** : `TECHNOLOGY_DECISION.md`

> Ce document décrit l'architecture effectivement implémentée dans la version 0.1.0. Les éléments
> seulement planifiés sont explicitement marqués « non implémenté ». Les preuves d'exécution sont dans
> `TEST_PLAN.md`.

---

## 1. Principes

1. **Le moteur ne dépend pas de l'UI.** Il expose un contrat de commandes/événements ; l'interface peut être remplacée sans réécrire le téléchargement.
2. **Le renderer n'a aucun privilège.** Pas de Node.js, pas de FS, pas de réseau ; uniquement un pont typé.
3. **Une seule source de vérité persistante.** SQLite appartient au moteur ; l'UI affiche un état dérivé.
4. **Aucun état ambigu.** Une tâche est `completed` seulement après la fin de tous ses segments, le renommage du fichier et, si demandé, un SHA-256 identique.
5. **Sécurité par défaut.** IPC validé, renderer sans privilège, noms de fichiers assainis, jeton de pont à permissions restreintes, moindre privilège.
6. **Observabilité.** Les transitions sont persistées et historisées ; les erreurs et événements techniques sont journalisés avec l'identifiant de tâche lorsqu'il existe.
7. **Honnêteté produit.** Les limitations serveur/OS sont affichées, pas masquées.

---

## 2. Vue d'ensemble des processus

```text
┌─────────────────────────────────────────────────────────────┐
│ Renderer Electron (sandbox, contextIsolation)               │
│ React + design system TDM                                    │
│ - aucune API Node, aucun accès FS/réseau                     │
│ - window.tdm = API exposée par preload, validée              │
└───────────────────────────┬─────────────────────────────────┘
                            │ IPC contextBridge (allowlist)
┌───────────────────────────▼─────────────────────────────────┐
│ Processus principal Electron                                 │
│ - fenêtre, menus, tray, notifications, autostart             │
│ - cycle de vie, instance unique, supervision du moteur       │
│ - passerelle extension (loopback protégé)                    │
└───────────────┬─────────────────────────────┬───────────────┘
                │ MessagePort typé            │ HTTP local + token
┌───────────────▼─────────────────┐   ┌───────▼───────────────┐
│ utilityProcess : moteur TDM      │   │ Extension MV3          │
│ - ordonnanceur, files, priorités │   │ Chrome/Edge/Firefox    │
│ - client HTTP, segments, reprise │   │ - envoi explicite      │
│ - SQLite, fichiers partiels      │   │ - détection de TDM     │
│ - planificateur, limites, logs   │   │ - permissions minimales│
└───────────────┬─────────────────┘   └───────────────────────┘
                │
      ┌─────────┴──────────┐
      ▼                    ▼
  Système de fichiers   Réseau HTTP/HTTPS
  (partiels, DB, logs)  (serveurs distants)
```

### 2.1 Pourquoi un `utilityProcess`

- Un crash du moteur (mémoire, assertion native, bug de flux) ne détruit pas la fenêtre.
- Le moteur peut être redémarré par le superviseur ; les tâches sont restaurées depuis SQLite.
- L'UI ne peut pas lire arbitrairement le disque : elle ne reçoit que des projections de tâches.
- Le moteur peut continuer lorsque la fenêtre est masquée (tray).

### 2.2 Cycle de vie

```text
app ready
  → verrou d'instance unique
  → démarrage utilityProcess (moteur)
  → le moteur ouvre SQLite, applique le schéma, restaure les tâches non terminales
    et démarre le planificateur
  → l'UI attend `engine.ping` (statut `ready` ou `degraded`)
  → création de la fenêtre / tray
app before-quit
  → commande engine.shutdown (délai 4 s)
  → mise en pause des travaux, attente de leur sortie propre, fermeture SQLite
  → arrêt forcé du processus après 5 s si nécessaire
```

Si le moteur meurt :

1. le superviseur rejette les requêtes en attente ;
2. il redémarre le moteur jusqu'à 5 fois, avec un délai `min(8 s, 800 ms × tentative)` ;
3. le moteur relit SQLite et remet les tâches `downloading`/`probing`/`cancelling` en
   `queued` (ou `paused` si `resumeOnStartup` est désactivé) ;
4. l'UI reçoit `engine.status` avec `error` puis à nouveau `ready`.

---

## 3. Organisation du dépôt

```text
tdm/
├─ src/
│  ├─ main/               # cycle de vie Electron, fenêtre, IPC, pont, menus, tray
│  ├─ preload/            # pont contextBridge typé
│  ├─ renderer/           # React, composants, styles, hooks
│  ├─ engine/             # HTTP, segments, SQLite, files, planificateur, RPC
│  └─ shared/             # protocole et schéma de réglages partagés
├─ tests/                 # Vitest (unitaires + intégration HTTP locale)
├─ scripts/               # smoke, E2E, pont, extension, paquet, icônes
├─ extension/             # Chrome/Edge MV3
├─ extension-firefox/     # Firefox MV3
├─ build/                 # icônes NZix et ressources originales
├─ docs/
├─ electron-builder.yml
├─ electron.vite.config.ts
└─ package.json
```

Règles de dépendance effectives :

- `renderer` → `shared` uniquement, via l'API `window.tdm` du préchargement.
- `main` → `shared` + lancement du processus moteur ; aucune logique de téléchargement.
- `engine` → `shared` + `undici` + `node:sqlite`, jamais `renderer`.
- `extension` / `extension-firefox` → aucun code desktop, uniquement le pont HTTP local.

Le moteur est compilé comme second point d'entrée (`out/main/engine.js`) et lancé dans un
`utilityProcess`.

## 4. Contrat IPC

### 4.1 Enveloppe réelle

```ts
interface EngineRequest {
  protocolVersion: number
  requestId: string
  command: string
  payload?: unknown
}

interface EngineResponse {
  protocolVersion: number
  requestId: string
  ok: boolean
  result?: unknown
  error?: { code: string; message: string; details?: string }
}

interface EngineEvent {
  protocolVersion: number
  type: string
  payload: unknown
  at: string
}
```

Le processus principal ajoute `requestId`, vérifie `protocolVersion` et transmet la réponse au renderer.
Chaque commande valide sa charge utile avec Zod ; une erreur renvoie `ok: false` avec un code stable
(`TDM-E-*`) sans faire tomber le moteur.

### 4.2 Commandes UI → moteur (implémentées)

| Commande | Charge utile | Réponse |
|---|---|---|
| `engine.ping` | — | `{ ok, pongAt, info }` |
| `engine.info` | — | `EngineInfo` |
| `engine.stats` | — | `EngineStats` |
| `engine.diagnostics` | — | diagnostic (versions, chemins, états) |
| `engine.shutdown` | — | arrêt propre |
| `settings.get` | — | `Settings` |
| `settings.update` | patch validé | `Settings` |
| `tasks.list` | filtre optionnel | `TaskView[]` |
| `tasks.get` | `{ id }` | `TaskView` |
| `tasks.probe` | `{ url }` | `ProbeView` |
| `tasks.add` | `AddTaskInput` | `TaskView` |
| `tasks.pause/resume/retry/cancel` | `{ id }` | `TaskView` |
| `tasks.update` | `{ id, patch }` | `TaskView` |
| `tasks.remove` | `{ id, deleteFile? }` | `{ ok }` |
| `tasks.clearFinished` | `{ deleteFiles? }` | `{ removed }` |
| `tasks.startAll` / `tasks.pauseAll` | — | `{ ok }` |
| `queues.list/create/update/delete/start/stop` | selon l'action | `QueueView` / `{ ok }` |
| `schedules.list/save/delete` | selon l'action | `ScheduleView[]` / `{ ok }` |
| `categories.list/save/delete` | selon l'action | `CategoryView` / `{ ok }` |
| `history.list` | `{ limit? }` | `HistoryView[]` |

Les opérations `task.reveal` et `task.open` passent par le processus principal (`shell`), pas par le
moteur.

### 4.3 Événements moteur → UI (implémentés)

| Événement | Fréquence | Contenu |
|---|---|---|
| `task.updated` | à chaque progression significative (~400 ms, lissage UI) | projection `TaskView` |
| `task.added`, `tasks.changed`, `task.removed` | sur changement | tâche ou `null` |
| `queues.changed`, `schedules.changed`, `categories.changed` | sur changement | listes complètes |
| `settings.changed` | après mise à jour | `Settings` |
| `stats.tick` | toutes les 3 s et à chaque progression | compteurs et débit global |
| `engine.status` | démarrage/erreur | `ready`, `degraded` ou `error` |
| `notification` | fin ou échec | titre, corps, `taskId` |

Le processus principal ajoute `bridge.status`, `clipboard.detected`, `ui:command`, `focus-task` et
`theme`. L'UI reçoit le jeton du pont uniquement pour l'afficher et le copier dans
**Paramètres → Navigateur** ; elle ne reçoit aucun mot de passe, en-tête `Authorization` ni contenu
de fichier.

### 4.4 Versionnement

- `protocolVersion` entier, actuellement `1`.
- Le moteur refuse une version différente avec `TDM-E-PROTOCOL`.
- Les évolutions compatibles ajoutent des champs optionnels validés par Zod.
- Aucun fixture de contrat séparé n'est maintenu en 0.1.0 ; les tests d'intégration couvrent les
  commandes principales.

---

## 5. Machine d'états d'une tâche

```text
add (startNow=false) ──────────────────────────────► paused
add (startNow=true) ──► queued ──► probing ──► downloading ──► completed
                          ▲            │            │
                          │            │            ├── pause ─────► paused
                          │            │            ├── cancel ────► cancelling ──► cancelled
                          │            │            ├── erreur ────► failed
                          │            │            └── SHA-256 ───► needs_attention
                          └── resume / retry ─────────────┘
```

Règles effectives :

- `queued` est l'état d'attente d'un créneau ; `pump()` choisit les tâches selon la priorité
  décroissante puis la date de création, dans la limite globale et dans celle de leur file.
- Le moteur refait une analyse (`probe`) au démarrage du travail : `probing` précède toujours
  `downloading`.
- `completed` est écrit après renommage du fichier temporaire et, si une empreinte est demandée,
  après un SHA-256 identique. Il n'existe **pas** d'état `verifying` séparé ni d'appel `fsync`.
- `failed` couvre les erreurs réseau, HTTP, disque et les échecs d'écriture. Les segments peuvent
  être retentés selon `retryCount` ; une fois le travail terminé en échec, aucune reprise
  automatique de la tâche n'est planifiée.
- `needs_attention` n'est utilisé en 0.1.0 que pour un SHA-256 attendu qui ne correspond pas. Le
  fichier temporaire est alors supprimé et les segments vidés ; `resume` repart de zéro.
- `cancelling` est transitoire pendant l'arrêt du travail ; `cancelled` supprime le fichier
  temporaire. Un fichier final déjà livré n'est pas touché par une annulation.
- Chaque transition est écrite en base avant l'émission de l'événement correspondant.
- Une tâche n'est jamais supprimée automatiquement ; seule une action explicite la retire.

---

## 6. Moteur de téléchargement

### 6.1 Pipeline

```text
URL validée (http/https)
  → probe : HEAD, puis GET Range 0-0 si HEAD échoue ou n'annonce pas de taille
  → redirections suivies (8 maximum)
  → détection : taille, MIME, nom, Accept-Ranges, ETag, Last-Modified
  → décision : segments parallèles, mono-segment ou flux inconnu
  → fichier temporaire .<nom>.<8 caractères>.tdm-part dans le dossier final
  → préallocation par truncate si la taille est connue
  → workers (1..N) avec écriture positionnelle
  → progression émise toutes les 300 ms, positions persistées toutes les 500 ms
  → SHA-256 facultatif
  → renommage vers un nom final libre
  → événement completed
```

Aucun `fsync` n'est exécuté avant le renommage ; la durabilité repose sur le système de fichiers
et sur `PRAGMA synchronous=NORMAL`.

### 6.2 Sonde et métadonnées

1. `HEAD` avec les en-têtes configurés (User-Agent, proxy éventuel).
2. Si `HEAD` n'est pas 2xx, ou si `Content-Length` est absent, nul ou invalide : `GET` avec
   `Range: bytes=0-0`.
3. Si la réponse ne permet pas la reprise, un seul flux séquentiel est utilisé ; le fichier reste
   téléchargeable même sans `Content-Length`.
4. Une réponse `416` sur la sonde est interprétée à partir de `Content-Range`.

Champs conservés : URL finale, code, `Content-Type`, `Content-Disposition`, `Content-Length`,
`Accept-Ranges`, `ETag`, `Last-Modified`, `Content-Range`, chaîne de redirections.

Une taille absente n'est pas inventée : l'interface affiche une progression inconnue et masque
l'estimation de temps restant.

### 6.3 Décision de segmentation

La segmentation est **statique**, calculée au démarrage du travail :

1. `N = min(connexions, floor(taille / 1 Mio))`, avec `connexions` borné à 1–16.
2. Si la taille est inférieure au seuil (`segmentThresholdMib`, 8 Mio par défaut) ou si `N <= 1`,
   un seul segment couvre tout le fichier.
3. Sinon, `N` plages contiguës de taille presque égale sont créées, sans trou ni chevauchement.
4. Les segments ne sont pas redécoupés dynamiquement pendant le transfert.
5. En cas de réponse `200` à une requête `Range`, le moteur repart en séquentiel après avoir vidé
   les segments et tronqué le fichier.

Il n'existe pas de plafond de connexions par hôte. L'accélération dépend donc du serveur et du
réseau ; elle n'est jamais garantie.

### 6.4 Reprise

```text
Pour une tâche non terminale reprise :
  1. vérifier que la taille, l'ETag et Last-Modified correspondent à la ressource distante
  2. vérifier l'existence du fichier .tdm-part
  3. charger les positions de segments depuis SQLite
  4. si la forme est identique et que les positions sont cohérentes :
       - ouvrir le fichier en r+ et reprendre chaque segment à sa position
  5. sinon :
       - replanifier les segments et repartir de zéro
```

Une ressource modifiée n'entre pas automatiquement en `needs_attention` : elle provoque une
replanification et un nouveau téléchargement. Le seul cas `needs_attention` de la version 0.1.0
reste l'échec de contrôle SHA-256.

### 6.5 Écriture disque

- Fichier partiel : `.<nom>.<8 premiers caractères de l'id>.tdm-part`, dans `destDir`.
- Écriture positionnelle via un descripteur ouvert en `w+` ou `r+`.
- Taille réservée par `truncate(total)` quand elle est connue.
- À la fin, `uniqueFilePath` choisit un nom libre : `nom (1).ext`, `nom (2).ext`, etc.
  Aucun fichier existant n'est écrasé silencieusement.
- Le fichier final n'apparaît qu'après renommage réussi.
- Le retrait d'une tâche non terminée supprime son `.tdm-part` ; le retrait d'une tâche terminée
  ne supprime le fichier final que si `deleteFile` est demandé.

### 6.6 Limite de débit

- Limiteur global et limiteur par tâche (token bucket, `src/engine/limiter.ts`).
- La limite par tâche utilise `task.speedLimit` si elle est non nulle, sinon
  `perTaskSpeedLimitKib`.
- La limite globale est réappliquée immédiatement après modification des réglages ; une nouvelle
  limite par tâche prend effet à la reprise du transfert.
- Le limiteur attend avant l'écriture ; il ne bloque pas la boucle d'événements.

### 6.7 Concurrence et ordonnancement

Deux niveaux seulement :

1. **Global** : `maxConcurrentDownloads` (3 par défaut, 1–16).
2. **Par file** : `queue.concurrency`, appliquée aux tâches rattachées à une file en marche.

Ordre de démarrage : priorité décroissante, puis `createdAt` croissant. Une tâche sans file peut
démarrer indépendamment de l'état des files. Une tâche en pause ne consomme pas de créneau.

La table `queue_items` existe dans le schéma mais n'est pas utilisée pour l'ordre en 0.1.0.

### 6.8 Erreurs

| Catégorie | Exemples | Politique |
|---|---|---|
| Réseau / timeout | connexion refusée, DNS, délai | Message `TDM-E-NETWORK` ou `TDM-E-TIMEOUT`, échec de la tâche |
| HTTP | 4xx, 5xx | `TDM-E-HTTP` ou code spécifique, échec |
| Reprise | `Range` ignoré, `Content-Range` inattendu | Bascule séquentielle ou `TDM-E-RANGE` |
| Segment incomplet | flux clos avant la fin | `TDM-E-PARTIAL`, retenté selon `retryCount` |
| Disque | `ENOSPC`, `EACCES`, `EROFS`, `ENOENT` | Code `TDM-E-DISK-*`, `TDM-E-PERMISSION`, `TDM-E-READONLY`, `TDM-E-PATH` |
| Contrôle | SHA-256 différent | `needs_attention`, `TDM-E-CHECKSUM` |
| Redirection | boucle ou destination invalide | `TDM-E-REDIRECT`, `TDM-E-REDIRECT-LOOP` |

Retentatives : au niveau du **segment**, `retryCount` fois (3 par défaut), avec un délai
`min(15 s, 500 ms × 2^tentative)`, sans jitter. Il n'y a pas de nouvelle tentative automatique de
la tâche entière après un échec terminal.

---

## 7. Persistance

### 7.1 Schéma réel (version 1)

```sql
CREATE TABLE tasks (
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

CREATE TABLE segments (
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

CREATE TABLE queues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'download',
  concurrency INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'stopped',
  created_at TEXT NOT NULL
);

CREATE TABLE queue_items (
  queue_id TEXT NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY(queue_id, task_id)
);

CREATE TABLE schedules (
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

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  dir TEXT NOT NULL,
  extensions TEXT NOT NULL,    -- tableau JSON
  domains TEXT NOT NULL,       -- tableau JSON
  builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE history (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  event TEXT NOT NULL,
  at TEXT NOT NULL,
  detail_json TEXT
);
```

Il n'existe ni table `rules` ni table `migrations` : les règles de catégorie sont stockées dans les
colonnes JSON `extensions` et `domains`, et le schéma est versionné par `PRAGMA user_version = 1`.

### 7.2 Règles

- Dates en ISO 8601 UTC ; affichage local dans l'interface.
- Montants en octets entiers.
- `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- Une seule migration (version 0 → 1) dans une transaction.
- Une base qui ne s'ouvre pas est renommée `<fichier>.corrupt-<horodatage>`, une base neuve est
  créée et l'événement `db.lastRecovery` est enregistré. Aucun écrasement silencieux.
- Rétention d'historique en jours (90 par défaut, 0 = illimité), purgée au démarrage du moteur.
- `next_run_at` et `last_run_at` sont persistés pour le planificateur.

### 7.3 Emplacements réels

| Élément | Linux | Windows |
|---|---|---|
| Base SQLite | `~/.config/tdm/tdm.db` | `%APPDATA%\tdm\tdm.db` |
| Journaux | `~/.config/tdm/logs/tdm.log` | `%APPDATA%\tdm\logs\tdm.log` |
| Jeton du pont | `~/.config/tdm/bridge-token` (`0600`) | `%APPDATA%\tdm\bridge-token` |
| Téléchargements | `~/Downloads/TDM` | `%USERPROFILE%\Downloads\TDM` |

Les réglages sont stockés dans la table `settings` de la même base, pas dans un fichier séparé.
`TDM_DATA_DIR` et `TDM_DOWNLOADS_DIR` permettent de remplacer ces racines pour les tests.

---

## 8. Files d'attente et planificateur

### 8.1 Files

- La file **Principal** (`queue-default`) est créée au premier démarrage : concurrence 1, état
  `running`, non supprimable.
- Les files personnalisées ont un nom, une concurrence (1–16) et un état `running`/`stopped`.
- Une tâche appartient à zéro ou une file. Une tâche sans file n'est pas soumise à l'état d'une
  file et démarre selon la limite globale.
- Démarrer une file la passe `running` et remet en `queued` ses tâches `paused` ou `failed`.
- Arrêter une file la passe `stopped` et met en pause ses tâches actives ; la progression est
  conservée.
- Supprimer une file détache ses tâches (`queue_id = NULL`) ; aucun fichier n'est supprimé.
- La concurrence d'une file est vérifiée dans `pump()` en comptant les travaux actifs de cette file.
- L'ordre effectif est priorité puis date de création ; `queue_items` n'est pas utilisé.

### 8.2 Planificateur

- Tick de **20 secondes**, uniquement tant que le moteur tourne.
- Modes : `once` (date ISO), `daily` (`HH:MM`, masque de jours), `interval` (N minutes depuis le
  dernier lancement).
- Actions : `start_queue`, `stop_queue`, `start_all`, `stop_all`.
- Une planification `daily` avec une action de démarrage et une heure d'arrêt est traitée comme une
  fenêtre horaire, y compris lorsqu'elle traverse minuit.
- `next_run_at` est calculé à la création/modification et après chaque exécution. Une occurrence
  `once` déjà planifiée et devenue échéante pendant que TDM était fermé est exécutée au premier
  tick après redémarrage. Une occurrence jamais calculée (date déjà passée au moment de
  l'enregistrement) n'est pas rattrapée.
- Une planification `once` est désactivée après exécution ; les autres sont recalculées.
- Le champ `retries` est stocké mais n'est pas utilisé pour réessayer une action échouée.
- Aucune commande externe, extinction ou mise en veille n'est déclenchée.
- **Limite explicite** : aucune exécution si l'application et le moteur sont arrêtés. Le dialogue
  Planificateur l'indique (« le planificateur ne s'exécute que lorsque TDM est actif »).

### 8.3 Horloge

- Les occurrences utilisent l'horloge murale locale (`Date`), pas une horloge monotone.
- Les changements d'heure et les fuseaux ne sont pas testés ; les calculs restent ceux de
  `Date`/`setHours` en heure locale.
- Aucune détection de sommeil prolongé ; un tick en retard exécute l'action due une seule fois.

---

## 9. Sécurité

### 9.1 Frontières de confiance

| Composant | Confiance | Accès |
|---|---|---|
| Renderer | Non fiable | API `window.tdm` + IPC contrôlé |
| Extension | Semi-fiable | Pont loopback authentifié par jeton |
| Processus principal | Fiable | OS, fenêtres, pont, `shell` |
| Moteur | Fiable | FS, réseau, SQLite |
| Contenu distant | Non fiable | Jamais chargé dans la fenêtre ; liens ouverts dans le navigateur système |

### 9.2 Durcissement Electron

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`.
- CSP dans `index.html` : `default-src 'self'`, scripts et connexions limités à `'self'`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` ; `style-src` autorise
  `'unsafe-inline'` pour les styles React.
- `setPermissionRequestHandler` et `setPermissionCheckHandler` refusent toutes les permissions.
- `setWindowOpenHandler` refuse toute nouvelle fenêtre et ouvre uniquement les URL `http(s)` dans le
  navigateur système.
- `will-navigate` bloque toute navigation hors URL de développement ; `will-attach-webview` est
  refusé.
- DevTools activés uniquement lorsque l'application n'est pas empaquetée.
- Préchargement minimal : méthodes nommées, aucun `ipcRenderer` brut exposé.
- Chaque canal IPC vérifie l'expéditeur (`event.sender === mainWindow.webContents`) ; chaque
  commande moteur valide sa charge utile avec Zod.

### 9.3 Chemins et noms

- Les noms de fichiers sont assainis : caractères de contrôle, `<>:"/\|?*`, espaces/points finaux,
  noms réservés Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1..9`, `LPT1..9`), longueur maximale 180.
- Le dossier de destination est choisi par l'utilisateur (`path.resolve`) ; il n'est pas confiné à
  une racine fixe. C'est un choix produit assumé : TDM ne prétend pas être un bac à sable de
  système de fichiers.
- Le retrait d'un fichier final vérifie que le chemin reste dans `destDir` avant suppression.
- Les liens symboliques ne sont pas résolus ni filtrés explicitement ; l'utilisateur choisit ses
  dossiers.
- Aucun fichier existant n'est écrasé : `uniqueFilePath` renomme la destination.

### 9.4 URL et réseau

- Schémas acceptés : `http:` et `https:` uniquement (`assertHttpUrl`).
- Redirections limitées à 8 ; chaque destination est revalidée comme URL HTTP/HTTPS.
- TLS vérifié par `undici` ; aucune option « ignorer les erreurs de certificat ».
- Proxy : `system` via `EnvHttpProxyAgent`, `direct`, ou `manual` via `ProxyAgent` avec liste
  d'exclusion. Pas de PAC, pas d'authentification proxy dédiée dans l'interface.
- `Authorization` et `Cookie` ne sont pas ajoutés par TDM ; seul un `Referer` transmis par le pont
  peut être utilisé.
- Aucun contournement de DRM, de paywall, d'authentification ou de protection de site.

### 9.5 Secrets

- Aucun mot de passe de site ni secret utilisateur n'est stocké par TDM 0.1.0.
- Le jeton du pont est un aléa de 256 bits écrit en clair dans `userData/bridge-token`, permissions
  `0600` sous Linux. Il n'est ni haché ni chiffré, et n'est pas inclus dans les journaux.
- La comparaison du jeton utilise `timingSafeEqual`.
- `safeStorage` n'est pas utilisé ; aucun secret de proxy n'est persisté.

### 9.6 Pont d'extension

- Écoute sur `127.0.0.1` uniquement, port configurable (47831 par défaut), désactivable.
- `GET /v1/ping` et `/v1/health` répondent sans jeton (informations de version uniquement).
- `POST /v1/download` exige `x-tdm-token` ou `Authorization: Bearer`.
- Origines acceptées : absence d'origine, toute origine `chrome-extension://` ou
  `moz-extension://`, et `http://127.0.0.1`/`http://localhost` avec port optionnel. Il n'existe pas
  de liste blanche par identifiant d'extension.
- Corps JSON limité à 64 Kio, URL limitée à 4 096 caractères, schéma HTTP/HTTPS vérifié.
- Limite de 60 requêtes authentifiées par minute et par processus ; réponse `429` au-delà.
- Les réponses CORS renvoient l'origine acceptée ; le jeton n'est jamais renvoyé.
- Rejets et ajouts sont journalisés sans jeton.
- Il n'existe ni rotation automatique, ni révocation depuis l'interface : supprimer le fichier
  `bridge-token` et redémarrer TDM régénère un jeton.

### 9.7 Fichiers exécutables

Aucun avertissement spécifique n'est ajouté pour les extensions exécutables, et aucun contrôle
antivirus n'est effectué. L'utilisateur ouvre un fichier téléchargé à ses risques, après confirmation
dans TDM.

---

## 10. Interface et expérience

L'interface réelle est décrite en détail dans `UI_SPEC.md`. Contraintes effectives :

- Fenêtre unique 1360 × 840 (minimale 1020 × 620), barre latérale de 264 px, panneau de propriétés
  de 378 px lorsqu'une tâche est sélectionnée.
- Barre latérale : tous/en cours/terminés/suspendus/échecs, catégories, files, puis Planificateur,
  Historique et Paramètres.
- Barre d'outils : titre, recherche, **Nouveau**, tout démarrer, tout suspendre, vider les
  terminés, rafraîchir, paramètres, voyants du pont et des transferts.
- Tableau virtualisé à **7 colonnes** : Fichier, État, Taille, Progression, Vitesse, Restant,
  Actions. Tri par Fichier, État, Taille ou Vitesse ; recherche sur nom, URL et hôte.
- Aucun bouton sans commande réelle ; les actions indisponibles sont désactivées et expliquées.
- États vides, chargement, erreur, confirmations, panneau de propriétés, thèmes clair/sombre/système.
- Identité TDM originale pour l'interface (nom, flèche de téléchargement, palette turquoise) ; l'icône
  applicative porte le mot-symbole **NZix** sur une tuile turquoise. Aucune reprise d'icône ou de skin
  tiers.
- Formatage binaire (Kio/Mio/Gio), débit par seconde, dates locales, temps restant prudent.

---

## 11. Observabilité

- Journal JSON par ligne dans `logs/tdm.log`, permissions `0600` :
  `{ "ts", "level", "event", "detail" }`. `detail` est expurgé récursivement pour les clés
  contenant `token`, `password`, `secret`, `authorization` ou `cookie`, et tronqué à 2 000
  caractères.
- Niveaux : `error`, `warn`, `info`, `debug` (réglable dans les paramètres).
- Rotation : au démarrage du moteur, si `tdm.log` dépasse 10 Mio, il est renommé `tdm.log.1`
  (un seul fichier de sauvegarde). La rotation n'est pas vérifiée pendant l'exécution.
- Les erreurs et avertissements sont aussi copiés sur la sortie standard du processus moteur.
- Diagnostic (`engine.diagnostics`) : version, plateforme, version SQLite, protocole, date de
  démarrage, durée de service, chemins de la base et des téléchargements, compteurs de tâches,
  débit agrégé et octets reçus. Il est affiché dans un dialogue et copiable en JSON.
- Aucune télémétrie réseau, aucun envoi de rapport.
- Compteurs exposés : en attente, actifs, suspendus, terminés, échoués, annulés, débit total,
  octets reçus, travaux actifs.
- L'historique conserve les événements `task.added`, `task.paused`, `task.resumed`,
  `task.cancelled`, `task.removed`, les changements d'état des travaux, et les démarrages/arrêts
  de files. Les ticks du planificateur sont journalisés dans `tdm.log`, pas dans l'historique.

---

## 12. Tests et qualité

### 12.1 Moyens réellement utilisés

- Vitest pour les unitaires et l'intégration.
- Serveurs HTTP locaux réels, avec tailles, délais, Range, ETag et cas dégradés.
- Playwright pour l'application Electron et pour Chromium avec l'extension.
- Aucun mock du moteur pour les scénarios de téléchargement.

Scénarios couverts : segments, pause/reprise, annulation, retrait, Range ignoré, flux sans
`Content-Length`, HEAD à taille nulle, SHA-256 invalide puis reprise, file d'attente, planification,
pont authentifié, extension Chrome/Chromium, paquets Linux.

### 12.2 Portes de qualité appliquées

- TypeScript strict (`noUnusedLocals`, `noUncheckedIndexedAccess`).
- `pnpm typecheck` et `pnpm build` obligatoires.
- `pnpm test` doit sortir avec le code 0 et sans erreur non capturée.
- Aucun test marqué « réussi » sans exécution réelle.
- Pas d'ESLint/Prettier configuré en 0.1.0 ; pas de mesure de couverture.
- Pas de test de migration (schéma version 1 unique).
- Pas de test de reprise après `SIGKILL` ; la reprise après arrêt propre est couverte par la logique et
  les tests de pause.
- E2E Playwright exécuté sous Linux uniquement ; Windows reste à faire en CI/VM.

---

## 13. Packaging et mise à jour

### 13.1 Linux (implémenté)

- `.deb` via electron-builder (fpm), dépendances GTK/notify/NSS/XSS/XTST/xdg-utils/AT-SPI/libsecret.
- AppImage portable.
- Fichier `.desktop` (`Exec=/opt/TDM/tdm %U`, `StartupWMClass=TDM`, catégorie `Network`), icônes.
- Installation dans `/opt/TDM` ; données utilisateur hors paquet.
- AppImage validée avec extraction à la volée ; `.deb` non installé sur système vierge.

### 13.2 Windows (configuré, artefact produit sous Wine, non validé)

- NSIS x64, installation par utilisateur, choix du dossier, raccourcis.
- Installeur `dist/tdm-0.1.0-x64-setup.exe` produit depuis Linux avec Wine 6.0.3 et un préfixe dédié ;
  archive contrôlée par `7z t`, icônes NZix (16 à 256 px) présentes dans `TDM.exe` et dans l'installeur.
- Signature Authenticode non configurée ; avertissement SmartScreen à documenter.
- Aucune installation ni exécution sur Windows 10/11 : la production de l'artefact ne constitue pas une
  validation de fonctionnement.

### 13.3 Mise à jour (non implémenté)

- Aucun `electron-updater`, aucun canal de mise à jour, aucune signature de métadonnées.
- La mise à jour est manuelle : réinstaller un paquet plus récent.
- Toute mise à jour automatique future devra être opt-in et refuser une signature invalide.

---

## 14. Limites connues de l'architecture

1. Le planificateur ne tourne pas si l'application est quittée.
2. La capture vidéo et les DRM ne sont pas pris en charge.
3. FTP, MMS, NTLM et Kerberos ne sont pas dans le périmètre v1.
4. L'accélération n'est pas garantie ; elle dépend du serveur et du réseau.
5. Le canal extension v1 utilise un port loopback protégé, pas encore de native messaging.
6. Windows n'est pas validable sur l'hôte Linux ; la CI/VM est obligatoire.
7. Le paquet Electron est volumineux.
8. SQLite et le moteur sont locaux à une seule instance ; pas de synchronisation multi-appareils.

---

## 15. État de réalisation

| Phase | État |
|---|---|
| 1. Audit des références | Terminé (`REFERENCE_AUDIT.md`) |
| 2. Comparaison technologique | Terminé (`TECHNOLOGY_COMPARISON.md`, `TECHNOLOGY_DECISION.md`) |
| 3. Exigences | Terminé (`REQUIREMENTS.md`) |
| 4. Interface | Terminé (`UI_SPEC.md`) |
| 5. Moteur HTTP | Terminé et testé |
| 6. Persistance et reprise | Terminé ; reprise après pause testée, reprise après arrêt complet non testée |
| 7. Files d'attente | Terminé et testé |
| 8. Planificateur | Terminé et testé (actif seulement application ouverte) |
| 9. Catégories et outils | Terminé |
| 10. Navigateur et sécurité | Terminé ; extension testée dans Chromium |
| 11. Tests | Terminé sous Linux ; Windows et Firefox non exécutés |
| 12. Packaging | Linux produit et vérifié ; installeur Windows produit sous Wine, non validé |
| 13. Documentation | Terminé |

Travaux restants avant une diffusion large : validation Windows, installation `.deb` sur système
vierge, extension Firefox, menus contextuels/notifications des navigateurs, audit d'accessibilité,
signature des paquets et page de projet réelle.
