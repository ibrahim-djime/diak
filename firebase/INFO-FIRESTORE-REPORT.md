# Rapport de diagnostic — section Information / Firestore

## Résumé

Le code source local ne permet pas de confirmer la requête qui a produit
`Missing or insufficient permissions` dans le projet Firebase en production.
Les règles locales autorisent les lectures du flux; leur état déployé n'est pas
accessible depuis cet environnement. Le premier accès effectué pendant
l'initialisation est `getDoc(info_feed_state/current)`. Si la règle de cette
collection manque dans la version publiée, c'est la première requête à refuser.
Le nouveau diagnostic de `info-firestore.mjs` nomme chaque lecture refusée dans
la console.

Deux défauts indépendants ont toutefois été corrigés dans le code : la
pagination pouvait sauter des documents lorsqu'une page était complétée par
des articles mis en avant, et la sélection planifiée ne re-promouvait jamais
les articles déjà promus. Aucun résultat de test simulé n'est présenté comme
une validation des données Firestore réelles.

## Chaîne d'exécution et opérations Firestore

- `index.html` importe `info-firestore.mjs` et appelle
  `window.InfoFirestore.beginFeedSession()` à l'ouverture, puis
  `loadMoreInfoArticles()` depuis « Voir plus ».
- `info-firestore.mjs` partage `db` et `auth` importés de `firebase-init.js`.
- Les lectures de flux sont, dans l'ordre :
  1. `getDoc(info_feed_state/current)`;
  2. un `getDoc(info_articles/{id})` pour chaque identifiant mis en avant;
  3. lors des pages suivantes, `getDocs` sur `info_articles`, triée par
     `publishedAt` décroissant et paginée par curseur.
- Aucune lecture de `info_analytics` n'est appelée par ce chemin. Les
  écritures dans `info_visitor_events` ne sont tentées que pour un utilisateur
  authentifié non anonyme via le module Firestore.
- Les lectures de profil et les écritures de profil/session/événement déclarées
  dans `index.html` sont distinctes du chargement des cartes.

Les règles locales de `firestore.rules` autorisent les lectures publiques de
`info_articles` et `info_feed_state`. Dans ces règles, ces lectures ne devraient
donc pas produire le refus signalé. Il reste à comparer les règles effectivement
publiées. Un document d'état absent déclencherait l'erreur applicative
« flux Information n'a pas encore été initialisé », et non, à lui seul,
`Missing or insufficient permissions`.

## Configuration et backend

- `client/firebase-init.js` utilise Firebase SDK `12.3.0`, le projet
  `lumina-analytics` et `getFirestore(app)` (base par défaut). Le module
  Information réutilise cette même initialisation.
- `.firebaserc` sélectionne également `lumina-analytics`.
- Le backend configuré par `firebase.json` est `functions/`. Sa fonction
  `collectInformation` est déclarée à intervalle de huit minutes et écrit avec
  Firebase Admin dans `info_articles`, `info_sources`,
  `info_feed_state/current` et les collections de statistiques.
- `backend/info_collector.py` n'est pas la source Functions indiquée par
  `firebase.json`. La présence du code planifié ne prouve pas qu'il a été
  déployé ni qu'il s'exécute actuellement.
- Collections réellement référencées dans le code actif :
  - navigateur : `info_feed_state`, `info_articles`,
    `info_visitor_profiles`, `info_visitor_sessions` et
    `info_visitor_events`;
  - fonction planifiée : `info_scheduler_locks`, `info_articles`,
    `info_sources`, `info_feed_state`, `info_article_stats` et
    `info_topic_stats`;
  - `info_analytics` n'a aucune lecture/écriture directe dans le flux actif.
    Les métadonnées `info_visitor_events` sont une collection distincte.
- Le Service Worker cache les ressources de même origine en mode
  cache-then-refresh. Le cache a été versionné de `v7` à `v8` pour invalider
  une copie antérieure du module. Le message « Mise à jour impossible hors
  connexion » est émis quand la mise à jour en arrière-plan échoue; cela ne
  démontre pas une erreur de permissions Firestore.

## Corrections effectuées

- `info-firestore.mjs` nomme désormais l'opération et le chemin en cas d'échec
  d'une lecture. Les erreurs ne sont pas transformées en tableau vide.
- La pagination conserve le dernier document effectivement consommé comme
  curseur et lit un document de marge. Elle ne saute donc pas les documents
  non consommés lorsque des articles mis en avant complètent la page.
- `index.html` vérifie la forme `articles`/`hasMore` et masque le bouton quand
  le module confirme la fin de l'archive.
- `functions/index.js` sélectionne maintenant les articles les moins récemment
  mis en avant, au lieu de sélectionner uniquement ceux dont
  `promotionCount` vaut zéro. L'index composite correspondant a été ajouté à
  `firestore.indexes.json`.
- `firestore.rules` interdit maintenant la lecture navigateur de
  `info_analytics` et exige le propriétaire existant lors d'une mise à jour de
  session, en plus du propriétaire demandé dans les nouvelles données.
- `functions/README.md` décrit la rotation et l'index requis.

Les changements aux règles, à l'index et à la fonction ne sont pas déployés.
Si les règles publiées ne comportent pas déjà la lecture publique de
`info_feed_state`, le correctif minimal est de publier la règle locale
correspondante `allow get, list: if true` pour cette seule collection, sans
ouvrir les écritures ni les collections privées.

## Vérifications

| Vérification | Résultat |
|---|---|
| Syntaxe de `info-firestore.mjs` | Réussie (`node --check`) |
| Syntaxe de `functions/index.js` | Réussie (`npm run check`) |
| Suite backend disponible | Réussie : 2 tests, 0 échec; tests de normalisation URL/ID, pas tests Firestore |
| JSON de `firestore.indexes.json` | Valide |
| Exécution réelle contre Firestore | Non effectuée : pas d'accès à la console, aux données ni de preuve de déploiement |
| Nombre réel de documents `info_articles` | Non vérifié |
| Pages 30/60/90/120 et absence de doublons sur données réelles | Non vérifiées |
| Lectures avec utilisateur authentifié/non authentifié, quota et écritures | Non vérifiées |
| Exécution planifiée toutes les huit minutes | Non vérifiée; le code est déclaré, les journaux Cloud Scheduler/Functions ne sont pas disponibles |
| Chats et autres fonctions du site | Pas de test de régression navigateur effectué |

## Actions nécessaires pour terminer la validation en production

1. Déployer l'index, les règles et la fonction planifiée, puis attendre la
   construction de l'index.
2. Vérifier dans Cloud Scheduler et les journaux Functions qu'une exécution
   réussit et crée/met à jour `info_feed_state/current`.
3. Recharger la page après activation du Service Worker `v8`; si le refus
   persiste, relever l'opération précise affichée par `[InfoFirestore]` dans
   la console et comparer la règle publiée pour cette collection.
4. Tester les pages successives et le quota avec de vrais comptes de test, puis
   relever le nombre et la structure des documents directement dans Firestore.

**État final :** corrections locales effectuées; origine de l'erreur de
permissions en production, fonctionnement effectif de la collecte et données
réelles non vérifiés. Le problème ne peut pas être déclaré résolu avant ces
tests en production.
