# Information feed backend

The scheduled `collectInformation` function runs every eight minutes in
`lumina-analytics`. It reads RSS feeds on the server, stores articles and source
metadata with Firebase Admin, prioritizes articles that have not been featured
recently, and publishes the selected document IDs in `info_feed_state/current`.
Its Firestore writes bypass client security rules; browser clients can only read
the published feed state and article/source data. The `info_articles` composite
index on `lastPromotedAt` and `publishedAt` supports the rotating selection.

Deploy with Firebase CLI after installing this package and confirming the
project's billing, Cloud Scheduler, and Cloud Build requirements:

```powershell
cd firebase/functions
npm install
cd ../..
firebase --config firebase/firebase.json --project lumina-analytics deploy --only functions:collectInformation,firestore:rules,firestore:indexes,storage:rules
```

The function is not operational until that deployment succeeds and a scheduled
execution is visible in Cloud Scheduler and the function logs.
