# TDM — Audit de référence : Internet Download Manager (IDM)

- **Version du document** : 1.0
- **Date de l'audit** : 2026-10-23
- **Périmètre** : fonctionnalités publiques d'IDM, documentation officielle et fiche Softmany.
- **Objet** : établir un cahier des charges vérifiable pour TDM, sans supposer l'accès au code, au binaire ou aux serveurs privés d'IDM.
- **Statut** : audit terminé ; décisions technologiques acceptées et implémentées sous Linux x64.

---

## 1. Objet et méthode

L'audit répond à trois questions :

1. Quelles fonctions IDM documente-t-il publiquement ?
2. Que peut-on réellement observer sur les sources autorisées ?
3. Quelles fonctions TDM doit-il reprendre, adapter, limiter ou refuser ?

### 1.1 Ce qui a été examiné

- Les pages publiques du site officiel `internetdownloadmanager.com`.
- La fiche publique Softmany en français.
- Les captures d'écran publiques référencées par le site officiel (analyse visuelle).
- Le contenu DOM capturé par REA dans Chrome 156.0.8078.47, en mode headless, avec un profil temporaire.

### 1.2 Ce qui n'a pas été examiné

- **Aucun exécutable IDM n'a été téléchargé, installé, exécuté ou désassemblé.**
- **Aucun code source privé d'IDM n'a été consulté.**
- Aucun serveur, compte, licence ou service interne de Tonec n'a été utilisé.
- Aucune capture réseau du logiciel IDM en fonctionnement n'a été réalisée.
- Aucun test de performance comparatif IDM/TDM n'a été exécuté.
- La page d'installation de l'extension Firefox a renvoyé un défi JavaScript anti-bot ; elle n'a pas été contournée.

Les conclusions ci-dessous sont donc **documentaires et observationnelles**, jamais issues d'une rétro-ingénierie du produit installé.

---

## 2. Sources examinées et preuves

Légende : **E** = Evidence REA, **V** = capture visuelle inspectée via les outils navigateur.

| Réf. | Source | URL | Preuve | Ce qui est notable |
|---|---|---|---|---|
| S1 | Page officielle des fonctionnalités | https://www.internetdownloadmanager.com/features2.html | E `ev_9d2bfb4f846130b547fb579fc71506235f700e0d0e9c7cefd2ab4fd9818cd3a9` | Segmentation dynamique, reprise, scheduler, grabber, catégories, limites, proxy, auth, antivirus, thème sombre, mise à jour, drag & drop |
| S2 | Fiche Softmany FR | https://internet-download-manager.fr.softmany.com/ | E `ev_fa47a32583219904fffe14f3baab8054f31b43bb6e4066b5c9e9f989c6277f8d` | Version annoncée 6.43 Build 15, 11,97 Mo, démo, fonctions grand public, exigences système obsolètes |
| S3 | Guide « How to use IDM — Main Dialog » | https://www.internetdownloadmanager.com/support/using_idm/using_idm.html | E `ev_d66bf19a82b2b165910c8b4886fd01e21a3853bf5844bf6976a450ab5cf0ac93` | Fenêtre principale, colonnes, boutons, catégories, personnalisation |
| S4 | « Starting Downloads with IDM » | https://www.internetdownloadmanager.com/support/using_idm/starting.html | E `ev_1adb0127627b12be9ced43bbab92d78d00f2bed7e96d9bc055ee34f02317e180` | 6 modes de démarrage, presse-papiers, menus contextuels, drag & drop, ligne de commande |
| S5 | « Options Dialog » | https://www.internetdownloadmanager.com/support/using_idm/options.html | E `ev_8124b156f671d5eb3d1f3074e5a91ec2303962464e86ad5d4e3ea3d089f8c699` + `ev_9e58e244f527ac32c72920bb00b9aadb8cbb9f42b1e98d643a7649ed90bcb80b` | 9 onglets de réglages, proxy, limites, types de fichiers, site logins, sons, dial-up |
| S6 | « Properties Dialog » | https://www.internetdownloadmanager.com/support/using_idm/properties.html | E `ev_a3463e408d1c759726f0aa54bb55514dbc893ca452b14b1ae4cadfa29154d601` | URL, destination, description, ouverture du fichier |
| S7 | « Download Complete Dialog » | https://www.internetdownloadmanager.com/support/using_idm/completeD.html | E `ev_27cd5a03b094db81531ecc82c5d3654a07dc1023a8e15305e57709764df2933c` | Notification de fin, ouverture, glisser-déposer du fichier |
| S8 | « IDM Scheduler » | https://www.internetdownloadmanager.com/support/idm-scheduler/idm_scheduler.html | E `ev_3d91b258238b622005437153e38e798eee1c01b5eb4acc18db129e78ba5cd16b` | Files planifiées, reprise, arrêt, actions de fin, tentatives |
| S9 | « IDM Queues » | https://www.internetdownloadmanager.com/support/idm-scheduler/idm_queues.html | E `ev_6783f9198f3c4c93fb6f99bc173be18781cd2fd6a6e78cb1697f10817aaaff03` | Files principale/synchronisation/personnalisées, colonne Q, démarrage/arrêt |
| S10 | « IDM Grabber » | https://www.internetdownloadmanager.com/support/idm-grabber/idm_grabber.html | E `ev_4bdffc5f4e604119dc7edce6a03f1fb6152085fe6a7b1a500beb10d58eae062c` | Assistant 4 étapes, filtres, exploration, projets, planification |
| S11 | « Dynamic Segmentation and Performance » | https://www.internetdownloadmanager.com/support/segmentation.html | E `ev_186225b06dc06c970dfab7fcc264986928b888d5572aa341c1b53f6166dc76df` | Division en deux du plus grand segment, réutilisation des connexions, sauvegarde fréquente des positions |
| S12 | FAQ intégration navigateur | https://www.internetdownloadmanager.com/register/new_faq/bi_main.cgi | E `ev_32026d9ed911ab2ce3d5e5b280edf30d792edfdc538288094ad9c4dc22585b38` | Problèmes réels d'intégration Chrome : permissions, 403, plantages, extension désactivée |
| S13 | Page de téléchargement officielle | https://www.internetdownloadmanager.com/download.html | E `ev_c82603d94053f6d2a21ae80b3ff90e522c43f1059326cc57d79b1c34538cfbb4` | Installation Windows, extensions Chrome/Firefox/Edge |
| S14 | Index du support | https://www.internetdownloadmanager.com/support/index.html | E `ev_e35b57b738c6d914ccebfa71255d8100c6c9a88031f3cf1b24b3a5d047c7879f` | Arborescence de la documentation, tous les écrans décrits |
| S15 | Page Firefox officielle (échec) | https://www.internetdownloadmanager.com/support/installffextfrommozillasite.html | E `ev_aaadb5f67217713c99fcaafa77cdb9c45852bbef60b4e4e0e6f17e5549898d15` | Défi JavaScript ; **aucune conclusion fonctionnelle tirée** |
| V1 | Capture officielle fenêtre principale (v6.38) | https://www.internetdownloadmanager.com/images/idm_screenshot_6_35.jpg | Capture navigateur, 2026-10-23 | Menus, barre d'outils, arbre de catégories, colonnes, fenêtre de progression |
| V2 | Capture officielle Scheduler (v6.35) | https://www.internetdownloadmanager.com/images/queue.png | Capture navigateur, 2026-10-23 | Files, planification, synchronisation périodique, actions de fin |
| V3 | Capture officielle thème sombre (v6.37) | https://www.internetdownloadmanager.com/images/dark_th.jpg | Capture navigateur, 2026-10-23 | Liste dense, colonnes, état par ligne, contraste |

