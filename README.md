# TDM — Téléchargement Download Manager

TDM est un gestionnaire de téléchargements **HTTP/HTTPS** conçu pour Linux et Windows, écrit
from scratch avec Electron, TypeScript et React. Il reprend les usages courants d'un gestionnaire de
téléchargements — reprise, segments parallèles, files d'attente, catégories, planificateur local — sans
réutiliser le code, les ressources ni l'identité visuelle d'un produit commercial.

> TDM n'est ni affilié à, ni dérivé de Internet Download Manager (IDM). Aucun binaire ou code privé
> d'IDM n'a été utilisé. Voir [`docs/REFERENCE_AUDIT.md`](docs/REFERENCE_AUDIT.md).

## Fonctionnalités principales

- Téléchargement HTTP/HTTPS avec inspection HEAD/Range, redirections et détection de reprise.
- Découpage en segments parallèles (1 à 16 connexions) et reprise après pause ; les tâches non
  terminales sont restaurées au redémarrage (reprise après arrêt brutal non testée).
- Repli automatique en séquentiel si le serveur ignore `Range`, flux sans `Content-Length`.
- Pause, reprise, annulation, nouvelle tentative, priorité, limite de vitesse globale et par tâche.
- Files d'attente avec concurrence propre et reprise des tâches suspendues au démarrage de la file.
- Catégories par extension/domaine, dossier de destination, vérification SHA-256 facultative.
- Planificateur local (une fois, quotidien, intervalle, fenêtre horaire) actif tant que TDM tourne.
- Interface React : tri, recherche, table virtualisée, panneau de propriétés, thèmes clair/sombre.
- Pont navigateur explicite sur `127.0.0.1` avec jeton, contrôle d'origine et limitation de débit.
- Extensions Chrome/Edge (MV3) et Firefox (MV3) fournies, sans injection dans les pages ; variante
  Chrome/Chromium chargée et testée dans un navigateur réel.
- Base SQLite locale via `node:sqlite`, journaux, diagnostic, historique.
- Paquets Linux `.deb` et AppImage ; installeur NSIS Windows produit sous Wine (non validé sur Windows).

Les statuts précis — **vérifié**, **implémenté**, **non exécuté** — figurent dans
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) et [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## Pile technique

| Composant | Choix |
| --- | --- |
| Bureau | Electron 45.0.0 |
| Interface | React 19.3.1, TypeScript 5.9.3, Vite 8.3.5 / electron-vite 6.0.0 |
| Moteur | processus utilitaire Electron séparé, `undici` 8.12.3 |
| Validation IPC | Zod 4.6.7 |
| Persistance | `node:sqlite` (SQLite 3.53.4 fourni par Electron 45) |
| Tests | Vitest 5.0.5, Playwright 1.64.1 |

Les justifications et alternatives évaluées sont dans
[`docs/TECHNOLOGY_COMPARISON.md`](docs/TECHNOLOGY_COMPARISON.md) et
[`docs/TECHNOLOGY_DECISION.md`](docs/TECHNOLOGY_DECISION.md).

## Démarrage rapide

Prérequis : Linux Mint/Ubuntu ou Windows 10/11, Node.js ≥ 22, pnpm ≥ 9.

```bash
pnpm install
pnpm dev          # développement (rechargement de l'interface)
pnpm typecheck
pnpm test
pnpm test:e2e      # interface réelle + serveur HTTP local
pnpm test:bridge   # pont authentifié
pnpm test:extension # extension dans Chromium
pnpm build
pnpm start        # exécute le build courant
```

Sous Linux, si Electron ne démarre pas dans un environnement sans bac à sable graphique :

```bash
pnpm exec electron . --no-sandbox --disable-gpu --in-process-gpu --disable-dev-shm-usage
```

## Paquets

```bash
pnpm dist:linux   # dist/tdm-<version>-x86_64.AppImage et dist/tdm-<version>-amd64.deb
pnpm dist:win     # Windows natif/CI, ou Wine avec un préfixe dédié
```

L'installeur Windows `dist/tdm-0.1.0-x64-setup.exe` a été produit depuis Linux avec Wine et contrôlé
avec `7z t` ; **il n'a été ni installé ni exécuté sur Windows 10/11**, donc il n'est pas présenté comme
validé. Les empreintes SHA-256 des trois artefacts sont dans `dist/SHA256SUMS` et la provenance dans
`dist/BUILD-INFO.txt` (`sha256sum -c SHA256SUMS`). Voir [`docs/BUILD.md`](docs/BUILD.md) et
[`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

## Extension navigateur

1. Lancer TDM et ouvrir **Paramètres → Navigateur**.
2. Copier le jeton d'appairage et vérifier le port (47831 par défaut).
3. Chrome/Edge : `chrome://extensions` → mode développeur → **Charger l'extension non empaquetée** →
   dossier `extension/`.
4. Firefox : `about:debugging#/runtime/this-firefox` → **Charger un module temporaire** →
   `extension-firefox/manifest.json`.
5. Dans la fenêtre de l'extension, coller le jeton puis **Tester**. Le menu contextuel permet ensuite
   « Télécharger le lien avec TDM ».

Le pont HTTP et l'extension ont été testés de bout en bout dans Chromium 156 (chargement MV3, jeton,
ping, envoi et téléchargement réel). Firefox et les Chrome/Edge de marque n'ont pas été exécutés ; voir
[`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## Documentation

- [Exigences](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Spécification d'interface](docs/UI_SPEC.md)
- [Plan de test et preuves](docs/TEST_PLAN.md)
- [Construction et paquets](docs/BUILD.md)
- [Guide utilisateur](docs/USER_GUIDE.md)
- [Limites connues](docs/LIMITATIONS.md)
- [Audit des références](docs/REFERENCE_AUDIT.md)
- [Journal des changements](CHANGELOG.md)
- [Licence MIT](LICENSE)

## Données locales

- Configuration et journaux : `~/.config/tdm` (Linux) ou `%APPDATA%\tdm` (Windows).
- Téléchargements par défaut : `~/Downloads/TDM` (Linux) ou `%USERPROFILE%\Downloads\TDM` (Windows).
- Jeton du pont : `userData/bridge-token`, permissions `0600` sous Linux.
- Les fichiers temporaires utilisent l'extension `.tdm-part` et ne remplacent jamais le fichier final
  avant vérification.

## Licence

MIT — voir [`LICENSE`](LICENSE). Les icônes et ressources de `build/` (icône applicative NZix),
`extension/icons/` et `extension-firefox/icons/` sont originales et générées pour ce projet.
