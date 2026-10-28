# Construction, tests et paquets

## 1. Prérequis

| Outil | Version utilisée | Remarque |
| --- | --- | --- |
| Node.js | 26.8.1 | ≥ 22 recommandé (`node:sqlite`, ESM) |
| pnpm | 10.x | `pnpm-lock.yaml` fourni |
| Linux | Mint/Ubuntu x64 | GTK 3, FUSE pour AppImage |
| Windows | 10/11 x64 | Pour `pnpm dist:win` |
| Electron | 45.0.0 | installé par pnpm |

Sous Linux, les paquets de compilation ne sont pas nécessaires : aucune dépendance native n'est
compilée (`node:sqlite` est fourni par Electron).

## 2. Installation et développement

```bash
pnpm install
pnpm dev
```

`electron-vite` reconstruit le processus principal, le préchargement et l'interface. Le moteur est un
second point d'entrée (`src/engine/entry.ts`) chargé dans un `utilityProcess`.

Sans session graphique complète ou dans un conteneur :

```bash
pnpm dev -- --no-sandbox --disable-gpu --in-process-gpu --disable-dev-shm-usage
```

ou pour le build :

```bash
pnpm exec electron . --no-sandbox --disable-gpu --in-process-gpu --disable-dev-shm-usage
```

## 3. Vérifications

```bash
pnpm typecheck   # deux projets TypeScript : node et web
pnpm test        # Vitest, 23 tests
pnpm build       # produit out/
```

Tests d'interface et de paquet :

```bash
node scripts/smoke.mjs
node scripts/e2e.mjs
node scripts/bridge-test.mjs
node scripts/extension-test.mjs   # Chromium + extension réelle
node scripts/packaged-smoke.mjs dist/linux-unpacked/tdm
node scripts/packaged-smoke.mjs dist/tdm-0.1.0-x86_64.AppImage
```

Ces scripts lancent l'application réelle via Playwright ; ils nécessitent un serveur X/Wayland. Les
captures sont écrites dans `artifacts/`.

## 4. Paquet Linux

```bash
pnpm dist:linux
```

Produit, via `electron-builder.yml` :

- `dist/tdm-0.1.0-x86_64.AppImage`
- `dist/tdm-0.1.0-amd64.deb`
- `dist/linux-unpacked/` pour le débogage

Caractéristiques :

- `appId` : `org.tdm.downloadmanager`, `productName` : `TDM`.
- Catégorie bureau `Network`, `StartupWMClass=TDM`, entrée `tdm.desktop` (`Exec=/opt/TDM/tdm %U`).
- Ressources embarquées : icônes, icône de zone de notification, extensions navigateur, licence MIT.
- `asar` activé.
- Dépendances `.deb` : GTK 3, notify, NSS, XSS, XTST, xdg-utils, AT-SPI, libsecret.

L'AppImage a été validée avec `APPIMAGE_EXTRACT_AND_RUN=1` (utile si FUSE n'est pas disponible). Le
script `packaged-smoke.mjs` positionne cette variable automatiquement.

## 5. Paquet Windows

```bash
pnpm dist:win
# ou, si le préfixe Wine par défaut est inutilisable :
WINEPREFIX=/tmp/opencode/wine-tdm pnpm dist:win
```

Configuration NSIS : installation par utilisateur, choix du dossier, raccourcis bureau et menu Démarrer,
`artifactName: tdm-${version}-${arch}-setup.exe`.

L'installeur a été produit depuis Linux avec Wine 6.0.3 et un préfixe dédié
(`WINEPREFIX=/tmp/opencode/wine-tdm`). Le préfixe `~/.wine` du poste de développement est en 64 bits et
provoquait l'erreur `cannot be used with a 32-bit wineserver` ; utiliser un préfixe neuf évite ce conflit.

Artefacts obtenus : `dist/tdm-0.1.0-x64-setup.exe` (NSIS, non signé, ≈109 Mio) et
`dist/win-unpacked/TDM.exe`. L'archive NSIS a été contrôlée avec `7z t` (« Everything is Ok ») et les six
images de `build/icon.ico` (16/32/48/64/128/256) ont été retrouvées dans les ressources des deux
exécutables.

**Cette production sous Wine ne remplace pas une validation Windows.** L'installeur n'a été ni installé
ni exécuté sur Windows 10/11 ; il ne doit pas être présenté comme validé avant la checklist ci-dessous.

