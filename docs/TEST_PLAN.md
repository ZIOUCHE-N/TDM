# Plan de test et preuves — TDM 0.1.0

Date d'exécution : **2026-10-23**. Environnement : Linux Mint/Ubuntu, noyau 5.15, Node.js 26.8.1,
Electron 45.0.0, SQLite 3.53.4.

Principe : les tests d'intégration utilisent de **vrais serveurs HTTP locaux** et de vrais fichiers ;
les tests d'interface pilotent l'application Electron réelle. Aucun résultat n'est déclaré sans
exécution.

## 1. Portée

| Niveau | Outil | Portée |
| --- | --- | --- |
| Unitaires | Vitest | chemins sûrs, calcul de segments, planification |
| Intégration | Vitest + serveurs HTTP locaux | téléchargement, reprise, annulation, checksum, files, planning |
| Interface | Playwright + Electron | ajout, pause, reprise, propriétés, réglages |
| Pont navigateur | Node `fetch` + Electron | authentification, origine, téléchargement réel (limite de débit non testée) |
| Extension Chrome | Playwright + Chromium | chargement réel, jeton, ping, envoi, téléchargement |
| Paquet | Playwright + binaire packagé | démarrage, moteur, SQLite, pont |
| Installeur Windows | `7z t` + inspection PE | archive valide, icônes NZix présentes |
| Cible Windows | CI/VM | **non exécuté sur Windows** |

## 2. Tests automatisés

Commande :

```bash
pnpm test
```

Résultat du 2026-10-23 :

```
Test Files  4 passed (4)
Tests       23 passed (23)
Exit code   0
```

Fichiers :

| Fichier | Cas |
| --- | --- |
| `tests/paths.test.ts` | assainissement des noms, chemins autorisés |
| `tests/segments.test.ts` | découpage et bornes des segments |
| `tests/scheduler.test.ts` | occurrences quotidiennes, intervalle, jours, dates invalides |
| `tests/engine.integration.test.ts` | 8 scénarios HTTP + 2 scénarios files/planificateur |

### Scénarios d'intégration exécutés

1. **Téléchargement segmenté** (3 Mio + 17 octets) : statut `completed`, SHA-256 identique à la source,
   octets reçus égaux à la taille.
2. **Pause puis reprise** (4 Mio, serveur ralenti) : progression persistée entre 0 et la taille, reprise
   jusqu'à `completed`, SHA-256 identique.
3. **Annulation** : statut `cancelled`, aucun fichier `.tdm-part` résiduel.
4. **Retrait d'une tâche suspendue** : la tâche disparaît de la liste et son fichier `.tdm-part` est
   supprimé.
5. **Serveur ignorant `Range`** : repli séquentiel, fichier identique.
6. **Flux sans `Content-Length`** : téléchargement complet, SHA-256 identique.
7. **Taille HEAD nulle** : le serveur renvoie `Content-Length: 0` en HEAD mais un contenu réel ; TDM
   interroge le contenu, télécharge et vérifie le SHA-256.
8. **SHA-256 attendu invalide** : statut `needs_attention`, code `TDM-E-CHECKSUM`, fichier final non
   livré ; après correction de l'empreinte, une reprise retélécharge réellement le fichier et le SHA-256
   correspond.
9. **Démarrage d'une file** : une tâche ajoutée avec `startNow: false` est d'abord `paused` ; après
   `startQueue`, elle passe `completed`, SHA-256 identique, la file est `running`.
10. **Exécution d'un planning** : planification `once` échue avec action `start_queue` ; `scheduler.tick`
   lance la file, la tâche se termine, le planning est désactivé et `lastRunAt` renseigné.

Les tests vérifient aussi la sortie propre du processus (aucune erreur non capturée). Une erreur
`UND_ERR_ABORTED` provoquée par la destruction des corps de réponse d'analyse a été corrigée
(`src/engine/http.ts`) et la suite se termine désormais avec le code 0.

## 3. Vérification statique et build

```bash
pnpm typecheck   # exit 0
pnpm build       # exit 0, out/main, out/preload, out/renderer produits
```

