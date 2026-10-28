# Exigences — TDM 0.1.0

Ce document fixe le périmètre livré dans la version 0.1.0 et distingue explicitement ce qui est
**vérifié**, **implémenté mais non validé sur la cible**, et **hors périmètre**.

Statuts utilisés :

- **Vérifié** : exécuté sur la machine de développement avec preuve reproductible.
- **Implémenté** : présent dans le code et revu, mais sans validation automatisée complète ni
  validation sur toutes les cibles.
- **Non exécuté** : code/config présent, validation requise sur la cible.
- **Hors périmètre** : volontairement absent de la 0.1.0.

## 1. Objectifs

| ID | Objectif | Statut |
| --- | --- | --- |
| OBJ-1 | Fournir un gestionnaire de téléchargements HTTP/HTTPS fonctionnel sous Linux Mint/Ubuntu. | Vérifié |
| OBJ-2 | Fournir la même application sous Windows 10/11 via un paquet NSIS. | Artefact produit sous Wine ; non installé/exécuté sur Windows (CI/VM requise) |
| OBJ-3 | Rester une œuvre originale, sans code, ressource ou marque d'IDM. | Vérifié par audit |
| OBJ-4 | Ne jamais simuler une fonction : chaque bouton visible agit sur le moteur ou l'OS. | Vérifié par revue + E2E |

## 2. Exigences fonctionnelles

### 2.1 Téléchargement

| ID | Exigence | Statut | Preuve |
| --- | --- | --- | --- |
| FR-1 | Ajouter une URL HTTP/HTTPS avec analyse préalable (taille, type, reprise). | Vérifié | E2E `scripts/e2e.mjs` |
| FR-2 | Télécharger en segments parallèles et reconstituer un fichier identique. | Vérifié | Tests `engine.integration` (SHA-256) |
| FR-3 | Suspendre et reprendre sans corruption, y compris après redémarrage de l'application. | Vérifié partiellement | Pause/reprise testées ; reprise au démarrage implémentée (`resumeOnStartup`) mais non testée après arrêt complet |
| FR-4 | Annuler et supprimer le fichier temporaire sans toucher au fichier final. | Vérifié | Test intégration annulation |
| FR-5 | Repli séquentiel si le serveur ignore `Range`. | Vérifié | Test intégration `ignoreRange` |
| FR-6 | Télécharger un flux sans `Content-Length`. | Vérifié | Test intégration flux chunked |
| FR-7 | Vérifier un SHA-256 attendu et refuser la livraison en cas d'écart. | Vérifié | Test intégration `TDM-E-CHECKSUM` |
| FR-8 | Appliquer priorités, nombre de connexions et limite de vitesse par tâche. | Implémenté | IPC `tasks.update`, panneau de propriétés |
| FR-9 | Détecter les changements de fichier distant (taille, ETag, Last-Modified) avant reprise. | Implémenté | `downloader.ts` ; non couvert par un test dédié |
| FR-10 | Ouvrir le fichier ou son dossier depuis l'interface. | Implémenté | IPC `shell`, non cliqué en E2E |

### 2.2 Organisation

| ID | Exigence | Statut | Preuve |
| --- | --- | --- | --- |
| FR-11 | Catégories par extension et domaine, avec dossiers dédiés. | Implémenté | `categories.ts` ; classification utilisée à l'ajout, non couverte par un test dédié |
| FR-12 | Créer/modifier/supprimer des catégories personnalisées. | Implémenté | Dialogue Catégories, IPC `categories.*` |
| FR-13 | Files d'attente avec concurrence propre, démarrage/arrêt. | Vérifié | Test intégration « démarre une file et relance les tâches en pause » |
| FR-14 | Démarrer une file relance ses tâches suspendues ou échouées. | Vérifié | Même test |
| FR-15 | Historique consultable et purge selon la rétention configurée. | Implémenté | `history.list`, purge au démarrage |
| FR-16 | Recherche, tri et filtres par état/catégorie/file. | Implémenté | Composants et filtres du moteur, non automatisés |

### 2.3 Planificateur

| ID | Exigence | Statut | Preuve |
| --- | --- | --- | --- |
| FR-17 | Planifier une action unique, quotidienne ou par intervalle. | Vérifié | Test intégration « exécute une action de planning » |
| FR-18 | Fenêtre horaire quotidienne démarrer/arrêter une file. | Implémenté | `scheduler.ts`, tests unitaires `nextOccurrence` |
| FR-19 | Fonctionner uniquement quand TDM est lancé. | Implémenté | Aucun service système installé ; planificateur arrêté avec le moteur |

### 2.4 Navigateur

