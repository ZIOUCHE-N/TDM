# Guide utilisateur — TDM 0.1.0

TDM (Téléchargement Download Manager) télécharge des fichiers HTTP/HTTPS avec reprise, segments
parallèles, files d'attente, catégories et planification locale. Cette version est en français et
est **validée sous Linux Mint/Ubuntu** ; un installeur Windows 10/11 a été produit sous Wine mais n'a
pas été installé ni exécuté sur Windows (voir la fin du guide).

## 1. Installer et lancer

### Linux

**AppImage** (aucune installation) :

```bash
chmod +x tdm-0.1.0-x86_64.AppImage
./tdm-0.1.0-x86_64.AppImage
```

Si FUSE n'est pas disponible :

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./tdm-0.1.0-x86_64.AppImage
```

**Debian/Ubuntu** :

```bash
sudo apt install ./tdm-0.1.0-amd64.deb
tdm
```

Le paquet installe l'entrée de menu **TDM** dans la catégorie Réseau.

### Windows

Un installeur NSIS (`tdm-0.1.0-x64-setup.exe`) est fourni. Il a été produit depuis Linux avec Wine et
son archive a été contrôlée, mais **il n'a été ni installé ni exécuté sur Windows 10/11**. Ne pas le
distribuer comme validé avant les tests décrits dans `BUILD.md`.

### Données

- Linux : configuration, base et journaux dans `~/.config/tdm`.
- Windows : `%APPDATA%\tdm`.
- Téléchargements par défaut : `~/Downloads/TDM` (Linux) ou `%USERPROFILE%\Downloads\TDM` (Windows).

## 2. Premier téléchargement

1. Cliquer sur **Nouveau** (ou `Ctrl+N`).
2. Coller une URL `http://` ou `https://`.
3. Cliquer sur **Analyser**. TDM interroge le serveur et affiche la taille, le type et la possibilité de
   reprise. Si l'analyse échoue, le message d'erreur indique la cause (DNS, TLS, HTTP, délai).