## 4. Test d'interface de bout en bout

Commande :

```bash
node scripts/e2e.mjs
```

Scénario réel : serveur HTTP local avec `Range`, fichier de 4 Mio + 511 octets, délai de 25 ms par
tranche de 32 Kio.

| Étape | Résultat observé |
| --- | --- |
| Ouverture du dialogue **Nouveau**, analyse de l'URL | « Reprise et segments disponibles » |
| Ajout et démarrage | ligne `tdm-e2e.bin`, statut téléchargement |
| Clic **Suspendre** | statut `paused`, 983 040 / 4 194 815 octets (23 % ; varie selon le moment du clic) |
| Clic **Reprendre** | reprise jusqu'à `completed`, 4 194 815 / 4 194 815 |
| SHA-256 du fichier final | identique à la source (`sha256 match: true`) |
| Panneau de propriétés | ouvert et affiché |
| Paramètres → Téléchargements → simultanés = 4 → Enregistrer | valeur persistée `3 -> 4` |
| Nettoyage | tâche retirée, fichier supprimé, réglage restauré |

Sortie :

```
pause: 983040 / 4194815
final: completed 4194815 / 4194815
sha256 match: true
settings: 3 -> 4
E2E OK
```

Captures : `artifacts/e2e-add-dialog.png`, `artifacts/e2e-downloading.png`,
`artifacts/e2e-paused.png`, `artifacts/e2e-completed.png`, `artifacts/e2e-properties.png`,
`artifacts/e2e-settings.png`, `artifacts/smoke-empty.png`.

## 5. Pont navigateur

Commande :

```bash
node scripts/bridge-test.mjs
```

| Contrôle | Attendu | Observé |
| --- | --- | --- |
| Jeton | 64 caractères hexadécimaux (256 bits) | 64 |
| `GET /v1/ping` | 200 + `app: TDM` | 200 |
| `POST /v1/download` sans jeton | 401 | 401 |
| Origine `https://evil.example` | 403 | 403 |
| Ajout authentifié | 200 + nom de fichier | 200 `bridge-test.bin` |
| Téléchargement | `completed` | `completed`, 2 097 485 octets |
| SHA-256 | identique | `true` |

Sortie : `BRIDGE OK`.

### Extension dans un navigateur réel

Commande :

```bash
node scripts/extension-test.mjs
```

Chromium 156 (build Playwright) est lancé avec un profil temporaire et l'extension `extension/` chargée
via `--load-extension`. Le service worker MV3 est détecté, la fenêtre de l'extension est ouverte,
le port et le jeton sont enregistrés, puis **Tester** et l'envoi d'un lien sont exécutés.

| Étape | Résultat observé |
| --- | --- |
| Service worker MV3 | chargé, identifiant `lmgdjpcccpddghpcibalagfjmidecjbo` (profil temporaire) |
| Configuration port + jeton | enregistrée |
| Test du pont depuis l'extension | « TDM 0.1.0 répond correctement. » |
| Envoi `tdm:send` | accepté, `extension-test.bin` |
| Téléchargement TDM | `completed`, 1 048 699 / 1 048 699 octets |
| SHA-256 | identique (`true`) |

Sortie : `EXTENSION OK`. Capture : `artifacts/extension-popup.png`.

Non couvert : Chrome/Edge de marque, Firefox, menus contextuels cliqués dans le navigateur,
notifications de l'extension. Le service worker, le stockage, le ping et l'envoi sont testés.

## 6. Paquets Linux et installeur Windows

```bash
pnpm dist:linux
node scripts/packaged-smoke.mjs dist/linux-unpacked/tdm
node scripts/packaged-smoke.mjs dist/tdm-0.1.0-x86_64.AppImage
WINEPREFIX=/tmp/opencode/wine-tdm pnpm dist:win
7z t dist/tdm-0.1.0-x64-setup.exe
cd dist && sha256sum -c SHA256SUMS
```

Résultats observés après reconstruction de `dist/` avec l'icône NZix :

