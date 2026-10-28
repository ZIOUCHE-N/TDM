# TDM — Décision technologique (ADR-001)

- **Statut** : **ACCEPTÉE — implémentée et vérifiée sous Linux x64** ; validation Windows en attente
- **Date** : 2026-10-23
- **Décideur** : utilisateur (Nacer)
- **Rédacteur** : architecte TDM
- **Remplace** : aucune décision antérieure
- **Documents liés** : `REFERENCE_AUDIT.md`, `TECHNOLOGY_COMPARISON.md`, `ARCHITECTURE.md`

---

## 1. Contexte

TDM doit être un gestionnaire de téléchargements de bureau fiable, moderne et maintenable, fonctionnant sous Linux Mint/Ubuntu et Windows 10/11. Les fonctions essentielles documentées d'IDM servent de référence, mais l'implémentation, l'identité et les ressources doivent être originales.

Contraintes structurantes :

- moteur réseau **séparé** de l'interface ;
- reprise après redémarrage et intégrité des fichiers ;
- files, priorités, limite de débit, planificateur ;
- extension navigateur avec canal local sécurisé ;
- packaging Linux et Windows ;
- aucune fonction décorative ni simulée ;
- aucune promesse de capture vidéo ou de contournement de protections.

L'audit (Phase 1) a confirmé les fonctions documentées et leurs limites. La comparaison (Phase 2) a évalué cinq stacks. Le choix se joue entre **Electron/TypeScript** (livraison, écosystème, tests) et **Tauri/Rust** (sécurité, taille, performances), les autres options étant distancées.

---

## 2. Décision retenue

### 2.1 Stack principale

| Couche | Choix | Version de référence |
|---|---|---|
| Application desktop | **Electron** | 45.x (Chromium 156, Node 24.22) |
| Langage | **TypeScript strict** | 5.x stable verrouillée |
| UI | **React** + Vite | React 19.x, Vite stable |
| Moteur | **Node.js dans un `utilityProcess` Electron** | Node 24.22 embarqué |
| Base locale | **SQLite** via `node:sqlite` | Module intégré à Node 24.22 |
| Validation | **Zod** | Dernière stable |
| Tests unitaires/intégration | **Vitest** | Dernière stable |
| Tests E2E | **Playwright** (Electron) | Dernière stable |
| Packaging | **electron-builder** | 26.x |
| Mises à jour | **manuelles** en 0.1.0 (réinstallation d'un paquet) ; `electron-updater` non intégré | — |
| Extension | **MV3** Chromium + Firefox | Manifest V3 |

> Les versions sont verrouillées dans `pnpm-lock.yaml` et `package.json`. Versions effectivement
> installées et utilisées : Electron 45.0.0, TypeScript 5.9.3, React 19.3.1, Vite 8.3.5,
> electron-vite 6.0.0, Zod 4.6.7, Vitest 5.0.5, Playwright 1.64.1, electron-builder 26.15.3.

### 2.2 Architecture réseau

- Le moteur tourne dans un **processus dédié** lancé par le processus principal Electron via `utilityProcess`.
- L'UI (renderer sandboxé) ne parle jamais au réseau ni au disque directement.
- Le processus principal sert de **superviseur** : démarrage, redémarrage, limite de messages, arrêt propre.
- Le moteur possède la base SQLite, les fichiers partiels, les sockets et les horloges.
- Contrat IPC typé, validé par Zod, versionné, avec identifiants de requête et erreurs normalisées.

### 2.3 Base de données

- SQLite en mode **WAL**, `foreign_keys=ON`, `busy_timeout`.
- Migrations versionnées via `PRAGMA user_version`.
- Pas de sauvegarde automatique avant migration en 0.1.0 : une base qui ne s'ouvre pas est renommée
  `<fichier>.corrupt-<horodatage>` et une base neuve est créée ; aucune restauration automatique.
- Tables effectives : `tasks`, `segments`, `queues`, `queue_items`, `schedules`, `categories`,
  `settings`, `history`. Il n'existe ni table `rules` (les règles de catégorie sont des colonnes
  JSON) ni table `migrations` (versionnement par `PRAGMA user_version`).
- Aucun mot de passe de site n'est stocké. Le jeton du pont est écrit en clair dans
  `userData/bridge-token` avec la permission `0600` sous Linux ; `safeStorage` n'est pas utilisé.

### 2.4 Stratégie de tests

