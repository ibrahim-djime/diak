console.log("Le fichier JavaScript est bien chargé");
document.addEventListener("DOMContentLoaded", function () {
    console.log("Le fichier JavaScript est bien chargé");
    const shareButton = document.getElementById("share-button");

    if (shareButton) {
        shareButton.addEventListener("click", async function () {
            const siteURL = "https://ibrahim-djime.github.io/diak/Ibra.html";

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: "Découvrez ce site",
                        text: "Visitez ce site incroyable !",
                        url: siteURL,
                    });
                    console.log("Lien partagé avec succès !");
                } catch (error) {
                    console.error("Le partage a échoué : ", error);
                }
            } else {
                navigator.clipboard.writeText(siteURL).then(() => {
                    alert("Le lien du site a été copié dans le presse-papier !");
                }).catch((error) => {
                    console.error("Erreur lors de la copie : ", error);
                });
            }
        });
    } else {
        console.error("Le bouton avec l'ID 'share-button' n'existe pas !");
    }
});

document.querySelectorAll('.share-section').forEach(button => {
  button.addEventListener('click', async () => {
    const url = button.dataset.url;
    const title = button.dataset.title;

    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          url: url
        });
        alert('Section partagée avec succès !');
      } catch (error) {
        console.error('Partage échoué :', error);
      }
    } else {
      alert('Le partage n’est pas supporté sur ce navigateur.');
    }
  });
});
