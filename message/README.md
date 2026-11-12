# Messagerie Lumesys — Documentation technique et mise à jour

## Architecture et fonctionnement

### 1. Fichiers du module
- `messagerie.html` : Interface responsive avec navigation à trois volets (Tous les utilisateurs, Conversations récentes, Demandes de messages), modale pour le premier message et retours visuels.
- `messagerie.css` : Thème fidèle à l'identité Lumesys (ciel/nature), badges non lus et compteurs dynamiques, boutons d'action d'état et modale fluide.
- `messagerie.js` : Logique client Firebase Auth & Firestore v12.3.0, gestion d'état réactive, synchronisation des profils, écoute temps réel des demandes envoyées/reçues, envoi et pagination des messages.
- `../firebase-init.js` : Façade de compatibilité vers l'initialisation client rangée dans `../firebase/client/firebase-init.js`.
- `../firebase/firestore.rules` : Règles de sécurité Firestore pour les opérations de messagerie et les autres collections.

---

### 2. Collections Firestore

#### `public_profiles/{email}`
- Profils publics visibles par tous les utilisateurs connectés.
- Champs : `uid`, `email`, `prenom`, `nom`, `photo`, `ville`, `pays`, `updatedAt`.
- Permet de contacter n'importe quel utilisateur inscrit, même s'il est déconnecté depuis plusieurs jours.

#### `contact_requests/{requestId}`
- Demandes de discussion et d'ajout de contact.
- Champs :
  - `senderUid` : UID Firebase de l'expéditeur.
  - `senderEmail` : adresse e-mail normalisée en minuscules.
  - `senderName` : nom d'affichage de l'expéditeur.
  - `senderPhoto` : URL de la photo de l'expéditeur.
  - `recipientUid` : UID du destinataire (ou identifiant de profil).
  - `recipientEmail` : adresse e-mail normalisée en minuscules.
  - `recipientName` : nom d'affichage du destinataire.
  - `recipientPhoto` : photo du destinataire.
  - `status` : `'pending'` | `'accepted'` | `'declined'` | `'cancelled'`.
  - `initialMessage` : premier message d'introduction rédigé par l'expéditeur.
  - `createdAt`, `updatedAt` : `serverTimestamp()`.

#### `chats/{chatId}`
- Conversations privées actives.
- ID formaté : `email1__email2` (minuscules, triés par ordre alphabétique).
- Champs :
  - `participants` : `[emailA, emailB]` (compatibilité totale avec l'existant).
  - `participantUids` : `[uidA, uidB]` (sécurité basée sur l'UID Firebase Auth).
  - `dernierMessage` : dernier texte échangé.
  - `unreadCount` : map des compteurs non lus par participant.
  - `lastReadAt` : map des horodatages de lecture par participant.
  - `createdAt`, `updatedAt` : `serverTimestamp()`.

#### `chats/{chatId}/messages/{messageId}`
- Messages individuels de la conversation.
- Champs :
  - `senderId` : email de l'expéditeur.
  - `senderUid` : UID de l'expéditeur.
  - `text` : contenu du message (1 à 5000 caractères).
  - `createdAt` : `serverTimestamp()`.

---

### 3. Matrice d'état des boutons d'ajout sur les profils

| Situation | Affichage du bouton | Comportement |
|---|---|---|
| Aucun contact ni demande (ou annulée) | `+ Ajouter` | Ouvre la modale pour rédiger le premier message et envoyer la demande |
| Demande envoyée par moi (en attente) | `Annuler` | Permet à l'expéditeur d'annuler sa demande. Fait disparaître la demande chez le destinataire et réinitialise le bouton à `+ Ajouter` |
| Demande reçue par moi | `Accepter / Refuser` | Redirige ou propose l'acceptation / le refus |
| Demande acceptée | `Message` | Ouvre directement la conversation active |
| Demande refusée | `Refusée` | Affiche l'état refusé |
| Contact / conversation existante | `Message` | Ouvre la conversation active |
| Mon propre profil | Aucun bouton | Masqué automatiquement |

---

### 4. Résolution de l'erreur 403 `permission-denied` sur `chats/{chatId}`

Causes identifiées :
1. **Évaluation sur document inexistant** : dans `firestore.rules`, la règle `allow get: if isChatParticipant()` accédait à `resource.data.participantUids` sans vérifier si `resource == null`. Lors de l'ouverture d'un chat non encore créé, Firestore retournait 403 au lieu de permettre le test d'existence.
   -> **Correction** : `allow get: if isSignedIn() && (resource == null || isChatParticipant(resource.data));`
2. **Exigence stricte de `participantUids` à la création** : l'ancienne règle rejetait toute création omettant `participantUids`, alors que l'ancien code ne passait que `participants`.
   -> **Correction** : Le client transmet désormais `participants` ET `participantUids`, et les règles autorisent la création avec ces deux listes vérifiées.
3. **Casse des e-mails** : Normalisation systématique en minuscules côté client et prise en compte de `.lower()` dans les règles de sécurité.

---

### 5. Maintien strict du forfait gratuit Firebase Spark (0 € / sans Blaze)

- **Cause du message Blaze** : Firebase CLI déclenche une demande de passage à Blaze dès qu'on tente de déployer des Cloud Functions (`functions/index.js`), car Google Cloud Build exige un compte de facturation pour compiler les conteneurs de fonctions.
- **Le frontend n'utilise AUCUNE Cloud Function** : L'authentification, Firestore, la messagerie, la gestion des contacts et Firebase Storage fonctionnent 100 % côté client avec le SDK Firebase officiel.
- **Ressources 100 % gratuites sur Spark** :
  - Authentification : jusqu'à 50 000 utilisateurs actifs par mois gratuits.
  - Firestore : 1 Go de données, 50 000 lectures/jour, 20 000 écritures/jour gratuites.
  - Storage : 5 Go de stockage, 1 Go/jour de téléchargement gratuits.
- **Déploiement sans Functions** :
  Depuis la racine du dépôt, ne déployer que les règles et index si le forfait
  ne permet pas Cloud Functions :
  ```powershell
  firebase --config firebase/firebase.json --project lumina-analytics deploy --only firestore:rules,firestore:indexes,storage:rules
  ```
  Les besoins de facturation dépendent du projet Firebase et des services
  sélectionnés; vérifier le plan avant tout déploiement de Functions.