| Niveau | Outil | Périmètre |
|---|---|---|
| Unitaire | Vitest | Planificateur de segments, token bucket, validation de chemins, machine d'états, parseurs |
| Intégration | Vitest + serveur HTTP local | Téléchargement, Range, redirections, 404/500, coupure, reprise, ressource modifiée |
| Persistance | Vitest + SQLite temporaire | Migrations, corruption, reprise après kill |
| Sécurité | Vitest | Messages IPC malformés, traversée de chemins, origine/token |
| E2E | Playwright | Ajout d'URL, pause, reprise, suppression, propriétés, files, planificateur |
| Packaging | CI Linux + Windows | Installation, lancement, désinstallation |
| Manuel | Checklist | Tray, notifications, thème, accessibilité, extension réelle |

**Couverture effective en 0.1.0** : 23 tests Vitest (segments, planificateur, chemins, 10 scénarios
d'intégration), E2E ajout/analyse/pause/reprise/propriétés/réglages, pont authentifié, extension dans
Chromium, paquets Linux. Non exécutés : migrations et corruption SQLite, reprise après `kill`,
token bucket, messages IPC malformés, échappement par liens symboliques/`realpath`,
redirections/404/500 dédiés, suppression/files/planificateur en E2E, installation/désinstallation,
accessibilité, Windows et Firefox. Le détail est dans `TEST_PLAN.md` §7.

### 2.5 Packaging

- **Linux** : `.deb` (Ubuntu/Mint) + AppImage, architectures x64 (arm64 si build disponible).
- **Windows** : NSIS x64, installation par utilisateur par défaut ; MSI/ARM64 en option.
- **CI** : GitHub Actions matrice `ubuntu-latest` et `windows-latest`.
- **Signature** : non disponible ; les artefacts Linux sont livrés non signés. Aucune affirmation de paquet Windows testé sans exécution réelle en CI ou VM Windows.
- **Données utilisateur** : conservées à la désinstallation par défaut, suppression proposée explicitement.

### 2.6 Intégration navigateur

**v1** : extension MV3 (Chrome, Edge, Firefox) + canal local :

- écoute sur `127.0.0.1` uniquement, port fixe configurable (47831 par défaut) ;
- jeton aléatoire de 256 bits, généré par l'application et recopié dans les options de l'extension ;
- acceptation de toute origine `chrome-extension://` ou `moz-extension://` (pas de liste blanche par
  identifiant), plus l'absence d'origine et `127.0.0.1`/`localhost` ;
- schémas de messages validés, taille limitée, limitation de débit, pas de CORS sauvage ;
- aucune action implicite : l'utilisateur déclenche l'envoi.

**Évolution prévue** : hôte de *native messaging* (`tdm-nmh`) pour supprimer le port TCP, en P1/P2. Aucune capture universelle n'est promise ; la prise en charge automatique des téléchargements reste optionnelle et limitée aux types autorisés.

### 2.7 Planificateur

- Le planificateur s'exécute **dans le moteur**, tant que TDM ou son processus moteur est actif,
  avec un tick de 20 secondes.
- TDM peut rester en tray pour permettre l'exécution en arrière-plan.
- **Application quittée = aucune exécution planifiée.** Le dialogue Planificateur l'indique
  explicitement.
- Aucun service système, tâche Windows ou timer systemd n'est fourni en v1. Une intégration OS
  pourra être ajoutée ultérieurement, avec validation séparée.

---

## 3. Justification

1. **Séparation réelle** : `utilityProcess` isole le moteur ; un crash réseau ne fige pas l'UI et inversement.
2. **Fiabilité** : Node 24 gère les flux, `AbortController`, les timeouts, les agents proxy et l'écriture incrémentale sans charger le fichier en mémoire.
3. **Productivité** : un seul langage pour le moteur, l'UI, les schémas IPC et les tests.
4. **Tests** : Vitest et Playwright couvrent unité, intégration et E2E, avec un serveur local reproductible.
5. **Distribution** : electron-builder produit `.deb`, AppImage et NSIS ; electron-updater gère les mises à jour signées.
6. **Intégration desktop** : tray, notifications, autostart, instance unique, menus natifs et presse-papiers sont disponibles sans plugins fragiles.
7. **Score** : 90,4/100 sur la matrice pondérée ; premier sur la compatibilité, l'intégration système/navigateur, les tests et la distribution.
8. **Réversibilité partielle** : le moteur est derrière un contrat IPC ; l'UI peut être redessinée sans le modifier. Le moteur pourrait être réimplémenté en Rust plus tard, mais ce serait un chantier, pas un simple remplacement.

---

## 4. Alternatives examinées et raisons du rejet

| Alternative | Score | Raison du rejet pour la v1 |
|---|---:|---|
| **Tauri 2 / Rust** | 86,2 | Meilleur sur sécurité/taille, mais toolchain absente, délai et complexité supérieurs, WebView système à valider sur deux OS. **Choix de repli recommandé** si sécurité/taille deviennent prioritaires. |
| **PySide6** | 82,6 | Bonne productivité, mais paquet lourd, intégration desktop via Qt, séparation multi-processus moins naturelle, distribution Windows plus fragile. |
| **Qt 6 / C++** | 81,8 | UI native excellente et performances, mais développement et packaging trop coûteux pour le calendrier ; Qt absent de l'hôte. |
| **Flutter Desktop** | 76,0 | UI superbe, mais écosystème desktop et intégration système/navigateur insuffisants pour un gestionnaire de téléchargements exigeant. |

---

## 5. Conséquences

### 5.1 Positives

- Un produit desktop complet peut être livré et testé dans cet environnement.
- Le moteur est supervisé et remplaçable derrière un contrat stable.
- Les tests réseau peuvent être reproductibles et automatisés.
- La feuille de route Linux/Windows est réaliste.

### 5.2 Négatives et risques

| Risque | Gravité | Mitigation |
|---|---|---|
| Paquet 90–150 Mo, mémoire 150–300 Mo | Moyenne | Assumer le compromis ; optimiser le renderer, pas de frameworks lourds inutiles |
| Surface d'attaque Chromium/Node | Élevée | `contextIsolation`, `sandbox`, CSP stricte, pas de `nodeIntegration`, mise à jour régulière, audit npm |
| Dépendances npm nombreuses | Moyenne | Lockfile, `pnpm audit`, dépendances minimales, revue des scripts postinstall |
| `node:sqlite` dans Electron 45 | Levée | Validé : SQLite 3.53.4 accessible via `node:sqlite`, sans repli |
| Windows non testable localement | Élevée | CI Windows obligatoire ; aucun paquet Windows déclaré testé sans exécution réelle |
| Signature de code absente | Moyenne | Documenter les avertissements SmartScreen ; acquisition d'un certificat ultérieure |
| Canal local exposé | Élevée | Loopback, token, origine, schémas, débit limité ; native messaging en évolution |
| Planificateur limité à l'app active | Moyenne | UX explicite ; pas de promesse de service système |
| Dérive « web app » | Moyenne | Design system desktop, menus natifs, raccourcis, densité, tests d'accessibilité |

---

## 6. Conditions de validation

Les conditions ci-dessous ont été validées par l'utilisateur et mises en œuvre :

1. **Stack** : Electron 45 + TypeScript + React, moteur `utilityProcess`, SQLite.
2. **Périmètre v1** : HTTP/HTTPS, reprise, segments, files, planificateur de base, catégories, extension explicite ; FTP/MMS/grabber/vidéo hors v1.
3. **Canal navigateur v1** : loopback protégé par token et origine, native messaging en évolution.
4. **Planificateur** : actif seulement si TDM tourne (y compris en tray) ; pas de service système v1.
5. **Packaging** : .deb + AppImage + NSIS ; Windows validé en CI, pas déclaré testé localement.
6. **Identité** : nom TDM, palette et icônes originales, aucune ressource IDM.

### 6.1 Spike technique — exécuté

Le prototype minimal a été réalisé et a validé :

- le lancement d'Electron 45 avec `utilityProcess` et IPC typé ;
- l'accès à `node:sqlite` (SQLite 3.53.4 embarqué), sans repli nécessaire ;
- le téléchargement local avec `undici`, flux vers disque, `Range` et reprise ;
- le packaging Linux `.deb` et AppImage ;
- les tests Vitest (23 tests) et les scripts E2E/extension/pont exécutés.

Aucun point bloquant n'a imposé de réexamen. Les preuves et les limites sont dans `TEST_PLAN.md`.

---

## 7. Ce que la décision n'autorise pas

- Télécharger ou exécuter IDM.
- Copier des icônes, skins, textes ou ressources IDM.
- Promettre une accélération, une capture vidéo ou une compatibilité Windows non testée.
- Exposer un port local sans authentification.
- Stocker des mots de passe en clair.
- Installer des composants système sans accord.

---

## 8. Signature

| Rôle | Nom | Décision | Date |
|---|---|---|---|
| Architecte | TDM | Recommande Electron 45 + TypeScript | 2026-10-23 |
| Utilisateur | Nacer | Approuvé | 2026-10-23 |
