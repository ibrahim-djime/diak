document.addEventListener("DOMContentLoaded", async () => {

  console.log("=== Script Firebase Fusionné démarré ===");

  /* =========================
     IMPORTS FIREBASE
  ========================= */
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js");

  const {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
  } = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js");

  const {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    deleteField
  } = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js");
  const { ensurePrivateProfile } = await import("./profile-onboarding.js");

  /* =========================
     FIREBASE INIT
  ========================= */
  async function signInSmart(auth, provider) {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.warn("Popup bloquée ou refusée, redirection vers login.html", error.code);
    window.location.href = "/login.html";
  }
}

  const firebaseConfig = {
    apiKey: "AIzaSyAClwRQe3g4Cg9CAsn28l_sAihwlMQtGUI",
    authDomain: "lumina-analytics.firebaseapp.com",
    projectId: "lumina-analytics",
    storageBucket: "lumina-analytics.appspot.com",
    messagingSenderId: "239329398532",
    appId: "1:239329398532:web:2f68b196df0c4e6400ca51"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  const db = getFirestore(app);

  console.log("Firebase initialisé");

  /* =========================
     LIMITES VISITES / DOWNLOADS
  ========================= */
  const pageKey = "visites_" + window.location.pathname;
  const MAX_VISITES = 2;
  let visites = parseInt(localStorage.getItem(pageKey)) || 0;
  visites++;
  localStorage.setItem(pageKey, visites);

  const downloadKey = "telechargements_gratuits";
  const MAX_DOWNLOADS = 3;
  let downloads = parseInt(localStorage.getItem(downloadKey)) || 0;

  /* =========================
     OVERLAY BLOCAGE
  ========================= */
  function showOverlay() {
    if (document.getElementById("overlayConnexion")) return;

    const overlay = document.createElement("div");
    overlay.id = "overlayConnexion";
    overlay.style.cssText = `
      position:fixed; inset:0;
      background:rgba(0,0,0,.85);
      display:flex; flex-direction:column;
      justify-content:center; align-items:center;
      color:white; z-index:9999;
    `;

    overlay.innerHTML = `
      <h2>Connexion requise</h2>
      <p>Limite atteinte. Veuillez vous connecter.</p>
      <button id="loginBtnOverlay">Connexion Google</button>
      <button id="quitBtnOverlay">Quitter</button>
    `;

    document.body.appendChild(overlay);

    document.getElementById("loginBtnOverlay").onclick = () => {
        signInSmart(auth, provider);
    };


    document.getElementById("quitBtnOverlay").onclick =
      () => window.location.href = "https://www.google.com";
  }

  function removeOverlay() {
    document.getElementById("overlayConnexion")?.remove();
  }

  /* =========================
     BLOQUER TÉLÉCHARGEMENTS
  ========================= */
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.addEventListener("click", (e) => {
      if (!auth.currentUser && downloads >= MAX_DOWNLOADS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showOverlay();
        return false;
      } else {
        downloads++;
        localStorage.setItem(downloadKey, downloads);
      }
    });
  });

  /* =========================
     DOM PROFIL
  ========================= */
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const profilNom = document.getElementById("profilNom");
  const profilSexe = document.getElementById("profilSexe");
  const profilVille = document.getElementById("profilVille");
  const profilRegion = document.getElementById("profilRegion");
  const profilPays = document.getElementById("profilPays");
  const profilTelephone = document.getElementById("profilTelephone");
  const profilPhoto = document.getElementById("profilPhoto");

  function afficherProfil(data, user) {
  if (!profilNom) return;

  profilNom.textContent =
    (data.nom || user.displayName)
      ? `Nom : ${data.nom || user.displayName}`
      : "";

  profilSexe.textContent =
    data.sexe ? `Sexe : ${data.sexe}` : "";

  profilVille.textContent =
    data.localisation?.ville ? `Ville : ${data.localisation.ville}` : "";

  profilRegion.textContent =
    data.localisation?.region ? `Région : ${data.localisation.region}` : "";

  profilPays.textContent =
    data.localisation?.pays ? `Pays : ${data.localisation.pays}` : "";

  profilTelephone.textContent = "";

  profilPhoto.src = data.photo || user.photoURL || "";
 }


  function viderProfil() {
    if (!profilNom) return;
    profilNom.textContent = "";
    profilSexe.textContent = "";
    profilVille.textContent = "";
    profilRegion.textContent = "";
    profilPays.textContent = "";
    profilTelephone.textContent = "";
    profilPhoto.src = "";
  }

  /* =========================
     AUTH PRINCIPALE
  ========================= */
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
      removeOverlay();

      const email = String(user.email).toLowerCase();
      const ref = doc(db, "utilisateurs", email);
      const publicRef = doc(db, "public_profiles", email);
      const [snap, publicSnap] = await Promise.all([getDoc(ref), getDoc(publicRef)]);
      const privateProfile = await ensurePrivateProfile({
        user,
        db,
        userData: snap.exists() ? snap.data() : {},
        publicData: publicSnap.exists() ? publicSnap.data() : {}
      });
      const loc = {
        pays: privateProfile.locationCountry || "",
        ville: privateProfile.locationCity || "",
        region: privateProfile.locationRegion || ""
      };

      let data = {
        nom: user.displayName,
        email: user.email,
        photo: (publicSnap.exists() && publicSnap.data().photo) || user.photoURL,
        nombreConnexions: 1,
        badge: "Nouveau"
      };

      if (snap.exists()) {
        data = { ...snap.data(), ...data };
        data.nombreConnexions++;
        if (data.nombreConnexions >= 50) data.badge = "Contributeur";
        else if (data.nombreConnexions >= 10) data.badge = "Fidèle";
      }

      const profileData = {
        ...data,
        sexe: privateProfile.sexe || "",
        localisation: loc
      };
      delete data.numero;
      delete data.telephone;
      delete data.localisation;
      delete data.sexe;

      await setDoc(ref, {
        ...data,
        numero: deleteField(),
        telephone: deleteField(),
        localisation: deleteField(),
        sexe: deleteField(),
        derniereConnexion: serverTimestamp()
      }, { merge: true });

      await setDoc(publicRef, {
        uid: user.uid,
        email,
        prenom: data.nom ? String(data.nom).split(" ")[0] : "",
        nom: data.nom || "",
        sexe: deleteField(),
        ville: loc.ville,
        region: loc.region,
        pays: loc.pays,
        photo: profileData.photo || "",
        telephone: deleteField(),
        numero: deleteField(),
        latitude: deleteField(),
        longitude: deleteField(),
        localisation: deleteField(),
        ip: deleteField(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      afficherProfil(profileData, user);

    } else {
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
      viderProfil();

      if (visites > MAX_VISITES || downloads >= MAX_DOWNLOADS) {
        showOverlay();
      }
    }
  });
  
  loginBtn.onclick = () => signInSmart(auth, provider);
  logoutBtn.onclick = () => signOut(auth);

  console.log("=== Script fusionné prêt ===");

});

