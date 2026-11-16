# Migration des profils privés

Le script `migrate-private-profiles.js` transfère les numéros et localisations
existants vers `private_profiles/{uid}` puis retire ces champs des documents
publics et des documents `utilisateurs`. Il conserve les numéros non normalisés
comme candidats privés afin que l'utilisateur puisse les confirmer à sa prochaine
connexion. Les localisations historiques sont conservées en privé et désactivées
pour le partage public.

Toutes les exécutions nécessitent un compte de service Firebase Admin autorisé
sur `lumina-analytics`. Garder son fichier de credentials hors du dépôt et le
configurer avant le lancement :

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\chemin\securise\firebase-admin.json"
```

Depuis la racine du projet, commencer par une simulation sans écriture :

```powershell
npm --prefix firebase/functions run migrate:private-profiles
```

Pour appliquer les changements, ajouter la variable de confirmation :

```powershell
$env:CONFIRM_PRIVATE_PROFILE_MIGRATION = "lumina-analytics"
npm --prefix firebase/functions run migrate:private-profiles -- --apply
```

Le script refuse l'écriture sans la variable de confirmation. Les profils dont
L'adresse e-mail ne correspond à aucun utilisateur Firebase Authentication
ainsi que ceux qui contiennent plus de cinq numéros distincts sont signalés
comme ignorés et ne sont pas modifiés, afin de ne pas choisir arbitrairement
une identité ou un numéro.