### 2.1 Outils réellement utilisés

- **REA `capture_browser_scenario`** : 18 captures de pages (17 avec DOM exploitable, 1 page bloquée par un défi JavaScript), URL finale, profil Chrome temporaire, aucune interaction avec un compte.
- **Outils navigateur** (`tabs.open`, `navigate`, `screenshot`, `tabs.close`) : inspection visuelle de 3 captures officielles.
- **Outils shell** : vérification de l'environnement, des versions, de la disponibilité réseau.
- **Aucun outil REA binaire** (PE/ELF, désassembleur, débogueur, Frida) n'a été utilisé, faute de binaire IDM autorisé.

### 2.2 Règle de confiance

| Niveau | Signification |
|---|---|
| **Élevé** | Fonction décrite explicitement dans une page officielle ou visible sur une capture officielle. |
| **Moyen** | Fonction déduite de plusieurs descriptions ou du comportement attendu d'un gestionnaire de téléchargement. |
| **Faible** | Allégation marketing non vérifiée, version ambiguë, ou détail non observable. |

---

## 3. Faits, hypothèses et inconnues

### 3.1 Faits documentés

- IDM est un logiciel **Windows** (la fiche Softmany cite Windows XP à 10, ce qui est obsolète).
- La version annoncée par Softmany est **6.43 Build 15** ; le site officiel propose un build 16.
- IDM revendique l'accélération par **segmentation dynamique**, avec division du plus grand segment en deux.
- IDM gère **HTTP, HTTPS, FTP et MMS** selon sa page officielle.
- IDM propose **reprise, pause, arrêt, suppression, file d'attente, planificateur, catégories, grabber, proxy, authentification, limites de débit, thème sombre, personnalisation**.
- IDM s'intègre aux navigateurs par **extension et surveillance des clics**, avec des exceptions par type de fichier et par site.
- IDM propose le **monitoring du presse-papiers**, le **glisser-déposer**, une **cible de dépôt** et des **paramètres de ligne de commande**.
- IDM documente des **actions de fin de file** : raccrocher, quitter IDM, éteindre l'ordinateur, exécuter un programme.
- IDM documente des **quotas** en Mo par heure ou par fenêtre de plusieurs heures.
- IDM documente l'usage de **Basic, Negotiate, NTLM et Kerberos** pour les serveurs et proxys.
- IDM propose une **vérification antivirus** par lancement d'un exécutable tiers à la fin du téléchargement.

### 3.2 Allégations marketing non vérifiées

- « Jusqu'à 5 fois » (Softmany) ou « jusqu'à 8 fois » (site officiel) plus rapide : **non mesuré**, dépend du serveur, du nombre de connexions et du réseau. TDM ne promettra aucun multiplicateur.
- « Téléchargement de vidéos YouTube et listes de lecture » : **non vérifié**, soumis aux conditions des plateformes et à leurs protections. TDM ne promet pas la capture universelle.
- « 100 % sécurisé », « sans virus » : **invérifiable** ; TDM fournira des avertissements et une vérification d'intégrité, pas une garantie de innocuité.
- « Tous les navigateurs » : la liste réelle et les versions ne sont pas testées ici.