| Cible | Moteur | SQLite | Pont | Empaqueté |
| --- | --- | --- | --- | --- |
| `dist/linux-unpacked/tdm` | `ready` | 3.53.4 | actif sur 47831 | `true` |
| `dist/tdm-0.1.0-x86_64.AppImage` (extraction à la volée) | `ready` | 3.53.4 | actif sur 47831 | `true` |

Les smoke tests ont été exécutés avec `XDG_CONFIG_HOME=/tmp/opencode/smoke-config` pour ne pas entrer en
conflit avec l'instance TDM installée sur le poste (verrou d'instance unique).

Artefacts produits : `dist/tdm-0.1.0-x86_64.AppImage` (≈124 Mio),
`dist/tdm-0.1.0-amd64.deb` (≈98 Mio), `dist/tdm-0.1.0-x64-setup.exe` (NSIS, ≈109 Mio). Le `.deb`
déclare les dépendances GTK/notify/NSS/XSS/XTST, `xdg-utils`, AT-SPI et libsecret.

Contrôles d'intégrité et d'identité visuelle :

- `sha256sum -c dist/SHA256SUMS` réussit pour les trois artefacts.
- `7z t` sur l'installeur NSIS : « Everything is Ok » (10 fichiers).
- Les six images de `build/icon.ico` (16/32/48/64/128/256) sont identiques à celles des ressources
  `RT_ICON` de `dist/win-unpacked/TDM.exe` et de `dist/tdm-0.1.0-x64-setup.exe`.
- L'icône `build/icon.png` et l'icône `256×256` installée par le `.deb` sont identiques (SHA-256).
- `dist/SHA256SUMS` contient les empreintes et `dist/BUILD-INFO.txt` la provenance (commit `3c5dfd5`,
  arbre modifié, versions Node/pnpm/Electron/SQLite/electron-builder, commandes, limites).

Ces contrôles prouvent l'intégrité des fichiers produits ; ils **ne prouvent pas** que l'installeur
fonctionne sous Windows.

## 7. Tests non exécutés (à faire avant toute promesse)

| Élément | Raison | Action requise |
| --- | --- | --- |
| Installation et exécution de l'installeur sur Windows 10/11 | Artefact produit sous Wine uniquement | Installer `tdm-0.1.0-x64-setup.exe` sur VM Windows propre et rejouer les smoke tests |
| Installation du `.deb` sur système vierge | Évite de modifier la machine de développement | VM ou conteneur avec interface graphique |
| Extension Firefox dans un navigateur réel | Non chargée | Charger `extension-firefox/` via `about:debugging` et rejouer le scénario |
| Chrome/Edge de marque | Seul Chromium (moteur Chrome) a été utilisé | Charger l'extension dans Chrome et Edge installés |
| Menus contextuels et notifications de l'extension | Non automatisés | Test manuel dans le navigateur |
| Reprise après redémarrage complet | Couverte par la logique et les tests partiels | Test manuel : tuer l'application en cours de téléchargement, relancer |
| Proxy manuel | Pas de proxy de test configuré ; aucune authentification proxy n'est implémentée | Serveur proxy local sans authentification |
| Notifications système et zone de notification | Difficile à automatiser | Test manuel sous GNOME/Cinnamon et Windows |
| Démarrage automatique à la session | Modifie la configuration utilisateur | Test manuel avec accord explicite |
| Accessibilité clavier/lecteur d'écran | Non outillée | Audit NVDA/Orca |

## 8. Critères de sortie 0.1.0

- `pnpm typecheck` et `pnpm build` sans erreur : **OK**.
- `pnpm test` sans échec ni erreur non capturée : **OK (23/23)**.
- E2E ajout/pause/reprise/checksum/réglages : **OK**.
- Pont authentifié avec téléchargement réel : **OK**.
- Extension chargée dans Chromium et téléchargement réel : **OK**.
- Paquets Linux démarrables : **OK**.
- Windows : installeur produit et contrôlé, mais **non installé ni exécuté sur Windows**, donc non
  revendiqué comme validé.
