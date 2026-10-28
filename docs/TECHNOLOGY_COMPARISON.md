# TDM — Comparaison technologique

- **Version** : 1.0
- **Date** : 2026-10-23
- **Statut** : analyse terminée ; recommandation **acceptée** et implémentée sous Linux x64 (voir `TECHNOLOGY_DECISION.md`).
- **Règle** : aucune technologie n'est retenue parce qu'elle est populaire ou déjà installée. Chaque note est justifiée et une analyse de sensibilité est fournie.

---

## 1. Méthode

Cinq candidats sont comparés :

1. **Qt 6 / C++** — widgets natifs, moteur C++.
2. **Qt for Python / PySide6** — widgets Qt, moteur Python asyncio.
3. **Flutter Desktop** — UI Dart, moteur Dart ou FFI.
4. **Tauri 2 / Rust** — cœur Rust, UI web dans WebView2/WebKitGTK.
5. **Electron / TypeScript** — UI web Chromium, moteur Node.js dans un processus séparé.

La comparaison porte sur 15 critères pondérés. Les notes vont de 1 (insuffisant) à 5 (excellent). Le total est ramené sur 100.

### 1.1 Critères et pondérations

| # | Critère | Poids | Justification |
|---|---|---|---|
| 1 | Compatibilité Linux Mint/Ubuntu et Windows 10/11 | 8 | Exigence produit explicite |
| 2 | Qualité d'une interface desktop (dense, clavier, menus, accessibilité) | 9 | Gestionnaire de fichiers avec tableau dense |
| 3 | Performances sur gros téléchargements | 9 | Fichiers > 4 Gio, plusieurs connexions |
| 4 | Gestion des tâches asynchrones et de la concurrence | 8 | Segments, files, limites, annulation |
| 5 | Reprise et persistance | 8 | Fiabilité après coupure/redémarrage |
| 6 | Accès aux fonctions système (tray, notifications, autostart, instance unique) | 6 | Intégration desktop |
| 7 | Facilité d'intégration aux navigateurs | 7 | Extension Chromium/Firefox et canal local |
| 8 | Sécurité (surface d'attaque, isolation, stockage des secrets) | 9 | Téléchargements et IPC local |
| 9 | Taille du paquet installé et empreinte mémoire | 4 | Confort, pas criticité |
| 10 | Facilité et vitesse de développement | 5 | Délai de mise en œuvre |
| 11 | Maintenance à long terme | 7 | Cycle de vie, dépendances, mises à jour |
| 12 | Outils de test | 5 | Tests unitaires, intégration, E2E |
| 13 | Disponibilité des bibliothèques réseau/DB/UI | 4 | HTTP, TLS, proxy, SQLite |
| 14 | Licences et coûts | 3 | Distribution commerciale |
| 15 | Distribution et mise à jour Linux/Windows | 8 | .deb/AppImage, NSIS, signatures |

**Total des poids : 100.**

### 1.2 Barème

| Note | Signification |
|---|---|
| 5 | Excellent, sans réserve majeure |
| 4 | Bon, avec des limites connues et gérables |
| 3 | Acceptable, nécessite des contournements ou du travail supplémentaire |
| 2 | Faible, risque important |
| 1 | Inadapté |

---

## 2. Matrice des notes brutes

| Critère | Qt 6 / C++ | PySide6 | Flutter | Tauri 2 / Rust | Electron / TS |
|---|---:|---:|---:|---:|---:|
| Compatibilité Linux/Windows | 5 | 5 | 4 | 4 | 5 |
| Qualité UI desktop | 5 | 4 | 5 | 4 | 4 |
| Performance gros fichiers | 5 | 4 | 5 | 5 | 4 |
| Asynchrone/concurrence | 4 | 5 | 4 | 5 | 5 |
| Reprise/persistance | 4 | 5 | 4 | 5 | 5 |
| Fonctions système | 5 | 4 | 3 | 4 | 5 |
| Intégration navigateurs | 4 | 4 | 3 | 4 | 5 |
| Sécurité | 4 | 3 | 3 | 5 | 3 |
| Taille/empreinte | 4 | 2 | 4 | 5 | 2 |
| Vitesse de développement | 2 | 5 | 4 | 2 | 5 |
| Maintenance long terme | 4 | 4 | 3 | 4 | 5 |
| Outils de test | 3 | 5 | 4 | 4 | 5 |
| Bibliothèques disponibles | 4 | 5 | 3 | 4 | 5 |
| Licences/coûts | 4 | 4 | 5 | 5 | 5 |
| Distribution/mise à jour | 3 | 3 | 3 | 4 | 5 |

### 2.1 Notes pondérées (sur 100)

| Rang | Technologie | Score | Écart au premier |
|---|---|---:|---:|
| 1 | **Electron / TypeScript** | **90,4** | — |
| 2 | Tauri 2 / Rust | 86,2 | −4,2 |
| 3 | PySide6 / Python | 82,6 | −7,8 |
| 4 | Qt 6 / C++ | 81,8 | −8,6 |
| 5 | Flutter Desktop | 76,0 | −14,4 |

### 2.2 Analyse de sensibilité

Les poids sont un jugement. Voici ce qui change quand les priorités changent :

| Scénario | Premier | Second | Enseignement |
|---|---|---|---|
| Pondération de base | Electron 90,4 | Tauri 86,2 | Electron l'emporte sur la livraison, l'écosystème et les tests |
| Sécurité ×2 | Electron 95,8 | Tauri 95,2 | Quasi-égalité ; Tauri reprend l'avantage dès que la taille compte aussi |
| Taille ×2 | Electron 92,0 | Tauri 90,2 | Écart réduit ; Electron reste devant |
| Sécurité ×2 + taille ×2 | **Tauri 99,2** | Electron 97,4 | **Tauri gagne** si ces deux critères deviennent prioritaires |
| Vitesse de développement ×2 | Electron 95,4 | Tauri 88,2 | Electron creuse l'écart |
| Sécurité/taille ×2 et dev ÷2 | **Tauri 98,2** | Electron 94,9 | Tauri est le choix « production minimaliste » |

**Conclusion de sensibilité** : le choix se joue entre Electron et Tauri. Electron est préférable si le critère dominant est de livrer un produit complet, testé et maintenable rapidement. Tauri est préférable si la priorité est un binaire petit, une surface d'attaque minimale et un moteur Rust, au prix d'un délai et d'une complexité plus élevés.

---

## 3. Analyse détaillée par candidat

### 3.1 Qt 6 / C++

**Points forts**

- Widgets natifs matures, tableaux performants, menus, raccourcis, accessibilité correcte.
- `QNetworkAccessManager` gère TLS, redirections, proxy système et authentification HTTP.
- Empreinte mémoire modérée, démarrage rapide.
- Licence LGPLv3 possible avec liaison dynamique ; alternative commerciale.
- Un seul langage pour l'UI et le moteur ; pas de pont IPC obligatoire.

**Points faibles**

- Développement plus lent : signaux/slots, gestion mémoire, boilerplate, builds multiplateformes.
- Segmentation multi-connexions et reprise fine à écrire au-dessus de `QNetworkAccessManager` ou avec une bibliothèque tierce.
- Packaging Linux/Windows plus artisanal (AppImage, .deb, windeployqt, NSIS/MSIX).
- Tests UI (QTest) moins ergonomiques que Playwright/Vitest.
- Qt 6 n'est pas installé sur l'hôte ; installation de paquets de développement et compilation lourde.
- Licence LGPL : obligations de liaison dynamique et de fourniture des sources des modifications Qt.

**Verdict** : excellent choix pour une application native critique, mais coût de développement et de distribution trop élevé pour le calendrier et l'équipe actuels. Score 81,8.

### 3.2 Qt for Python / PySide6

**Points forts**

- Développement rapide, `QTableView` adapté à un tableau dense, tray, menus, notifications.
- Moteur asyncio/httpx robuste, SQLite intégré, tests pytest excellents.
- Un seul langage, bibliothèques réseau riches (httpx, aiohttp, keyring).
- Licence LGPL, pas de coût.

**Points faibles**

- Packaging PyInstaller/Nuitka volumineux (souvent 120–250 Mo), temps de démarrage.
- Le GIL n'est pas un problème pour l'I/O, mais les hachages/assemblements CPU doivent être déportés.
- Intégration système (tray, notifications, autostart, single instance) dépend de plugins/Qt.
- Sécurité : bytecode et dépendances Python plus faciles à inspecter ; secrets à protéger via keyring.
- Distribution Windows : signature, antivirus heuristique parfois hostile aux exécutables PyInstaller.

**Verdict** : bon compromis si l'équipe est Python. Moins adapté à une architecture multi-processus et à un produit desktop distribué à grande échelle. Score 82,6.

### 3.3 Flutter Desktop

**Points forts**

- UI très soignée, animations fluides, rendu identique Linux/Windows.
- Dart performant, boucle d'événements adaptée aux flux réseau, `dart:io HttpClient` correct.
- Binaire relativement compact (25–60 Mo), licence BSD.
- Outils de test widget et intégration corrects.

**Points faibles**

- Le desktop reste secondaire dans l'écosystème Flutter : tray, notifications, autostart, single instance, menus natifs et drag & drop dépendent de plugins de qualité variable.
- Tableau de données dense et gestion clavier moins mature que Qt/HTML.
- Intégration navigateur et native messaging plus difficile.
- SQLite via FFI et plugins natifs ; packaging Linux/Windows plus artisanal.
- Le moteur réseau devrait être écrit en Dart ou via FFI, avec moins de bibliothèques proxy/auth avancées.

**Verdict** : excellent pour une UI produits, moins pour un outil système exigeant. Score 76,0.

### 3.4 Tauri 2 / Rust

**Points forts**

- Meilleure sécurité et plus petite empreinte (8–20 Mo + WebView système).
- Cœur Rust : `tokio`, `reqwest`, `hyper`, `rusqlite`, excellent contrôle des erreurs et de la concurrence.
- Isolation naturelle entre UI web et cœur natif via commandes IPC typées.
- Binaire signé plus simple, surface d'attaque réduite, pas de runtime Node embarqué.
- Licence MIT/Apache-2.0.

**Points faibles**

- Rust n'est pas installé ; toolchain et compilation à mettre en place (installation locale, pas système).
- Courbe d'apprentissage et temps de développement plus élevés.
- WebView dépend du système : WebView2 sur Windows, WebKitGTK sur Linux ; comportements et versions à tester séparément.
- Écosystème UI/desktop plus jeune que Qt/Electron ; certains plugins tray/notification/updater doivent être validés.
- Tests E2E UI moins matures ; il faut combiner `cargo test` et tests WebDriver/Playwright selon les cas.
- Risque de devoir écrire soi-même l'hôte de native messaging et l'updater.

**Verdict** : meilleur choix « sécurité et empreinte » et meilleur candidat de repli. Score 86,2, premier si sécurité et taille deviennent prioritaires.

### 3.5 Electron / TypeScript

**Points forts**

- Un seul langage (TypeScript) pour l'UI, le moteur et les tests.
- Node.js 24.22 embarqué (Electron 45), excellent pour les flux, `AbortController`, `undici`, SQLite, proxies.
- `utilityProcess` permet un **vrai processus moteur séparé**, supervision et redémarrage sans recréer l'UI.
- Écosystème mature : React, Zod, Vitest, Playwright, electron-builder, electron-updater.
- Intégration système complète : tray, notifications, autostart, instance unique, menus natifs, presse-papiers.
- Packaging Linux (.deb/AppImage) et Windows (NSIS) éprouvé, mises à jour signées.
- Tests E2E Playwright pilotant l'application Electron.

**Points faibles**

- Paquet lourd (90–150 Mo), mémoire plus élevée (150–300 Mo).
- Sécurité à durcir explicitement : `contextIsolation`, `sandbox`, CSP, pas de `nodeIntegration`, validation IPC, pas de contenu distant.
- Chromium embarqué = surface de mise à jour plus large ; il faut suivre les versions.
- Risque de dérive « site web déguisé » si l'UI n'est pas conçue comme une application desktop.
- Dépendances npm nombreuses ; nécessité de verrouiller et d'auditer.

**Verdict** : meilleur compromis pour livrer vite un produit desktop complet, testable et multiplateforme, à condition d'appliquer un durcissement strict et d'assumer le poids. Score 90,4.

---

## 4. Comparaison sur les points décisifs du cahier des charges

| Exigence TDM | Qt/C++ | PySide6 | Flutter | Tauri | Electron |
|---|---|---|---|---|---|
| Moteur réseau indépendant de l'UI | Oui, objet C++ | Oui, module Python | Oui, module Dart/FFI | Oui, crate Rust | Oui, processus utilitaire Node |
| Reprise fine multi-segments | À écrire | À écrire | À écrire | À écrire | À écrire |
| SQLite local | Oui | Oui | Via plugin/FFI | Oui (`rusqlite`) | Oui (`node:sqlite` ou better-sqlite3) |
| Proxy système + manuel + PAC | Oui | Oui (httpx) | Partiel | Oui (reqwest) | Oui (undici/agents) |
| Auth Basic/Digest | Oui | Oui | Partiel | Oui | Oui |
| Tray + notifications | Oui | Oui | Plugins | Plugins | Oui |
| Extension navigateur + canal local | Oui | Oui | Difficile | Oui | Oui |
| Tests E2E UI | Moyen | Moyen | Bon | Moyen | Excellent |
| Installation Windows non testée ici | Documentation | Documentation | Documentation | Documentation | Documentation |
| Taille installée estimée | 40–80 Mo | 120–250 Mo | 25–60 Mo | 8–20 Mo | 90–150 Mo |

> Les tailles indiquées sont des ordres de grandeur. Les paquets TDM réellement produits mesurent
> environ 124 Mio (AppImage) et 98 Mio (.deb) sous Linux x64.

---

## 5. Contraintes de l'environnement de développement

Relevé le 2026-10-23 sur l'hôte Linux Mint 21.3 :

| Élément | État | Impact |
|---|---|---|
| Node.js | 26.8.1 | Electron 45 embarque Node 24.22 ; le runtime applicatif diffère du Node hôte |
| npm | 11.19.0 | Packaging et dépendances possibles |
| Python | 3.10.12 | PySide6 possible, mais version Python ancienne |
| Flutter | 3.47.7 / Dart 3.13.5 | Build Linux possible |
| GTK 3 | 3.24.33 | Flutter Linux viable |
| Rust / Cargo | Absents | Tauri nécessite une installation de toolchain |
| Qt 6 / qmake6 | Absents | Qt/C++ nécessite des paquets de développement |
| Chrome | 156.0.8078.47 | Tests extension et comparaison |
| Espace disque | 23 Go libres | Suffisant pour un toolchain, pas pour plusieurs builds lourds |
| Réseau | npm, PyPI, Flutter accessibles | Dépendances installables |

Ces contraintes **ne déterminent pas seules** le choix, mais elles influencent le risque de livraison. Elles sont explicitement prises en compte dans la note « vitesse de développement » et « distribution ».

---

## 6. Recommandation retenue

**Recommandation : Electron 45 + TypeScript + React, avec un moteur Node.js dans un `utilityProcess` séparé, SQLite, et une extension MV3 pour Chromium/Firefox.**

Justification :

1. Meilleur score pondéré (90,4/100) sur les critères qui correspondent au produit.
2. Séparation réelle moteur/UI par processus, avec supervision et redémarrage.
3. Écosystème de test et de packaging le plus mature pour livrer Linux et Windows.
4. Intégration système et navigateur complète sans plugins fragiles.
5. Coût de développement compatible avec un premier livrable vérifiable.

**Réserves explicites** :

- Le paquet est lourd (≈124 Mio en AppImage, ≈98 Mio en .deb) ; ce n'est pas un critère critique pour un gestionnaire de téléchargements desktop.
- La sécurité devra être traitée comme une exigence de premier rang : durcissement Electron, IPC validé, CSP, token local, chemins confinés.
- Si la taille, la sécurité ou l'absence de Chromium embarqué deviennent prioritaires, **Tauri 2 / Rust est le choix recommandé** (premier dès que sécurité et taille sont pondérées ×2).

**Décision** : la recommandation Electron 45 + TypeScript + React a été retenue et mise en œuvre.
Les réserves ci-dessus restent valables : paquet lourd, surface Chromium à maintenir, sécurité
traitée comme exigence de premier rang. Les écarts constatés à l'implémentation (pas de
`electron-updater`, jeton de pont en clair `0600`, pas de `safeStorage`) sont consignés dans
`TECHNOLOGY_DECISION.md` §2.

**Alternative de repli** : Tauri 2 + Rust + React, si l'utilisateur privilégie l'empreinte minimale et accepte l'installation de la toolchain Rust et un délai supérieur. **PySide6** reste une option si l'équipe est Python et si un moteur asyncio en processus unique suffit.

---

## 7. Ce que cette comparaison ne prouve pas

- Aucun prototype n'a été compilé pour les quatre stacks non retenues ; seule la stack Electron a
  depuis été construite et testée.
- Les performances réelles sur un fichier de 5 Gio n'ont pas été mesurées.
- Les tailles des quatre autres stacks restent des estimations documentaires ; seuls les paquets TDM
  ont été mesurés (≈124 Mio AppImage, ≈98 Mio .deb).
- Windows n'a pas été testé ; aucune affirmation de compatibilité Windows validée n'est faite.
- L'extension a été testée dans Chromium ; Firefox, Chrome et Edge de marque restent à exécuter.

La décision formelle et ses conditions sont dans `docs/TECHNOLOGY_DECISION.md`.