### 3.3 Inconnues techniques

| Inconnue | Impact | Stratégie TDM |
|---|---|---|
| Schéma de base de données d'IDM | Aucun (implémentation indépendante) | Schéma SQLite propre, migrations versionnées |
| Algorithme exact de segmentation dynamique | Performance | Implémenter un planificateur de segments documenté et testable, sans copier IDM |
| Politique exacte de reprise (ETag, If-Range, tolérance) | Fiabilité | Règles conservatrices : reprise seulement si validateur cohérent et réponse 206 vérifiée |
| Gestion exacte des erreurs et backoff | UX | Classification erreurs temporaires/permanentes, backoff exponentiel plafonné |
| Comportement quand IDM est fermé | Planification | TDM documentera qu'un planificateur ne s'exécute que si l'application ou son service tourne |
| Intégration MMS/FTP | Périmètre | HTTP/HTTPS en v1 ; FTP envisagé plus tard ; MMS non prévu |
| Capture vidéo propriétaire | Légal/technique | Non prévue en v1 ; analyse de liens explicite et autorisée uniquement |
| Antivirus | Sécurité | Commande externe optionnelle, jamais automatique sans configuration |
| Télémétrie / mise à jour | Vie privée | Aucune télémétrie par défaut ; mise à jour opt-in |

---

## 4. Inventaire fonctionnel

### 4.1 Légende des colonnes

- **Diff.** : S < 1 jour, M 1–3 jours, L 3–8 jours, XL > 8 jours (estimation pour un développeur senior, hors tests de longue durée).
- **P** : P0 = indispensable au MVP ; P1 = v1 ; P2 = ultérieur ; P3 = non prévu.
- **Conf.** : confiance dans la source (Élevé/Moyen/Faible).

### A. Interface et navigation

| ID | Fonction | Description et comportement attendu | Preuve | Écran / action | Dépendances | Limites | Diff. | Critères d'acceptation | Tests | P | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | Fenêtre principale | Affiche l'arbre des catégories/files, la liste des tâches, la barre d'outils et la barre d'état. Redimensionnable, mémorise taille et position. | S3, V1 | Fenêtre principale | UI, persistance des préférences | Le rendu exact d'IDM n'est pas reproduit | M | Au lancement, la fenêtre restaure sa géométrie ; aucune tâche n'est perdue | E2E démarrage/redimensionnement | P0 | Élevé |
| A02 | Menus | Menus Fichier, Téléchargements, Files d'attente, Outils, Affichage, Aide ; actions contexte-dépendantes. | S3, V1 | Barre de menus | Commandes UI | IDM utilise « Tasks » ; TDM garde une structure propre | M | Chaque action de menu est reliée à une commande réelle et testée | Tests UI par commande | P0 | Élevé |
| A03 | Barre d'outils | Ajouter URL, Reprendre, Arrêter, Tout arrêter, Supprimer, Supprimer terminés, Options, Planificateur, Démarrer/Arrêter file. États actifs/inactifs selon la sélection. | S3, V1 | Barre d'outils | Sélection courante, état des tâches | Les icônes IDM ne sont pas réutilisées | M | Un bouton est désactivé quand l'action est impossible ; aucun bouton décoratif | Tests d'état des commandes | P0 | Élevé |
| A04 | Tableau et colonnes | Colonnes : nom, taille totale, reçue, progression, état, débit, temps restant, catégorie, date d'ajout, source, destination. | S3, V1 ; exigence TDM | Liste centrale | Modèle de tâche, formatage | IDM n'affiche pas exactement ces colonnes | M | Les 11 colonnes sont triables et affichent une valeur cohérente | Tests de rendu et de tri | P0 | Élevé |
| A05 | Tri | Clic sur l'en-tête : tri croissant/décroissant, indicateur visuel, tri stable. | S3 | En-tête de colonne | Modèle de liste | — | S | Le tri survit au rafraîchissement et ne perd pas la sélection | Test unitaire de comparateurs | P0 | Élevé |
| A06 | Recherche et filtres | Recherche texte (nom, URL, destination) et filtres par état, catégorie, file, type. | Déduction de S3 ; exigence TDM | Champ de recherche, panneau de filtres | Index de recherche local | IDM ne documente pas une recherche globale explicite | M | Une recherche vide réaffiche tout ; les filtres se combinent | Tests de combinaison | P0 | Moyen |
| A07 | Menu contextuel | Clic droit : démarrer, suspendre, reprendre, annuler, supprimer, propriétés, ouvrir fichier/dossier, copier l'URL, ajouter à une file. | S3, S4 | Liste des tâches | Commandes, permissions fichier | — | S | Chaque entrée est contextuelle et sans effet si non applicable | Tests UI | P0 | Élevé |
| A08 | Propriétés | Affiche URL, destination, taille, état, dates, description ; permet de modifier destination/URL/description d'une tâche en attente. | S6 | Double-clic ou menu contextuel | Modèle, validation de chemins | Modification d'une tâche active limitée | M | Les modifications invalides sont refusées avec un message clair | Tests de validation | P0 | Élevé |
| A09 | Notification de fin | Notification système et/ou boîte de dialogue de fin avec « Ouvrir », « Ouvrir le dossier », « Fermer ». Option « ne plus afficher ». | S7 | Fin de téléchargement | Notifications OS, préférences | Le comportement exact d'IDM n'est pas visible | S | Une notification est émise une seule fois par tâche terminée | Test d'événement | P1 | Élevé |
| A10 | Thèmes | Thème clair et sombre, contraste suffisant, respect du thème système. | S1, V3 | Affichage > Thème | Variables de design | Pas de peaux téléchargeables propriétaires | M | Le changement de thème est immédiat et persistant | Tests visuels et contraste | P1 | Élevé |
| A11 | Personnalisation | Afficher/masquer et réordonner les colonnes ; personnaliser les boutons de la barre d'outils. | S3 | Clic droit en-tête/barre | Préférences | Les skins IDM ne sont pas repris | M | La disposition est restaurée après redémarrage | Test de persistance | P1 | Élevé |
| A12 | Arborescence | Catégories (Tous, Compressés, Documents, Musique, Programmes, Vidéo, Non terminés, Terminés) et files. | S3, V1 | Panneau gauche | Modèle catégories/files | — | M | Sélectionner un nœud filtre la liste sans perte d'état | Tests UI | P0 | Élevé |
| A13 | Barre d'état | Nombre de tâches actives, débit global, espace disque, état du moteur. | Déduction de S3 ; exigence TDM | Bas de fenêtre | Métriques moteur | Non documenté par IDM | S | Les valeurs se mettent à jour au moins 2 fois par seconde | Test de flux | P1 | Moyen |
| A14 | Glisser-déposer | Déposer un ou plusieurs liens dans la fenêtre ou la cible de dépôt ; glisser un fichier terminé vers un autre programme. | S4, S7 | Fenêtre / cible | Drag & drop OS | Le drag sortant dépend du bureau | M | Un lien HTTP/HTTPS valide crée une tâche ; un lien invalide est rejeté | Tests E2E | P1 | Élevé |
| A15 | Langue et accessibilité | Interface française par défaut, anglais prévu ; navigation clavier, libellés accessibles, focus visible. | S1 (multilingue) ; exigence TDM | Tous les écrans | i18n, composants accessibles | IDM revendique de nombreuses langues | L | Parcours clavier complet ; aucun contrôle sans nom accessible | Audit accessibilité | P1 | Moyen |

