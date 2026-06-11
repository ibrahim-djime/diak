const buttons = document.querySelectorAll('.tab-btn');
const contents = document.querySelectorAll('.tab-content');
const heroButtons = document.querySelectorAll('[data-tab]');

let currentTab = "accueil"; // 🔥 état global

// =========================
// ACTIVER UN ONGLET
// =========================
function activateTab(target, pushState = true) {

    // 🔥 éviter les actions inutiles (corrige le double clic)
    if (target === currentTab) return;

    currentTab = target;

    // reset UI
    buttons.forEach(btn => btn.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));

    // activer section
    const targetSection = document.getElementById(target);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // activer bouton menu
    const activeButton = document.querySelector(`.tab-btn[data-tab="${target}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // gérer l'historique navigateur
    if (pushState) {
        history.pushState({ tab: target }, "", `#${target}`);
    }
}

// =========================
// MENU NAVIGATION
// =========================
buttons.forEach(button => {
    button.addEventListener('click', () => {
        const target = button.getAttribute('data-tab');
        activateTab(target);
    });
});

// =========================
// HERO BUTTONS
// =========================
heroButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        e.preventDefault();
        const target = button.getAttribute('data-tab');
        activateTab(target);
    });
});

// =========================
// BOUTON RETOUR / AVANCE
// =========================
window.addEventListener('popstate', (event) => {
    const tab = event.state?.tab || "accueil";
    activateTab(tab, false);
    currentTab = tab; // 🔥 synchronisation état
});

// =========================
// INITIALISATION (URL hash)
// =========================
window.addEventListener("DOMContentLoaded", () => {
    const hash = window.location.hash.replace("#", "");
    const initialTab = hash || "accueil";

    activateTab(initialTab, false);
    currentTab = initialTab;
});

// =========================
// SLIDER
// =========================
const slides = document.querySelectorAll('.slide');
let currentSlide = 0;

function showSlide(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    slides[index].classList.add('active');
}

function nextSlide() {
    currentSlide++;
    if (currentSlide >= slides.length) {
        currentSlide = 0;
    }
    showSlide(currentSlide);
}

setInterval(nextSlide, 4000);


const filterButtons = document.querySelectorAll(".filter-btn");
const cards = document.querySelectorAll(".card");

let currentLevel = "all";
let currentFunding = "all-f";

filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {

        const filter = btn.dataset.filter;

        // détecter groupe
        if (["licence", "master", "doctorat", "all"].includes(filter)) {
            currentLevel = filter;
        } else {
            currentFunding = filter;
        }

        applyFilter();

        btn.parentElement.querySelectorAll(".filter-btn")
            .forEach(b => b.classList.remove("active"));

        btn.classList.add("active");
    });
});

function applyFilter() {
    cards.forEach(card => {

        const level = card.dataset.level;
        const funding = card.dataset.funding;

        const levelMatch =
            currentLevel === "all" || level.includes(currentLevel);

        const fundingMatch =
            currentFunding === "all-f" || funding === currentFunding;

        if (levelMatch && fundingMatch) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
}