Checklist Windows :

1. `pnpm typecheck && pnpm test && pnpm build`.
2. `pnpm dist:win` sur Windows ou CI Windows.
3. Installer le NSIS sur une VM propre.
4. Vérifier le démarrage, le moteur (`engine.ping`), SQLite, le pont et un téléchargement réel.
5. Vérifier les chemins `%APPDATA%\tdm` et `%USERPROFILE%\Downloads\TDM`.
6. Vérifier la zone de notification, les notifications et le démarrage automatique.
7. Tester la reprise après fermeture pendant un téléchargement.

## 6. Extensions navigateur

Les dossiers `extension/` (Chrome/Edge, MV3 service worker) et `extension-firefox/` (Firefox, MV3
scripts d'arrière-plan) sont copiés dans les ressources du paquet. Pour le développement :

- Chrome/Edge : `chrome://extensions` → mode développeur → charger `extension/`.
- Firefox : `about:debugging#/runtime/this-firefox` → charger `extension-firefox/manifest.json`.

Aucune étape de build n'est nécessaire : ce sont des fichiers statiques. Les icônes proviennent de
`extension/icons/` (générées par le projet).

## 7. Icônes et ressources

```bash
python3 scripts/generate-nzix-icon.py   # icônes de l'application (paquet, fenêtre, zone de notification)
node scripts/generate-icons.mjs         # icônes des extensions navigateur uniquement
```

`scripts/generate-nzix-icon.py` dessine le mot-symbole **NZix** sur une tuile turquoise arrondie et écrit
`build/icon.png` (512 px), `build/icon.ico` (16/32/48/64/128/256), `build/icons/*.png` (16 à 256 px),
`build/tray.png` et `build/notification.png`. Il nécessite Pillow et la police
`DejaVuSansCondensed-Bold`, uniquement au moment du développement : ni Pillow ni la police ne sont
embarqués dans l'application.

`scripts/generate-icons.mjs` ne touche plus à `build/` : il ne régénère que `extension/icons/` et
`extension-firefox/icons/` (16/32/48/128) afin de ne pas écraser les icônes NZix.

Les ressources originales sont :

- `build/icon.png`, `build/icon.ico`, `build/icons/` (tailles Linux) — mot-symbole NZix ;
- `build/tray.png`, `build/notification.png` ;
- `extension/icons/` et `extension-firefox/icons/` (16/32/48/128).

Aucune icône, police ou capture d'un produit tiers n'est incluse. L'interface conserve le nom **TDM** ;
**NZix** n'est utilisé que comme mot-symbole de l'icône applicative.

## 8. Structure du dépôt

```
src/main/        cycle de vie Electron, fenêtre, IPC, pont, menus, tray
src/preload/     API typée exposée à l'interface
src/renderer/    React, composants, styles
src/engine/      moteur HTTP, SQLite, files, planificateur, RPC
src/shared/      protocole et schéma de réglages partagés
tests/           Vitest
scripts/         smoke, E2E, pont, paquet, icônes
extension/       Chrome/Edge MV3
extension-firefox/ Firefox MV3
docs/            audit, architecture, exigences, tests, guides
build/           ressources de paquet
```

## 9. Dépannage

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| `Moteur en cours de démarrage` au premier ping | course au lancement | attendre la fin du démarrage ; les scripts réessaient |
| Electron ne s'ouvre pas en conteneur | sandbox/GPU | ajouter `--no-sandbox --disable-gpu --in-process-gpu` |
| AppImage refuse de démarrer | FUSE absent | `APPIMAGE_EXTRACT_AND_RUN=1` |
| Pont inaccessible | désactivé, port occupé ou jeton erroné | Paramètres → Navigateur, tester le port et recopier le jeton |
| Build Windows impossible | pas de Wine/CI Windows | utiliser un runner Windows |
| Ancienne instance | verrou d'instance unique | fermer TDM avant de relancer les scripts |

## 10. Limites de la chaîne de build

- Pas de signature de code, pas de notarisation, pas de mise à jour automatique.
- Pas de publication automatique (GitHub Releases, magasins).
- `https://tdm.example` est une URL réservée (TLD `.example`), exigée par le paquet `.deb` ; à remplacer
  par une page de projet réelle avant diffusion.
- La validation Windows et l'installation système du `.deb` restent à exécuter hors de la machine de
  développement.