### B. Téléchargements

| ID | Fonction | Description et comportement attendu | Preuve | Écran / action | Dépendances | Limites | Diff. | Critères d'acceptation | Tests | P | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B01 | Ajout d'URL | Saisie d'une URL HTTP/HTTPS, validation, options de destination, catégorie, file, démarrage immédiat ou différé. | S3, S4 | Ajouter URL | Validation URL | Schémas autres que HTTP/HTTPS refusés en v1 | M | URL valide → tâche créée ; URL invalide → message sans création | Tests unitaires + E2E | P0 | Élevé |
| B02 | Analyse des métadonnées | Requête de découverte : URL finale, type MIME, taille, nom proposé, support des plages, validateurs. | S3 (taille, état) ; déduction | Dialogue d'ajout / fiche | Client HTTP | Serveurs sans HEAD ou sans Content-Length | L | Les métadonnées affichées correspondent aux en-têtes reçus ; les absences sont signalées | Tests serveur local | P0 | Moyen |
| B03 | HTTP/HTTPS | Téléchargement en clair et TLS, vérification stricte du certificat, SNI, HTTP/1.1 au minimum. | S1, S2 | Moteur | Client HTTP, CA système | HTTP/2 non requis en v1 | L | Fichier identique à la source ; certificat invalide refusé | Tests d'intégration TLS | P0 | Élevé |
| B04 | Progression | Octets reçus, pourcentage, débit instantané/lissé, temps restant prudent. | S3, V1 | Liste + fiche | Flux, métriques | ETA instable sur débit variable | M | La progression ne recule jamais pour une même tentative ; l'ETA est masqué si inconnu | Tests de compteur | P0 | Élevé |
| B05 | Pause et reprise | Pause conserve l'état et les octets ; reprise reprend au dernier offset confirmé si le serveur le permet. | S1, S3, S11 | Boutons Pause/Reprendre | Segments, validateurs | Pas de reprise si le serveur ne supporte pas les plages | L | Reprise sans octet dupliqué ni trou ; hash final correct | Test coupure/reprise | P0 | Élevé |
| B06 | Annulation | Annulation propre : arrêt des sockets, flush, fermeture des fichiers, état « annulé », conservation ou suppression des partiels selon choix. | S3 | Bouton Annuler | Moteur, FS | — | M | Aucun descripteur ni timer ne fuit après annulation | Test de fuite | P0 | Élevé |
| B07 | Réessai | Réessais automatiques sur erreurs temporaires, backoff exponentiel avec jitter, plafond configurable. | S8 (tentatives), déduction | Automatique | Classification d'erreurs | Éviter les boucles infinies | M | 5xx/timeout → réessai ; 404 → pas de réessai infini | Tests de politique | P1 | Moyen |
| B08 | Gestion des erreurs | Messages actionnables : DNS, TLS, timeout, 403/404, disque plein, permission, URL invalide. | S12 (403), déduction | Liste + notification | Taxonomie d'erreurs | Le texte exact d'IDM n'est pas connu | M | Chaque catégorie produit un message distinct et un état cohérent | Tests par code | P0 | Moyen |
| B09 | Reprise après redémarrage | Au lancement, restaurer les tâches non terminales, vérifier les partiels, revalider la ressource, reprendre les tâches compatibles. | S1, S11 | Démarrage | DB, FS, HTTP | Ressource modifiée → reprise refusée | L | Après kill -9, les tâches reprennent ou passent en « attention requise », jamais « terminé » à tort | Test kill/restart | P0 | Élevé |
| B10 | Fichiers volumineux | Support > 4 Gio, offsets 64 bits, écriture positionnelle, pas de chargement mémoire complet. | Déduction ; exigence TDM | Moteur | FS, DB | Espace disque et FS limitants | L | Fichier de 5 Gio téléchargé sans dépasser 256 Mio de RSS | Test long | P1 | Moyen |
| B11 | Redirections | Suivre les redirections HTTP avec limite, journaliser la chaîne, recalculer l'URL finale, ne pas fuiter d'identifiants vers un autre origin. | S3 (URL), déduction | Moteur | Client HTTP | Redirections infinies ou vers schémas non autorisés | M | 301/302/307/308 suivis ; boucle refusée ; auth non transmise cross-origin | Tests serveur local | P0 | Élevé |
| B12 | Segmentation | Téléchargement multi-connexions si le serveur le permet ; planification initiale puis division dynamique du plus grand segment. | S1, S11 | Moteur / fiche | Range, pool de connexions | Certains serveurs limitent les connexions ; aucun gain garanti | XL | Le fichier assemblé est identique ; les plages ne se chevauchent pas | Tests de planification + hash | P1 | Élevé |
| B13 | Validation des plages | Vérifier `Accept-Ranges`, réponse 206, `Content-Range` cohérent, taille totale stable. | S11 (segments), déduction | Moteur | Client HTTP | Serveurs menteurs ou proxys | L | Une réponse incohérente désactive la segmentation sans corrompre le fichier | Tests de réponses malformées | P0 | Moyen |
| B14 | Ressource modifiée | Comparer ETag/Last-Modified/taille ; si changement, ne pas concaténer des versions différentes. | S5 (ignore mtime), déduction | Moteur | Validateurs | Serveurs sans validateurs | L | Changement détecté → reprise refusée et signalée | Test de ressource modifiée | P0 | Moyen |
| B15 | Limite de vitesse | Plafond global et par tâche, lissage token bucket, application sans blocage de l'UI. | S1, S5 | Options / tâche | Moteur | Précision variable selon le système | M | Débit moyen proche du plafond ±10 % sur 30 s | Test de débit | P1 | Élevé |
| B16 | Concurrence | Nombre configurable de téléchargements simultanés et de connexions par tâche. | S5 (connexions par serveur), S8 (fichiers simultanés) | Options / file | Ordonnanceur | Limites serveur | M | La limite est respectée ; les tâches en attente ne démarrent pas | Test de concurrence | P0 | Élevé |
| B17 | Délais d'attente | Timeout de connexion, de lecture et global ; annulation propre. | Déduction | Moteur | Client HTTP | Réseaux très lents | S | Un serveur muet échoue dans le délai configuré | Test serveur lent | P0 | Moyen |
| B18 | Noms et collisions | Assainir le nom, refuser les caractères réservés Windows, éviter `..`, limiter la longueur, ne pas écraser sans confirmation, proposer un suffixe. | Déduction ; exigence TDM | Dialogue / moteur | Validation de chemins | Noms Unicode et FS variés | M | `../../etc/passwd` ne sort pas du dossier ; collision → suffixe ou confirmation | Tests de chemins | P0 | Moyen |
| B19 | Fichiers partiels | Convention `.tdmpart` + métadonnées ; nettoyage contrôlé, jamais automatique sans confirmation. | Déduction | Moteur / options | FS, DB | Partiels orphelins | M | Un partiel n'est jamais présenté comme fichier final | Tests FS | P0 | Moyen |
| B20 | Protocoles et auth | IDM documente FTP, MMS, Basic, Negotiate, NTLM, Kerberos. TDM v1 : HTTP/HTTPS + Basic/Digest ; FTP et auth avancée en P2. | S1, S5 | Options / ajout | Bibliothèques | MMS non prévu ; NTLM/Kerberos coûteux | L | HTTP/HTTPS et Basic fonctionnent ; les autres sont explicitement non supportés | Tests d'auth | P2 | Élevé |

