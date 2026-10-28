# Limites connues — TDM 0.1.0

Ce document énumère ce que TDM ne fait pas, ce qui n'a pas été validé, et les compromis assumés. Il fait
partie du contrat de transparence de la version 0.1.0.

## 1. Périmètre fonctionnel

### Protocoles

- **HTTP et HTTPS uniquement.** Aucun support FTP, FTPS, SFTP, SCP, MMS, RTSP ou BitTorrent.
- Les URL `file:`, `data:`, `javascript:` et autres schémas sont rejetées.
- Les flux HLS/DASH et la capture de vidéo en streaming ne sont pas gérés.
- Les téléchargements authentifiés par formulaire, cookies de session avancés, NTLM ou Kerberos ne sont
  pas pris en charge. Un en-tête `Referer` peut être transmis par le pont ; aucun autre en-tête
  personnalisé n'est exposé dans l'interface.

### Découverte de liens

- Pas de **grabber** de site, pas d'exploration récursive, pas d'extraction automatique des liens d'une
  page.
- La surveillance du presse-papiers ne fait que proposer une URL qui ressemble à un fichier ; elle est
  désactivée par défaut.
- L'extension navigateur transmet uniquement l'URL choisie par l'utilisateur.

### Segments et reprise

- La reprise exige un serveur qui annonce `Accept-Ranges: bytes` et une taille connue.
- Si la taille, l'`ETag` ou `Last-Modified` changent, TDM considère le fichier comme différent et
  recommence ; il ne tente pas de fusionner deux versions.
- Les fichiers sans `Content-Length` sont téléchargés séquentiellement et ne sont pas reprenables.
- Le nombre maximal de connexions par tâche est 16 ; le seuil de segmentation est configurable.
- Une modification du nombre de connexions pendant un transfert est refusée : il faut suspendre la
  tâche d'abord.
- Une limite de vitesse par tâche est lue au démarrage du transfert ; la modifier prend effet à la
  reprise. La limite globale s'applique immédiatement.

### Vérification

- Seul SHA-256 est pris en charge comme empreinte attendue.
- Aucune vérification de signature, d'antivirus ou de réputation du fichier.

## 2. Planificateur

- **Il ne fonctionne que lorsque TDM est lancé.** Aucun service système, tâche planifiée Windows ou
  timer systemd n'est installé.
- La granularité de vérification est de 20 secondes ; une action peut donc démarrer avec un léger retard.
- Les fenêtres horaires traversant minuit sont gérées.
- Une planification « une fois » déjà calculée et devenue échéante pendant que TDM était fermé est
  exécutée au premier tick après redémarrage. Une planification enregistrée avec une date déjà
  passée (sans `next_run_at` calculé) n'est pas rattrapée.
- Le champ « tentatives » du planificateur est enregistré mais aucune action échouée n'est
  réellement retentée.
- Les actions se limitent à démarrer/arrêter une file ou tout ; pas de mise en veille, d'extinction ou
  de lancement d'application.
- Les changements d'heure et les fuseaux sont traités par l'horloge locale ; aucun test de changement
  d'heure n'a été exécuté.

## 3. Navigateur

- Le pont écoute sur **IPv4 `127.0.0.1` uniquement** ; `localhost` en IPv6 n'est pas exposé.
- Il utilise un jeton statique stocké dans `userData/bridge-token` (permissions `0600` sous Linux). Il
  n'y a pas de rotation automatique ni d'expiration.
- La limitation est de 60 requêtes par minute et par processus ; elle n'est pas persistée.
- L'extension Chrome/Edge a été chargée et testée dans Chromium 156 uniquement. Chrome et Edge de marque
  n'ont pas été exécutés ; les menus contextuels et notifications de l'extension n'ont pas été testés.
- L'extension Firefox **n'a pas été chargée dans un navigateur réel**.
- Pas de messagerie native, pas d'intégration au gestionnaire de téléchargements du navigateur, pas
  d'interception automatique des clics.
- Le jeton est affiché dans les paramètres et copiable ; toute personne ayant accès à la session
  utilisateur peut le lire.

## 4. Interface et système

- Interface **uniquement en français**. Aucune infrastructure de traduction n'est fournie.
- Une seule fenêtre ; pas de fenêtre de progression séparée.
- Pas de mode compact, pas de colonnes configurables, pas de thème personnalisé au-delà de clair/sombre/
  système.
- La zone de notification et les notifications système n'ont pas été validées sur toutes les
  distributions ; certains environnements GNOME exigent une extension pour afficher l'icône.
- Le démarrage automatique à la session utilise les mécanismes de l'OS ; il n'a pas été testé sur une
  session réelle.
- L'instance unique redirige un second lancement vers la fenêtre existante ; les arguments sont traités
  une seule fois.
- Pas de raccourcis globaux système.
- L'accessibilité a été prise en compte (rôles ARIA, focus, contrastes) mais **aucun audit avec lecteur
  d'écran n'a été exécuté**.

## 5. Plateformes et paquets

- **Linux x64 est la seule plateforme validée.**
- Le paquet `.deb` et l'AppImage ont été démarrés ; l'installation du `.deb` sur un système vierge n'a
  pas été testée.
- **Windows 10/11 : artefact produit sous Wine, non installé, non exécuté, non validé.** L'installeur
  NSIS `dist/tdm-0.1.0-x64-setup.exe` existe (archive contrôlée par `7z t`), mais aucun test sur Windows
  n'a été réalisé : ce paquet ne doit pas être distribué comme validé.
- Pas de paquet macOS, ARM, Snap, Flatpak ou Microsoft Store.
- Pas de signature de code, pas de notarisation, pas de mise à jour automatique.
- Aucune page publique, aucun dépôt ni canal de support n'est associé au paquet ; `https://tdm.example`
  est une URL réservée servant uniquement aux métadonnées du `.deb`.
- La taille des paquets (≈100–125 Mio) reflète Electron ; aucune optimisation de taille n'a été faite.

## 6. Sécurité et vie privée

- Aucun contournement de DRM, de paywall, d'authentification ou de protection de site.
- Aucun chiffrement de la base locale : elle contient les URL, chemins et historiques en clair, protégée
  par les permissions du compte utilisateur.
- Les journaux peuvent contenir des URL et des noms de fichiers ; ils ne sont pas chiffrés.
- Pas de télémétrie, pas de compte, pas de synchronisation cloud.
- Le pont accepte les origines `chrome-extension://` et `moz-extension://` de manière générique ; tout
  jeton valide reste nécessaire.
- Les fichiers téléchargés ne sont pas analysés. L'utilisateur reste responsable de leur provenance.

## 7. Exploitation et support

- Pas de migration de schéma au-delà de la version 1 ; une future version devra ajouter des migrations.
- Pas de sauvegarde automatique de la base.
- Les erreurs réseau sont journalisées, mais il n'existe pas d'export de diagnostic vers un fichier
  unique (le rapport peut être copié).
- Pas de tests de charge au-delà de quelques mégaoctets ; les très gros fichiers et les milliers de
  tâches n'ont pas été éprouvés.
- Pas de tests de réseau instable, de coupure Wi-Fi, de changement d'interface ou de proxy authentifié.

## 8. Ce qui est explicitement hors périmètre

FTP/SFTP, capture vidéo, grabber de site, navigateur intégré, lecteur multimédia, accélérateur de
téléchargement pour jeux, gestion de torrents, antivirus, cloud, comptes, publicité, monétisation.

Ces absences sont volontaires : TDM 0.1.0 vise un moteur HTTP/HTTPS fiable et une interface honnête,
pas une parodie de produit commercial.
