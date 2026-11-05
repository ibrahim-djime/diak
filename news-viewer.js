/**
 * news-viewer.js
 * Gestion de l'affichage des actualités dans la section Information
 */

class NewsViewer {
    constructor() {
        this.collector = new NewsCollector();
        this.currentCategory = 'Toutes';
        this.currentSearch = '';
        this.articlesContainer = null;
        this.init();
    }

    /**
     * Initialisation du viewer
     */
    async init() {
        this.articlesContainer = document.getElementById('news-articles');
        if (!this.articlesContainer) {
            console.warn('⚠️ Conteneur d\'articles introuvable');
            return;
        }

        this.bindEvents();
        await this.loadAndDisplayNews();
    }

    /**
     * Lier les événements
     */
    bindEvents() {
        // Filtres par catégorie
        document.querySelectorAll('.news-filter').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.news-filter').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCategory = e.target.dataset.category;
                this.displayNews();
            });
        });

        // Barre de recherche
        const searchInput = document.getElementById('news-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearch = e.target.value;
                this.displayNews();
            });
        }

        // Bouton rafraîchir
        const refreshBtn = document.getElementById('news-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.collector.cache.clear();
                this.loadAndDisplayNews();
            });
        }
    }

    /**
     * Charger et afficher les actualités
     */
    async loadAndDisplayNews() {
        this.showLoading();

        try {
            const articles = await this.collector.collectAll();
            this.displayNews(articles);
        } catch (error) {
            console.error('❌ Erreur chargement actualités:', error);
            this.showError();
        }
    }

    /**
     * Afficher les actualités
     */
    displayNews(articles = null) {
        if (!articles) {
            // Utiliser le cache si disponible
            const cached = this.collector.cache.get('all_news');
            articles = cached ? cached.data : [];
        }

        // Appliquer les filtres
        let filtered = this.collector.filterByCategory(articles, this.currentCategory);
        filtered = this.collector.searchArticles(filtered, this.currentSearch);

        this.renderArticles(filtered);
    }

    /**
     * Afficher l'état de chargement
     */
    showLoading() {
        this.articlesContainer.innerHTML = `
            <div class="news-loading">
                <div class="spinner"></div>
                <p>Chargement des actualités...</p>
            </div>
        `;
    }

    /**
     * Afficher une erreur
     */
    showError() {
        this.articlesContainer.innerHTML = `
            <div class="news-error">
                <p>❌ Impossible de charger les actualités.</p>
                <button id="news-refresh" class="btn-retry">Réessayer</button>
            </div>
        `;
        // Re-lier le bouton retry
        setTimeout(() => {
            const retryBtn = document.getElementById('news-refresh');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => this.loadAndDisplayNews());
            }
        }, 100);
    }

    /**
     * Rendu des articles
     */
    renderArticles(articles) {
        if (articles.length === 0) {
            this.articlesContainer.innerHTML = `
                <div class="news-empty">
                    <p>Aucune actualité trouvée.</p>
                </div>
            `;
            return;
        }

        const html = articles.map(article => this.createArticleCard(article)).join('');
        this.articlesContainer.innerHTML = html;
    }

    /**
     * Créer une carte d'article
     */
    createArticleCard(article) {
        const date = this.formatDate(article.pubDate);
        const categoryClass = this.getCategoryClass(article.category);

        return `
            <article class="news-card" data-id="${article.id}">
                <div class="news-card-header">
                    <span class="news-source">${this.escapeHtml(article.source)}</span>
                    <span class="news-category ${categoryClass}">${this.escapeHtml(article.category)}</span>
                    <span class="news-date">${date}</span>
                </div>
                <h3 class="news-title">${this.escapeHtml(article.title)}</h3>
                <p class="news-excerpt">${this.escapeHtml(article.description)}</p>
                <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="news-link">
                    Lire la suite →
                </a>
            </article>
        `;
    }

    /**
     * Formater la date
     */
    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return 'Date inconnue';
        }
    }

    /**
     */
    getCategoryClass(category) {
        const map = {
            'Afrique': 'cat-afrique',
            'Monde': 'cat-monde',
            'Politique': 'cat-politique',
            'Économie': 'cat-economie',
            'Technologie': 'cat-tech',
            'Santé': 'cat-sante',
            'Sports': 'cat-sports'
        };
        return map[category] || 'cat-default';
    }

    /**
     * Échapper le HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', () => {
    new NewsViewer();
});