### C. Organisation

| ID | Fonction | Description et comportement attendu | Preuve | Écran / action | Dépendances | Limites | Diff. | Critères d'acceptation | Tests | P | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C01 | Catégories automatiques | Catégories par extension/type : Compressés, Documents, Musique, Programmes, Vidéo, Images, Autres ; destination par défaut. | S3 | Arbre / options | Règles, MIME | Un fichier sans extension va dans « Autres » | M | La catégorie proposée correspond à la règle la plus spécifique | Tests de règles | P0 | Élevé |
| C02 | Règles personnalisées | Créer/modifier/supprimer une catégorie : nom, dossier, extensions, domaines autorisés. | S3 | Propriétés de catégorie | Validation | — | M | Une règle de domaine ne s'applique qu'aux origines correspondantes | Tests de matching | P1 | Élevé |
| C03 | Dossiers de destination | Dossier par défaut global, par catégorie, par tâche ; vérification d'écriture. | S3, S5 | Options / ajout | FS | Chemins hors racines autorisées refusés | M | Un dossier non inscriptible est refusé avant le démarrage | Tests de permissions | P0 | Élevé |
| C04 | Files d'attente | File principale, file de synchronisation (P2), files personnalisées ; ajout/retrait, démarrage/arrêt. | S8, S9 | Panneau files | Ordonnanceur | — | L | Une file suspendue ne démarre aucune tâche | Tests d'ordonnancement | P0 | Élevé |
| C05 | Priorités | Priorité par tâche et ordre dans la file ; les tâches haute priorité passent avant. | Déduction de S8/S9 | Menu / file | Ordonnanceur | Pas de préemption brutale d'un transfert en cours | M | L'ordre observé respecte priorité puis FIFO | Tests d'ordre | P0 | Moyen |
| C06 | Limites par file | Nombre de téléchargements simultanés par file. | S8 | Planificateur | Ordonnanceur | — | S | La limite par file est indépendante de la limite globale | Tests | P0 | Élevé |
| C07 | Quotas | Quota en Mo par heure ou par fenêtre, reprise automatique après la fenêtre. | S1, S5, S8 | Options | Compteur, horloge | Précision et changement d'heure | L | Le quota est respecté ; la reprise a lieu après la fenêtre | Test avec horloge injectée | P2 | Élevé |
| C08 | Historique | Conserver les tâches terminées/annulées, rechercher, purger selon une politique. | S3 (Delete Completed) | Liste / historique | DB | Vie privée : purge configurable | M | L'historique survit au redémarrage ; la purge est explicite | Tests DB | P1 | Élevé |
| C09 | Import/export | Exporter/importer une liste de tâches (JSON/CSV) sans secrets ; valider le schéma. | Déduction ; exigence TDM | Menu Fichier | Sérialisation | Pas d'import de formats propriétaires IDM | M | Un export réimporté recrée les tâches en attente, pas les partiels | Tests de round-trip | P2 | Moyen |
| C10 | Colonne Q | Indiquer la file d'appartenance et l'état de planification. | S3, S9 | Liste | Modèle file | — | S | La colonne reflète la file réelle après déplacement | Tests UI | P1 | Élevé |
| C11 | Réorganisation | Déplacer une tâche dans une file, changer l'ordre par boutons ou glisser-déposer. | S8, S9 | Liste / planificateur | Ordonnanceur | — | M | L'ordre est persisté et respecté au redémarrage | Tests | P1 | Élevé |