4. Ajuster si besoin :
   - **Nom du fichier** (sinon déduit de `Content-Disposition` ou de l'URL) ;
   - **Dossier de destination** ;
   - **Catégorie** (détermine le sous-dossier et les règles extension/domaine) ;
   - **File d'attente** ;
   - **Connexions simultanées** (1 à 16) ;
   - **SHA-256 attendu** (facultatif) ;
   - **Description** ;
   - **Démarrer immédiatement**.
5. Cliquer sur **Télécharger**.

Le fichier n'apparaît à son emplacement final qu'une fois complet et, si demandé, vérifié. Pendant le
transfert, les données sont écrites dans un fichier `.tdm-part` ; il est renommé en fichier final à la
fin, sans écraser un fichier existant.

## 3. Suivre et contrôler

Le tableau affiche le nom, l'hôte, l'état, la taille, la progression, la vitesse et le temps restant.

- **Suspendre** : arrête les connexions et conserve la progression.
- **Reprendre** : continue à partir des segments enregistrés.
- **Annuler** : arrête et supprime les données temporaires ; le fichier final n'est pas touché.
- **Ouvrir** (double-clic sur une ligne terminée) : lance le fichier avec l'application par défaut.
- **Dossier** : ouvre le dossier contenant le fichier.
- **Retirer** : enlève la ligne de la liste. Une confirmation permet de supprimer aussi le fichier.

La barre d'outils propose **Tout démarrer** et **Tout suspendre**. La recherche filtre par nom, URL ou
hôte ; les en-têtes du tableau permettent de trier.

### Panneau de propriétés

Un clic sur une ligne ouvre les détails : progression, vitesse, connexions, file, priorité, limite de
débit, description, chemins, dates, type MIME, tailles et empreintes SHA-256. Les champs modifiables sont
appliqués immédiatement à la tâche.

- **Priorité** : -10 (basse) à 10 (haute).
- **Connexions** : 1 à 16 ; une modification prend effet à la prochaine reprise.
- **Limite Kio/s** : 0 utilise la limite globale par tâche.

## 4. Catégories

Les catégories intégrées sont : Compressés, Documents, Images, Musique, Programmes, Vidéos et Autres.
Elles possèdent des règles d'extension et un dossier. **Gérer** ouvre l'éditeur :

- modifier le dossier ou les extensions/domaines d'une catégorie intégrée ;
- créer une catégorie personnalisée ;
- supprimer une catégorie personnalisée (les fichiers déjà téléchargés restent en place).

La catégorie est choisie à l'ajout ; sinon TDM la déduit du nom de fichier et du domaine.

## 5. Files d'attente

Une file rassemble des téléchargements avec sa propre limite de simultanéité. La file **Principal**
existe toujours ; les autres se créent via **Files d'attente → Gérer**.

- Le bouton à côté d'une file la démarre ou l'arrête.
- Démarrer une file remet en attente ses tâches suspendues ou échouées, puis les exécute dans la limite
  de concurrence.
- Arrêter une file suspend ses téléchargements actifs ; la progression est conservée.
- Supprimer une file détache ses tâches ; aucun fichier n'est supprimé.
- La file principale ne peut pas être supprimée.

## 6. Planificateur

**Planificateur** permet de créer des règles :

| Mode | Signification |
| --- | --- |
| Une fois | Date et heure locales uniques. |
| Quotidien | Heure `HH:MM`, éventuellement limitée à certains jours. |
| Intervalle | Toutes les N minutes après le dernier lancement. |

Actions : démarrer/arrêter une file, ou tout démarrer/arrêter. Une fenêtre horaire (heure de début et
d'arrêt) est disponible pour les actions de démarrage quotidiennes : TDM démarre à l'heure prévue et
arrête à l'heure de fin.

**Important** : le planificateur ne fonctionne que lorsque TDM est lancé. Aucun service système n'est
installé ; si TDM est fermé, aucune action planifiée n'a lieu.

## 7. Navigateur

TDM expose un pont local **explicite** : l'extension n'envoie un lien que lorsque vous le demandez.

1. Dans TDM : **Paramètres → Navigateur**. Vérifier que le pont est activé et noter le port
   (47831 par défaut).
2. Copier le **jeton d'appairage**.
3. Installer l'extension :
   - Chrome/Edge : `chrome://extensions`, activer le mode développeur, **Charger l'extension non
     empaquetée**, choisir le dossier `extension/`.
   - Firefox : `about:debugging#/runtime/this-firefox`, **Charger un module temporaire**, choisir
     `extension-firefox/manifest.json`.
4. Ouvrir la fenêtre de l'extension, coller le jeton, **Enregistrer**, puis **Tester**.
5. Utiliser **Télécharger la page active avec TDM** ou le menu contextuel **Télécharger le lien avec
   TDM**.

Le pont n'écoute que sur `127.0.0.1`, exige le jeton et limite les requêtes à 60 par minute. Les
extensions n'ont aucune permission de lecture ou de modification des pages.

## 8. Paramètres

| Onglet | Réglages principaux |
| --- | --- |
| Général | thème, niveau de journal, rétention de l'historique, démarrage automatique, réduction dans la zone de notification, confirmation de suppression, notifications, surveillance du presse-papiers |
| Téléchargements | dossier par défaut, téléchargements simultanés, connexions par fichier, seuil de segmentation, tentatives, limites de vitesse |
| Réseau | proxy système/direct/manuel, URL, domaines sans proxy, User-Agent |
| Navigateur | activation du pont, port, jeton, test, dossier des extensions |
| Données & sécurité | chemins, version SQLite, diagnostic, journaux |

**Enregistrer** applique les changements sans redémarrage. La limite globale est mise à jour
immédiatement ; la concurrence s'applique aux prochains démarrages (les transferts déjà actifs ne sont
pas interrompus) et une nouvelle limite par tâche prend effet à la reprise de celle-ci.

### Presse-papiers

Si **Surveiller le presse-papiers** est activé, TDM détecte les URL qui ressemblent à un fichier et
propose de l'ajouter. Désactivé par défaut.

## 9. Historique, diagnostic et journaux

- **Historique** : ajouts, démarrages, fins, pauses, annulations, retraits, échecs et démarrages/arrêts
de files. Les actions du planificateur sont journalisées dans `tdm.log`, pas dans l'historique. La purge
suit la rétention configurée (0 = illimité).
- **Diagnostic** (menu Outils) : version, protocole, SQLite, plateforme, date et durée de service,
  chemins de la base et des téléchargements, compteurs et débit agrégé. Le rapport JSON peut être copié ;
  l'état du pont est visible dans la barre d'état et les erreurs dans les journaux.
- **Journaux** : menu Outils → **Dossier des journaux**. Le niveau se règle dans les paramètres.

## 10. Raccourcis

| Raccourci | Action |
| --- | --- |
| `Ctrl/Cmd+N` | Nouveau téléchargement |
| `Ctrl/Cmd+,` | Paramètres |
| `Ctrl/Cmd+Shift+S` | Tout démarrer |
| `Ctrl/Cmd+Shift+P` | Tout suspendre |
| `Échap` | Fermer la modale |
| `Entrée` | Valider |

## 11. Dépannage

| Problème | Solution |
| --- | --- |
| « Le moteur ne répond pas » | Attendre le démarrage ; consulter les journaux ; redémarrer TDM. |
| Un téléchargement échoue immédiatement | Vérifier l'URL, le réseau, le proxy et le certificat TLS. |
| La reprise n'est pas possible | Le serveur n'annonce pas `Accept-Ranges` ou a changé le fichier (taille/ETag). TDM repart de zéro. |
| Débit lent | Augmenter les connexions si le serveur le permet ; vérifier une limite globale ou par tâche. |
| L'extension ne joint pas TDM | Pont désactivé, port occupé, jeton erroné ou TDM fermé. Tester depuis les paramètres. |
| Fichier introuvable après annulation | L'annulation supprime le `.tdm-part` ; aucun fichier final n'est produit. |
| AppImage ne démarre pas | Utiliser `APPIMAGE_EXTRACT_AND_RUN=1`. |

## 12. Limites à connaître

- HTTP/HTTPS uniquement : pas de FTP, SFTP, MMS ni capture vidéo.
- Pas de grabber de site ni d'extraction automatique de liens d'une page.
- Planificateur actif seulement quand TDM tourne.
- Pas d'authentification NTLM/Kerberos ni de gestion avancée des cookies.
- Pas de mise à jour automatique ni de signature de code.
- Interface uniquement en français.
- Installeur Windows produit sous Wine mais non installé ni exécuté sur Windows.

Pour la liste complète et les raisons, voir [`LIMITATIONS.md`](LIMITATIONS.md).
