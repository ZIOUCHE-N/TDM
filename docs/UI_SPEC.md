# Spécification d'interface — TDM 0.1.0

Interface en français, une seule fenêtre, densité « bureau ». L'objectif est de rendre l'état réel du
moteur lisible sans masquer les erreurs ni proposer d'action factice.

## 1. Structure générale

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Barre latérale │ Barre d'outils (titre, recherche, actions, état services) │
│ 264 px         ├──────────────────────────────────────────────────────────┤
│                │ Tableau des téléchargements          │ Propriétés 378 px │
│                │                                      │ (si sélection)    │
│                ├──────────────────────────────────────────────────────────┤
│                │ Barre d'état : moteur · SQLite · débit · pont · version  │
└──────────────────────────────────────────────────────────────────────────┘
```

- Largeur de fenêtre par défaut : 1360 × 840, minimale 1020 × 620 (voir `src/main/index.ts`).
- Tableau virtualisé : seules les lignes visibles sont rendues.
- Le panneau de propriétés remplace une partie de la largeur du tableau ; il se ferme par sa croix ou
  en désélectionnant la ligne.
- Aucune fenêtre secondaire : les dialogues sont des modales dans la fenêtre principale.

## 2. Identité visuelle

- Marque d'interface : nom « TDM », flèche de téléchargement vers un plateau. L'icône applicative
  utilise le mot-symbole **NZix** sur une tuile turquoise arrondie. Aucune reprise d'icône ou de skin
  tiers.
- Accent principal : turquoise (`#46d3b4` sombre, `#0e9f83` clair).
- Thèmes sombre (par défaut), clair et « système » (suit l'OS).
- Polices : Inter si présente, sinon Segoe UI, Ubuntu, Cantarell, Noto Sans, système.
- Rayons 8/12 px, ombres réservées aux modales et éléments flottants.
- Les couleurs d'état ne sont jamais le seul indicateur : chaque badge possède un libellé.

## 3. Barre latérale

Groupes, dans l'ordre :

1. **Tous les téléchargements**, **En cours**, **Terminés**, **Suspendus**, **Échecs** — avec compteurs.
2. **Catégories** + lien **Gérer** : une entrée par catégorie (intégrée ou personnalisée).
3. **Files d'attente** + lien **Gérer** : nom, compteur, pastille d'état et bouton démarrer/arrêter.
4. Pied : **Planificateur**, **Historique**, **Paramètres**.

L'entrée active est signalée par un fond accentué et un trait latéral. Les compteurs reflètent l'état
courant, pas une valeur décorative.

## 4. Barre d'outils

| Élément | Comportement |
| --- | --- |
| Titre + sous-titre | Vue courante et nombre de téléchargements. |
| Recherche | Filtre sur nom de fichier, URL et hôte. |
| **Nouveau** | Ouvre le dialogue d'ajout. |
| **Tout démarrer** | Reprend toutes les tâches suspendues/échouées. |
| **Tout suspendre** | Suspend les téléchargements actifs. |
| Vider les terminés | Retire de la liste les tâches terminées, échouées, annulées ou en attention ; les fichiers terminés restent sur le disque. |
| Rafraîchir | Recharge tâches, files, catégories, réglages et statistiques. |
| Paramètres | Ouvre les réglages. |
| Voyants | Pont actif/arrêté (port en infobulle), nombre de transferts actifs. |

## 5. Tableau des téléchargements

Colonnes : **Fichier** (nom + hôte + état), **État**, **Taille**, **Progression**, **Vitesse**,
**Restant**, **Actions**.

- Tri par clic sur Fichier, État, Taille ou Vitesse ; l'indicateur indique le sens.
- Sélection d'une ligne : ouvre le panneau de propriétés.
- Double-clic sur une ligne terminée : ouvre le fichier.
- Actions par ligne, selon l'état :
  - en cours : suspendre, annuler, ouvrir le dossier, retirer ;
  - suspendu/échoué/attention : reprendre, annuler, ouvrir le dossier, retirer ;
  - terminé : ouvrir le dossier, retirer (le double-clic ouvre le fichier).
- Badges : En attente, Analyse, Téléchargement, Suspendu, Terminé, Échec, Attention, Annulé.
- En cas d'erreur, le message est affiché sous le nom et en infobulle du badge.
- La progression inconnue est affichée comme telle (pas de fausse barre à 0 %).

### États vides

- Aucun téléchargement : illustration discrète, texte explicatif, bouton **Nouveau téléchargement**.
- Filtre sans résultat : message adapté et action de réinitialisation.

## 6. Panneau de propriétés

En-tête : nom, hôte, badge d'état, actions principales. Sections :

1. **Avancement** : pourcentage, octets reçus/total, vitesse, reste, connexions actives.
2. **Réglages de la tâche** : file d'attente, priorité (-10 à 10), connexions (1–16), limite Kio/s
   (0 = limite globale), description. Les modifications sont envoyées par `tasks.update`.
3. **Détails** : dossier, fichier final, catégorie, file, URL (copier/ouvrir), dates, type MIME, taille,
   SHA-256 attendu et calculé.
4. **Actions** : reprendre/suspendre, annuler, ouvrir, dossier, retirer (avec ou sans fichier).

## 7. Dialogues

### Nouveau téléchargement

Champs : URL, nom du fichier, dossier, catégorie, file, connexions, SHA-256 attendu, description,
case **Démarrer immédiatement**. Le bouton **Analyser** interroge réellement le serveur et affiche
taille, type, reprise possible et redirections. **Télécharger** reste disponible pour une URL HTTP/HTTPS
valide : le moteur refait sa propre analyse à l'ajout. Les erreurs d'analyse sont explicites (DNS, TLS,
HTTP, délai).

### Files d'attente

Création (nom, simultanés), renommage, modification de la concurrence, démarrage/arrêt, suppression avec
confirmation. Une file supprimée ne supprime pas les fichiers ; ses tâches sont détachées.

### Planificateur

Liste des planifications avec état, prochaine exécution, action et file. Formulaire : mode (une fois,
quotidien, intervalle), date/heure locale, heure d'arrêt, jours, intervalle, action
(démarrer/arrêter une file ou tout), activation. Les dates sont converties entre ISO et heure locale.

### Catégories

Liste des catégories avec extensions et domaines. Création/modification/suppression ; les catégories
intégrées sont identifiables. Le dossier est résolu sous le dossier de téléchargement par défaut.

### Historique

Événements récents (ajout, démarrage, fin, pause, annulation, échec, retrait, démarrage/arrêt de file) avec date, type et détails. Les actions du planificateur sont journalisées dans `tdm.log`, pas dans cet historique.
Limite d'affichage et purge selon la rétention configurée.

### Paramètres

Onglets : **Général**, **Téléchargements**, **Réseau**, **Navigateur**, **Données & sécurité**.

- Général : thème, journalisation, rétention, démarrage auto, réduction dans la zone de notification,
  confirmation de suppression, notifications, surveillance du presse-papiers.
- Téléchargements : dossier par défaut, simultanés, connexions, seuil de segmentation, tentatives,
  limites globale et par tâche.
- Réseau : mode proxy (système/direct/manuel), URL, domaines sans proxy, User-Agent.
- Navigateur : activation du pont, port, jeton (copier), test de connexion, dossier des extensions.
- Données & sécurité : chemins, version de SQLite, diagnostic, ouverture des journaux.

**Enregistrer** applique immédiatement et ferme la modale ; **Annuler** abandonne le brouillon.

### Diagnostic

Affiche version, protocole, SQLite, plateforme, date et durée de service, chemins de la base et des
téléchargements, compteurs de tâches, débit agrégé et octets reçus. Permet de copier le rapport JSON.
Le pont et les dernières erreurs ne figurent pas dans ce rapport ; ils sont visibles dans la barre
d'état et les journaux.

### Limites de cette version

Liste honnête des fonctions absentes (FTP, capture vidéo, grabber, planificateur hors application,
validation Windows) accessible depuis **Aide**.

## 8. Barre d'état

État du moteur (démarrage, prêt, erreur), version SQLite, débit global, nombre actif/en attente,
voyant et port du pont, accès aux journaux, version de l'application.

## 9. Notifications et retours

- Toasts en bas à droite : succès, erreur, information ; fermables.
- Notifications système pour la fin ou l'échec d'un téléchargement (si activées).
- Bandeau persistant si le moteur est en erreur, avec bouton **Réessayer**.
- Aucune alerte bloquante pour un simple échec de téléchargement : l'erreur reste dans la ligne et le
  panneau de propriétés.

## 10. Clavier et accessibilité

| Raccourci | Action |
| --- | --- |
| `Ctrl/Cmd+N` | Nouveau téléchargement |
| `Ctrl/Cmd+,` | Paramètres |
| `Ctrl/Cmd+Shift+S` | Tout démarrer |
| `Ctrl/Cmd+Shift+P` | Tout suspendre |
| `Échap` | Fermer la modale active |
| `Entrée` | Valider le dialogue actif |

- Rôles ARIA sur la navigation, le tableau, les onglets, les modales et les boutons icône.
- Chaque bouton icône possède un `aria-label` explicite.
- Focus visible sur les champs et boutons ; navigation clavier dans les modales.
- Contrastes élevés choisis pour les deux thèmes ; aucun audit formel de contraste n'a été exécuté.
- Les animations restent discrètes ; aucune information n'est transmise uniquement par une animation.

## 11. Contraintes de confiance

- Aucun bouton ne déclenche une action simulée ou un simple changement visuel local non persisté.
- Toute action passant par le moteur affiche l'erreur réelle en cas d'échec.
- Les valeurs affichées (vitesse, reste, octets) proviennent des événements du moteur, jamais d'une
  animation locale.