### D. Automatisation

| ID | Fonction | Description et comportement attendu | Preuve | Écran / action | Dépendances | Limites | Diff. | Critères d'acceptation | Tests | P | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| D01 | Planification | Démarrer/arrêter une file à une date et une heure données. | S8, V2 | Planificateur | Horloge, ordonnanceur | Application fermée = pas d'exécution | L | La file démarre à l'heure prévue (±2 s) si l'app tourne | Tests d'horloge | P0 | Élevé |
| D02 | Répétition | One-time, quotidien, jours sélectionnés, intervalle en heures/minutes. | S8, V2 | Planificateur | Calcul de prochaine occurrence | DST et sommeil de l'OS | L | La prochaine occurrence est correcte autour d'un changement d'heure | Tests de calendrier | P1 | Élevé |
| D03 | Tentatives | Nombre de tentatives par fichier en cas d'échec. | S8 | Planificateur | Politique de retry | IDM peut réessayer indéfiniment ; TDM plafonne | S | Le nombre configuré est respecté puis la tâche passe en erreur | Tests | P1 | Élevé |
| D04 | Actions de fin | Lancer un programme, éteindre l'ordinateur, quitter TDM ; confirmation obligatoire pour l'extinction. | S8, V2 | Planificateur | OS, permissions | Actions systèmes sensibles | M | L'action n'a lieu qu'après succès de la file et confirmation | Tests avec commande factice | P2 | Élevé |
| D05 | Restauration | Restaurer les planifications après redémarrage ; recalculer les occurrences manquées. | S8, déduction | Démarrage | DB, horloge | Occurrences manquées non rejouées sans règle | M | Une planification survive au redémarrage | Tests | P0 | Élevé |
| D06 | Application fermée | Documenter et afficher clairement qu'aucune planification ne s'exécute si TDM est quitté. | S8 (implicite) | Aide / planificateur | Tray, autostart | Pas de service système en v1 | S | L'UI affiche l'état « application requise » | Test de texte/état | P0 | Moyen |
| D07 | Démarrage manuel | Démarrer/arrêter une file immédiatement, indépendamment de l'heure. | S8, S9 | Boutons / menu | Ordonnanceur | — | S | L'action est immédiate et journalisée | Tests | P0 | Élevé |
| D08 | Horloge et sommeil | Utiliser l'heure locale, recalculer après réveil, éviter les doubles départs. | Déduction | Moteur | OS | Réveil non garanti | M | Un réveil après l'heure prévue déclenche une seule fois | Test d'horloge simulée | P1 | Moyen |

### E. Intégrations

