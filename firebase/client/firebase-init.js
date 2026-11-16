import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAClwRQe3g4Cg9CAsn28l_sAihwlMQtGUI",
  authDomain: "lumina-analytics.firebaseapp.com",
  projectId: "lumina-analytics",
  storageBucket: "lumina-analytics.appspot.com",
  messagingSenderId: "239329398532",
  appId: "1:239329398532:web:2f68b196df0c4e6400ca51",
  measurementId: "G-J7LLPRXLJH"
};

export const app = getApps().some(function (existingApp) { return existingApp.name === "[DEFAULT]"; })
  ? getApp()
  : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Initialisation Firestore avec persistance multi-onglets moderne (SDK 12.3.0)
// Résout l'avertissement de dépréciation de enableMultiTabIndexedDbPersistence()
function initialiserFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  } catch (error) {
    // Si déjà initialisé pour cette instance d'application
    return getFirestore(app);
  }
}

export const db = initialiserFirestore();
