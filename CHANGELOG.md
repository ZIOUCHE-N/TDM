# Journal des changements

Toutes les dates sont au format ISO 8601. Le projet suit une versionnage sémantique simple tant que
l'API n'est pas stable.

## [0.1.0] — 2026-10-23

Première version fonctionnelle, originale et vérifiée sous Linux x64. Windows est configuré mais non
validé.

### Ajouté

- Application Electron + React + TypeScript, interface française, thèmes clair/sombre/système.
- Moteur HTTP/HTTPS isolé dans un `utilityProcess` :
  - analyse HEAD/Range, redirections, proxy système/direct/manuel ;
  - téléchargement segmenté (1–16 connexions), reprise, repli séquentiel ;
  - flux sans `Content-Length`, calcul SHA-256, limites de débit ;
  - pause, reprise, annulation, nouvelle tentative, priorités.
- Persistance SQLite via `node:sqlite` : tâches, segments, files, planifications, catégories, réglages,
  historique.
- Files d'attente avec concurrence propre ; le démarrage d'une file relance ses tâches suspendues ou
  échouées.
- Planificateur local : une fois, quotidien, intervalle, fenêtre horaire ; actif uniquement lorsque
  l'application tourne.
- Catégories intégrées et personnalisées par extension et domaine.
- Interface complète : table virtualisée, recherche, tri, panneau de propriétés, dialogues d'ajout,
  files, planificateur, catégories, historique, paramètres, diagnostic.
- Pont navigateur local authentifié (jeton 256 bits, contrôle d'origine, 60 req/min) et extensions
  Chrome/Edge et Firefox MV3.
- Intégration système : instance unique, zone de notification, menus, notifications, démarrage
  automatique, détection facultative du presse-papiers.
- Paquets Linux AppImage et `.deb`, installeur NSIS Windows produit sous Wine, icônes et ressources
  originales.
- Icône applicative originale au mot-symbole **NZix** sur tuile turquoise, générée par
  `scripts/generate-nzix-icon.py` ; les icônes des extensions restent gérées par
  `scripts/generate-icons.mjs`.
- Documentation : audit des références, comparaison technologique, décision, architecture, exigences,
  spécification d'interface, plan de test, construction, guide utilisateur, limites.
- Licence MIT incluse dans les paquets Linux (`resources/LICENSE`).

### Corrigé

- Les corps de réponse d'analyse ne provoquent plus d'erreurs `UND_ERR_ABORTED` non capturées ; la suite
  de tests se termine proprement.
- Les appels au presse-papiers Electron 45 utilisent l'API asynchrone.
- La configuration du pont est réappliquée à chaque changement de réglages, y compris pour l'arrêter.
- Les arguments de lancement ne sont traités qu'une fois, même après un redémarrage du moteur.
- Les dates « une fois » du planificateur sont converties entre ISO et heure locale.
- La limite de vitesse par tâche est reflétée dans le panneau de propriétés et prioritaire sur la limite
  globale par tâche.
- La reprise vérifie aussi `Last-Modified` en plus de la taille et de l'`ETag`.
- Les tâches en pause sont bien relancées au démarrage de leur file.
- Après un échec de contrôle SHA-256, le fichier temporaire est supprimé et une reprise retélécharge
  réellement le contenu au lieu de revalider le même fichier.
- Une réponse HEAD avec `Content-Length: 0` n'est plus prise pour un fichier vide : TDM interroge le
  contenu réel avec une requête `Range`.
- Retirer une tâche non terminée supprime désormais son fichier temporaire `.tdm-part` ; retirer une
  tâche terminée sans demande explicite conserve le fichier final.

### Vérifié

- `pnpm typecheck`, `pnpm build` : succès.
- `pnpm test` : 4 fichiers, 23 tests, code de sortie 0.
- E2E interface : ajout, analyse, pause à 983 040 / 4 194 815 octets, reprise, fin, SHA-256 identique,
  propriétés, changement de réglage persistant (`3 -> 4`).
- Pont : ping 200, sans jeton 401, mauvaise origine 403, téléchargement authentifié terminé, SHA-256
  identique.
- Extension Chrome/Chromium : service worker MV3 chargé, jeton enregistré, ping réussi, envoi d'un lien
  et téléchargement de 1 048 699 octets terminé, SHA-256 identique.
- Paquets : `dist/linux-unpacked/tdm` et AppImage démarrent, moteur prêt, SQLite 3.53.4, pont actif.
- Reconstruction de `dist/` : AppImage, `.deb` et installeur NSIS régénérés avec l'icône NZix ;
  contrôles `sha256sum -c dist/SHA256SUMS` et `7z t` de l'installeur réussis ; icônes NZix (16 à 256 px)
  présentes dans `TDM.exe` et dans l'installeur.

### Limites connues

- Windows : installeur NSIS produit sous Wine, **non installé et non exécuté sur Windows 10/11** ;
  extension Firefox non chargée ; installation `.deb` non testée sur système vierge.
- HTTP/HTTPS uniquement, pas de FTP, grabber, capture vidéo, NTLM/Kerberos.
- Planificateur inactif lorsque l'application est fermée.
- Pas de mise à jour automatique, de signature de code ni de télémétrie.

Voir [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) et [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).
