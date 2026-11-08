# Messagerie Lumesys — notes techniques

## Fichiers
- `messagerie.html` : interface (accessible, mobile/desktop, retours de statut).
- `messagerie.css` : styles conservés (ciel/nature) + états désactivés/erreurs.
- `messagerie.js` : logique Firebase Auth + Firestore, temps réel, envoi atomique.

## Dépendances partagées
- Firebase initialisé via `../firebase-init.js` (projet `lumina-analytics`, SDK 12.3.0).
- Navigation depuis le site : `../index.html` remplace l’entrée Contact par Chat (`message/messagerie.html`).

## Firestore
Collections utilisées :
- `public_profiles/{email}` : profils publics (lecture pour utilisateurs authentifiés ; écriture par le propriétaire selon règles existantes).
- `chats/{chatId}` : conversation privée.
  - `participants: string[]` (2 e-mails, triés pour l’ID stable `emailA__emailB`).
  - `dernierMessage: string`
  - `createdAt`, `updatedAt`: `serverTimestamp()`
- `chats/{chatId}/messages/{messageId}` :
  - `senderId: string` (e-mail de l’utilisateur authentifié)
  - `text: string`
  - `createdAt: serverTimestamp()`

## Cause racine identifiée (envoi)
Les règles Firestore existantes pour `chats/{chatId}/messages` exigeaient `request.resource.data.expediteurId == request.auth.uid` et validaient `contenu`, alors que le client écrivait `senderId` (e-mail) et `text`. Résultat : `addDoc/set` message refusé (`permission-denied`) et/ou incohérence avec `batch`/mise à jour du chat. Correction : règles alignées sur le schéma réel (`senderId == currentEmail()`, `text`) + validation stricte des champs et participants ; client utilise `writeBatch` pour créer le message et mettre à jour `dernierMessage`/`updatedAt` atomiquement.

## Sécurité
- Accès messagerie réservé aux utilisateurs Firebase authentifiés.
- Lecture/écriture `chats` et `messages` limitée aux 2 participants.
- `senderId` doit correspondre à `request.auth.token.email`.
- Participants non modifiables après création ; mise à jour chat limitée à `dernierMessage`/`updatedAt`.
- Les autres collections du site conservent leurs règles existantes dans `../firestore.rules`.

## Déploiement requis (manuel si non fait)
Depuis la racine du projet Firebase ciblant `lumina-analytics` :
```powershell
firebase use lumina-analytics
firebase deploy --only firestore:rules
```
Ne pas déployer si le projet actif n’est pas `lumina-analytics` ou si d’autres règles doivent être fusionnées.