| ID | Exigence | Statut | Preuve |
| --- | --- | --- | --- |
| FR-20 | Envoyer explicitement un lien depuis une extension vers TDM. | Vérifié | `bridge-test.mjs` + `extension-test.mjs` |
| FR-21 | Exiger un jeton et refuser une origine non autorisée. | Vérifié | 401 sans jeton, 403 mauvaise origine |
| FR-22 | Limiter le débit des requêtes du pont. | Implémenté | 60 req/min codés ; non exercé par un test |
| FR-23 | Fournir les extensions Chrome/Edge et Firefox sans injection de page. | Vérifié partiellement | Chromium 156 réel (`extension-test.mjs`) ; Firefox non chargé |

### 2.5 Interface et système

| ID | Exigence | Statut | Preuve |
| --- | --- | --- | --- |
| FR-24 | Thème système/clair/sombre appliqué immédiatement. | Implémenté | `nativeTheme` + variables CSS, non automatisé |
| FR-25 | Appliquer les réglages sans redémarrage (concurrence, limites, proxy, pont). | Vérifié | E2E `settings: 3 -> 4` |
| FR-26 | Détecter un lien dans le presse-papiers (option désactivée par défaut). | Implémenté | `src/main/index.ts`, non couvert E2E |
| FR-27 | Notifications système et réduction dans la zone de notification. | Implémenté | `Notification`, `Tray` ; test visuel non automatisé |
| FR-28 | Démarrer automatiquement à l'ouverture de session (option). | Implémenté | `app.setLoginItemSettings` |
| FR-29 | Instance unique : un second lancement transmet ses arguments à l'instance active. | Implémenté | `second-instance`, non couvert E2E |
| FR-30 | Diagnostic exportable et journaux consultables. | Implémenté | Dialogue Diagnostic et ouverture des journaux |

## 3. Exigences non fonctionnelles

| ID | Exigence | Statut |
| --- | --- | --- |
| NFR-1 | Interface réactive : table virtualisée au-delà de quelques milliers de lignes. | Implémenté (`@tanstack/react-virtual`) |
| NFR-2 | Moteur isolé de l'interface (processus utilitaire), interface sandboxée. | Vérifié |
| NFR-3 | Toute commande IPC validée par Zod ; contexte de confiance vérifié. | Vérifié par revue |
| NFR-4 | Aucune exécution de code distant, aucune injection dans les pages web. | Vérifié par revue |
| NFR-5 | Jeton du pont aléatoire de 256 bits, fichier `0600`, comparaison à temps constant. | Implémenté | `bridge.ts` ; mode `0600` non vérifié par un test automatisé |
| NFR-6 | Renommage atomique : fichier final livré après téléchargement complet (et contrôle SHA-256 si demandé), jamais partiel. | Vérifié (téléchargement + checksum) |
| NFR-7 | Journaux sans contenu des fichiers ni secrets. | Vérifié par revue |
| NFR-8 | Reprise sans perte de progression : segments persistés en SQLite. | Vérifié partiellement | Pause/reprise testées ; reprise après arrêt complet non testée |
| NFR-9 | Compatibilité Linux x64 (AppImage + deb). | Vérifié |
| NFR-10 | Compatibilité Windows x64 (NSIS). | Non exécuté sur Windows | Installeur produit sous Wine, archive contrôlée par `7z t` ; aucune installation/exécution Windows |
| NFR-11 | Aucun service payant ou compte externe requis. | Vérifié |

## 4. Sécurité et vie privée

- Le pont n'écoute que sur `127.0.0.1` et exige un jeton ; les origines absentes ou non autorisées sont
  traitées selon la politique documentée dans `src/main/bridge.ts`.
- Les extensions n'ont pas de permission de lecture/modification des pages ; elles transmettent
  uniquement l'URL sur action de l'utilisateur.
- Les URL sont limitées à `http:` et `https:` ; les schémas locaux (`file:`, `javascript:`) sont rejetés.
- Aucun contournement de DRM, de paywall, d'authentification ou de protection de site n'est implémenté.
- Les fichiers de configuration et la base ne sont jamais supprimés sans action explicite.

## 5. Hors périmètre 0.1.0

- FTP, SFTP, MMS, streaming et capture vidéo.
- Grabber de site, exploration récursive, extraction de liens depuis une page.
- Authentification NTLM/Kerberos, cookies de session avancés.
- Messagerie native du navigateur (le pont HTTP explicite est utilisé).
- Planificateur en service système lorsque TDM est fermé.
- Mise à jour automatique, signature de code, télémétrie.
- Traductions autres que le français.
- Synchronisation cloud, comptes, partage.

Ces exclusions sont assumées et documentées dans [`LIMITATIONS.md`](LIMITATIONS.md).
