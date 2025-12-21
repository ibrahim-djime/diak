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
    serverTimestamp
  } = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js");

  /* =========================
     FIREBASE INIT
  ========================= */
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

    document.getElementById("loginBtnOverlay").onclick =
      () => signInWithPopup(auth, provider);

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
        showOverlay();
      } else {
        downloads++;
        localStorage.setItem(downloadKey, downloads);
      }
    });
  });

  /* =========================
     GEOLOCALISATION IP
  ========================= */
  async function getUserLocation() {
    try {
      const r = await fetch("https://ipapi.co/json/");
      const d = await r.json();
      return {
        pays: d.country_name,
        ville: d.city,
        region: d.region,
        ip: d.ip
      };
    } catch {
      return { pays: "Inconnu", ville: "Inconnue", region: "Inconnue", ip: "Inconnue" };
    }
  }

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

  profilTelephone.textContent =
    data.numero ? `Téléphone : ${data.numero}` : "";

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
     FORM PROFIL OBLIGATOIRE
  ========================= */
  function demandeInfosProfil(ref, user) {
    if (document.getElementById("formProfil")) return;

    const div = document.createElement("div");
    div.id = "formProfil";
    div.style.cssText = `
      position:fixed; inset:0;
      background:rgba(0,0,0,.85);
      display:flex; justify-content:center; align-items:center;
      z-index:9999; color:white;
    `;

    div.innerHTML = `
      <div style="background:#111;padding:20px;border-radius:8px;">
        <h2>Compléter votre profil</h2>
        <input id="numeroUser" placeholder="Numéro (+223)">
        <select id="sexeUser">
          <option value="">Sexe</option>
          <option value="Homme">Homme</option>
          <option value="Femme">Femme</option>
        </select>
        <button id="validerProfil">Valider</button>
      </div>
    `;

    document.body.appendChild(div);

    document.getElementById("validerProfil").onclick = async () => {
      const numero = numeroUser.value.trim();
      const sexe = sexeUser.value.trim();
      if (!numero || !sexe) return alert("Champs requis");

      await setDoc(ref, { numero, sexe }, { merge: true });
      const snap = await getDoc(ref);
      afficherProfil(snap.data(), user);
      div.remove();
    };
  }

  /* =========================
     AUTH PRINCIPALE
  ========================= */
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      loginBtn.style.display = "none";
      logoutBtn.style.display = "inline-block";
      removeOverlay();

      const ref = doc(db, "utilisateurs", user.email);
      const snap = await getDoc(ref);
      const loc = await getUserLocation();

      let data = {
        nom: user.displayName,
        email: user.email,
        photo: user.photoURL,
        nombreConnexions: 1,
        badge: "Nouveau",
        localisation: loc
      };

      if (snap.exists()) {
        data = { ...snap.data(), ...data };
        data.nombreConnexions++;
        if (data.nombreConnexions >= 50) data.badge = "Contributeur";
        else if (data.nombreConnexions >= 10) data.badge = "Fidèle";
      }

      await setDoc(ref, {
        ...data,
        derniereConnexion: serverTimestamp()
      }, { merge: true });

      afficherProfil(data, user);

      if (!data.numero || !data.sexe) {
        demandeInfosProfil(ref, user);
      }

    } else {
      loginBtn.style.display = "inline-block";
      logoutBtn.style.display = "none";
      viderProfil();

      if (visites > MAX_VISITES || downloads >= MAX_DOWNLOADS) {
        showOverlay();
      }
    }
  });

  loginBtn.onclick = () => signInWithPopup(auth, provider);
  logoutBtn.onclick = () => signOut(auth);

  console.log("=== Script fusionné prêt ===");

});