| ID | Fonction | Description et comportement attendu | Preuve | Écran / action | Dépendances | Limites | Diff. | Critères d'acceptation | Tests | P | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E01 | Extension Chromium | Extension MV3 pour Chrome/Edge : menu contextuel, envoi explicite d'un lien à TDM, détection de disponibilité. | S1, S12, S13 | Navigateur | Canal local sécurisé | Publication store non planifiée ; installation développeur | L | Un lien envoyé crée une tâche ; TDM absent → message clair | Test E2E extension | P1 | Élevé |
| E02 | Extension Firefox | Équivalent Firefox (MV3 compatible), permissions minimales. | S1, S13 | Navigateur | API WebExtension | Page d'installation officielle non accessible | L | Même contrat que Chromium, testé sur Firefox réel | Test Firefox | P1 | Moyen |
| E03 | Transmission d'URL | Message signé/authentifié vers TDM, URL et métadonnées autorisées uniquement. | S4, S12 | Extension → app | IPC local, token | Pas de capture universelle | M | Un message sans token ou d'origine inconnue est rejeté | Tests de sécurité | P0 | Moyen |
| E04 | Presse-papiers | Surveiller les URL copiées, proposer ou ajouter selon préférence ; désactivé par défaut. | S4, S5 | Options | API presse-papiers | Vie privée, faux positifs | M | Aucune lecture si désactivé ; une URL valide déclenche une proposition | Tests | P1 | Élevé |
| E05 | Menu contextuel navigateur | « Télécharger avec TDM » sur un lien ou une sélection de liens. | S4 | Navigateur | Extension | Sites protégés non contournés | M | Le menu n'apparaît que sur les liens autorisés | Test extension | P1 | Élevé |
| E06 | Tous les liens | Analyser une page autorisée et proposer les liens téléchargeables, avec filtres. | S1, S10 | Analyse de liens | Fetch HTML, parseur | Respect robots/domaine/auth ; pas de contournement | L | Aucune requête hors domaine autorisé ; liens listés avec type/taille | Tests serveur local | P2 | Élevé |
| E07 | Glisser-déposer | Voir A14. | S4 | Fenêtre | OS | — | M | — | — | P1 | Élevé |
| E08 | Ligne de commande | `tdm --url URL [--dest PATH] [--name NAME] [--queue Q] [--silent] [--add-only]`. | S4 | Terminal | Instance unique, IPC | Pas de paramètres IDM copiés | M | Les options documentées fonctionnent ; les inconnues échouent proprement | Tests CLI | P1 | Élevé |
| E09 | Proxy | Proxy système, manuel HTTP/HTTPS/SOCKS, PAC, liste d'exclusions, proxy par protocole. | S1, S5 | Options | Client HTTP | SOCKS et PAC selon bibliothèque | L | Le trafic passe par le proxy configuré ; l'exclusion fonctionne | Tests proxy local | P1 | Élevé |
| E10 | Authentification | Basic/Digest pour serveur et proxy ; identifiants stockés chiffrés. | S1, S5 | Options / ajout | Keychain OS | NTLM/Kerberos non prévus v1 | L | Aucun mot de passe en clair dans les fichiers | Audit stockage | P1 | Élevé |
| E11 | Notifications système | Notification à la fin, en erreur, et pour les événements de file ; respect du mode Ne pas déranger. | S7 | OS | API notifications | Certains bureaux Linux peuvent les ignorer | S | Une notification par événement, sans doublon | Tests | P1 | Moyen |
| E12 | Instance unique | Un seul processus principal ; un second lancement transmet ses arguments à l'instance existante. | Déduction | Démarrage | Verrou OS | — | S | Deux lancements → une seule fenêtre, URL transmise | Test | P0 | Moyen |
| E13 | Grabber | Assistant d'exploration de site avec filtres, projets sauvegardés, planification. | S10 | Outils > Grabber | Crawler, filtres | Périmètre légal et charge serveur | XL | Un projet ne sort pas du domaine autorisé et respecte les limites | Tests serveur local | P2 | Élevé |
| E14 | Capture vidéo | IDM revendique la capture de vidéos et listes de lecture. | S2, S12 | Navigateur | Analyse de flux, DRM | Non prévu : plateformes, DRM, conditions d'utilisation | XL | Non applicable | — | P3 | Faible |
| E15 | Antivirus | Lancer un scanner configuré à la fin, avec paramètres et code retour. | S1, S5 | Options | Processus externe | Pas de scanner intégré ; pas de garantie | M | Le scanner est lancé une fois, son code est journalisé | Test avec faux scanner | P2 | Élevé |

### F. Sécurité et maintenance

| ID | Fonction | Description et comportement attendu | Preuve | Écran / action | Dépendances | Limites | Diff. | Critères d'acceptation | Tests | P | Conf. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F01 | Validation des chemins | Résoudre les chemins, refuser `..`, liens symboliques dangereux, fichiers spéciaux, noms réservés Windows ; confiner aux racines autorisées. | Déduction ; exigence TDM | Ajout / options | API FS | GUI utilisateur local | M | Aucune écriture hors racine, même avec un nom malveillant | Tests de traversée | P0 | Moyen |
| F02 | Gestion des partiels | Fichiers `.tdmpart`, sidecar de métadonnées, reprise, nettoyage explicite. | Déduction | Moteur | FS, DB | Crash entre écriture et DB | L | Un crash ne corrompt pas le fichier final ; les partiels sont récupérables | Tests de crash | P0 | Moyen |
| F03 | Vérification d'intégrité | Taille finale, hash SHA-256 optionnel, comparaison avec un checksum fourni. | Déduction ; exigence TDM | Propriétés | Hash | Pas de checksum serveur standard | M | Un checksum incorrect marque la tâche en erreur | Tests | P2 | Moyen |
| F04 | Journalisation | Journal structuré par niveau, rotation, aucune donnée secrète, export de diagnostic. | Déduction | Options / aide | FS | Vie privée | M | Les journaux ne contiennent ni token ni mot de passe | Audit de logs | P0 | Moyen |
| F05 | Secrets | Mots de passe proxy/site chiffrés via le keychain OS ; jamais en clair dans la DB. | S5, exigence TDM | Options | Keychain | Keychain Linux absent → avertir | L | Une recherche de mot de passe dans les fichiers échoue | Audit | P0 | Élevé |
| F06 | Mises à jour | Vérification opt-in, métadonnées signées, jamais d'installation silencieuse. | S1 | Aide > Mises à jour | Serveur de mise à jour | Pas de serveur en v1 | M | Une mise à jour non signée est refusée | Test signature | P2 | Élevé |
| F07 | Installation/désinstallation | Paquets Linux (.deb/AppImage) et installateur Windows (NSIS), désinstallation propre, données utilisateur conservées ou supprimées sur choix. | S13, exigence TDM | OS | Packaging | Signature Windows nécessite un certificat | L | Installation et désinstallation testées sur VM/CI | Tests packaging | P1 | Moyen |
| F08 | DB, migrations, sauvegardes | SQLite en WAL, migrations versionnées, sauvegarde avant migration, restauration. | Déduction | Démarrage | SQLite | Corruption disque | L | Une DB de version N migre vers N+1 ; une DB corrompue est signalée | Tests de migration | P0 | Moyen |
| F09 | Sécurité IPC/extension | Loopback uniquement, token aléatoire, validation d'origine, schémas de messages, limitation de débit. | S12, exigence TDM | Extension/app | Canal local | Pas de natif messaging en v1 | L | Port non exposé au réseau ; message malformé rejeté | Tests de sécurité | P0 | Moyen |
| F10 | Avertissement exécutables | Signaler les extensions exécutables et proposer une analyse avant ouverture. | Déduction | Fin de téléchargement | Liste d'extensions | Pas de garantie antivirus | S | Un `.exe` déclenche un avertissement non bloquant | Test UI | P2 | Moyen |

---

## 5. Synthèse des priorités

### 5.1 MVP (P0)

- Fenêtre principale, menus, barre d'outils, tableau, tri, filtres, menus contextuels, propriétés.
- Ajout d'URL, métadonnées, HTTP/HTTPS, progression, pause/reprise, annulation, erreurs.
- Reprise après redémarrage, validation des plages, redirections, timeouts, noms/collisions.
- Catégories automatiques, dossiers, files, priorités, concurrence, planification de base, restauration.
- Persistance SQLite, migrations, chemins sûrs, secrets, journalisation, IPC sécurisé, instance unique.

### 5.2 v1 (P1)

- Segmentation multi-connexions, limite de débit, gros fichiers.
- Historique, import/export, colonne Q, réorganisation.
- Extensions Chromium et Firefox, presse-papiers, menu contextuel, CLI, proxy, notifications.
- Packaging Linux/Windows, thème sombre, personnalisation, accessibilité.

### 5.3 Ultérieur (P2)

- Quotas, synchronisation périodique, grabber, antivirus, checksum, actions de fin sensibles, mises à jour signées.
- FTP, NTLM/Kerberos.

### 5.4 Non prévu (P3)

- Capture vidéo propriétaire et contournement de DRM.
- Reproduction des skins, icônes, marque ou ressources IDM.
- MMS.
- Intégration Internet Explorer / MSN / AOL.
- Téléavertissement, parrainage, enregistrement commercial.

---

## 6. Exigences transverses

1. **Aucune fonction simulée** : chaque bouton visible appelle une commande réelle ou est désactivé avec une explication.
2. **Séparation moteur/UI** : l'interface ne manipule ni sockets ni fichiers ; elle observe et commande le moteur.
3. **Reprise honnête** : une tâche n'est jamais marquée terminée sans vérification de taille et d'assemblage.
4. **Sécurité par défaut** : HTTPS vérifié, chemins confinés, secrets chiffrés, IPC authentifié.
5. **Observabilité** : journalisation et compteurs permettant de diagnostiquer un échec.
6. **Accessibilité** : navigation clavier, focus, contrastes, libellés.
7. **Originalité** : identité TDM, code et ressources propres ; aucune copie graphique d'IDM.
8. **Tests reproductibles** : serveur local, scénarios réseau contrôlés, résultats conservés.

---

## 7. Limites de cet audit

- Les affirmations de performance d'IDM ne sont pas vérifiées.
- Le comportement réel d'IDM (messages, délais, reprise exacte, base de données) n'est pas observable sans binaire autorisé.
- Certaines pages officielles peuvent être datées ou contradictoires (5x vs 8x, Windows XP à 10).
- Les captures officielles montrent plusieurs versions (6.35, 6.37, 6.38) ; l'UI actuelle peut différer.
- Aucune conclusion n'est tirée sur les composants internes, les protocoles propriétaires ou les techniques anti-DRM d'IDM.
- L'extension Firefox n'a pas pu être examinée ; seule l'extension Chromium est documentée publiquement.

---

## 8. Décisions retenues

1. Périmètre v1 : HTTP/HTTPS uniquement, FTP/NTLM/Kerberos/grabber en P2.
2. Politique de capture : envoi explicite depuis l'extension, pas de prise en charge universelle ni de capture vidéo.
3. Planificateur : fonctionne seulement si TDM (ou son processus moteur) est actif ; pas de service système en v1.
4. Identité visuelle TDM : palette, typographie et icônes originales, sans reprise des ressources IDM.
5. Stack technique retenue : Electron 45 + TypeScript + React, voir `TECHNOLOGY_DECISION.md` (acceptée et implémentée).
