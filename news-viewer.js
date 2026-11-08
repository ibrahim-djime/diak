/**
 * news-viewer.js
 * Gestion de l'affichage des actualités dans la section Information.
 * Le bouton « Voir plus » est permanent et ne déclenche jamais une nouvelle
 * collecte externe. Il charge seulement la tranche suivante déjà enregistrée.
 */

class NewsViewer {
    constructor() {
        this.collector = null;
        this.currentCategory = 'Toutes';
        this.currentSearch = '';
        this.pageSize = 30;
        this.visibleCount = 0;
        this.hasMore = false;
        this.allArticles = [];
        this.loaded = [];
        this.loadedIds = new Set();
        this.cursor = null;
        this.feedCycleId = null;
        this.isLoading = false;
        this.articlesContainer = null;
        this.loadMoreButton = null;
        this.statusElement = null;
        this.init();
    }

    async init() {
        this.articlesContainer = document.getElementById('news-articles') || this.ensureArticlesContainer();
        this.loadMoreButton = document.getElementById('news-load-more') || this.ensureLoadMoreButton();
        this.statusElement = document.getElementById('news-status') || this.ensureStatusElement();
        this.bindEvents();
        await this.waitForFirestore();
        await this.loadInitial();
    }

    waitForFirestore() {
        if (window.InfoFirestore) return Promise.resolve();
        return new Promise((resolve) => {
            const handler = () => resolve();
            window.addEventListener('info:firebase-ready', handler, { once: true });
            window.setTimeout(() => {
                if (window.InfoFirestore) resolve();
            }, 5000);
        });
    }

    ensureArticlesContainer() {
        const container = document.createElement('div');
        container.id = 'news-articles';
        container.className = 'news-articles';
        const target = document.body || document.documentElement;
        target.appendChild(container);
        return container;
    }

    ensureLoadMoreButton() {
        const button = document.createElement('button');
        button.id = 'news-load-more';
        button.type = 'button';
        button.className = 'info-load-more';
        button.textContent = 'Voir plus';
        button.setAttribute('aria-label', 'Afficher plus d\'actualités');
        button.addEventListener('click', () => this.loadMore());
        const target = document.body || document.documentElement;
        target.appendChild(button);
        return button;
    }

    ensureStatusElement() {
        const status = document.createElement('div');
        status.id = 'news-status';
        status.className = 'news-status';
        const target = document.body || document.documentElement;
        target.appendChild(status);
        return status;
    }

    bindEvents() {
        document.querySelectorAll('.news-filter').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                document.querySelectorAll('.news-filter').forEach((node) => node.classList.remove('active'));
                event.target.classList.add('active');
                this.currentCategory = event.target.dataset.category || 'Toutes';
                this.renderLoaded();
            });
        });

        const searchInput = document.getElementById('news-search');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                this.currentSearch = event.target.value || '';
                this.renderLoaded();
            });
        }

        const refreshBtn = document.getElementById('news-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadInitial();
            });
        }
    }

    async loadInitial() {
        this.showLoading();
        try {
            if (!window.InfoFirestore) {
                this.showError();
                return;
            }
            const page = await window.InfoFirestore.beginFeedSession();
            this.feedCycleId = page.feedCycleId || null;
            this.loaded = [];
            this.loadedIds = new Set();
            (page.articles || []).forEach((article) => {
                if (this.loadedIds.has(article.id)) return;
                this.loaded.push(article);
                this.loadedIds.add(article.id);
            });
            this.cursor = null;
            this.hasMore = true;
            this.renderLoaded();
            this.syncLoadMoreButton();
        } catch (error) {
            console.error('❌ Erreur chargement actualités:', error);
            this.showError();
        }
    }

    filterArticles(articles) {
        let filtered = Array.isArray(articles) ? articles.slice() : [];
        if (this.currentCategory && this.currentCategory !== 'Toutes') {
            filtered = filtered.filter((article) => {
                const category = String(article.category || '');
                const source = String(article.sourceName || article.source || '');
                return category.includes(this.currentCategory) || source.includes(this.currentCategory);
            });
        }
        if (this.currentSearch && this.currentSearch.trim()) {
            const q = this.currentSearch.toLowerCase();
            filtered = filtered.filter((article) => {
                const title = String(article.title || '').toLowerCase();
                const description = String(article.description || article.content || '').toLowerCase();
                const source = String(article.sourceName || article.source || '').toLowerCase();
                return title.includes(q) || description.includes(q) || source.includes(q);
            });
        }
        return filtered;
    }

    renderLoaded() {
        const filtered = this.filterArticles(this.loaded);
        this.renderArticles(filtered);
    }

    async loadMore() {
        if (this.isLoading) return;
        this.isLoading = true;
        try {
            if (!window.InfoFirestore) {
                throw new Error('Le service Firestore Information est indisponible.');
            }

            const page = await window.InfoFirestore.loadMoreInfoArticles(
                this.loaded.map((article) => ({
                    id: article.id,
                    originalUrl: article.originalUrl || article.link
                }))
            );
            this.feedCycleId = page.feedCycleId || this.feedCycleId;
            const newArticles = (page.articles || []).filter((article) => !this.loadedIds.has(article.id));
            newArticles.forEach((article) => {
                this.loaded.push(article);
                this.loadedIds.add(article.id);
            });
            this.hasMore = true;
            if (!newArticles.length) {
                this.showTemporaryMessage('Toutes les actualités actuellement disponibles ont été affichées.');
            }

            this.renderLoaded();
            this.syncLoadMoreButton();
        } catch (error) {
            console.error('❌ Erreur chargement supplémentaire:', error);
            this.showTemporaryMessage('Impossible de charger la page suivante depuis Firestore. Réessayez.');
        } finally {
            this.isLoading = false;
        }
    }

    showLoading() {
        if (!this.articlesContainer) return;
        this.articlesContainer.innerHTML = `
            <div class="news-loading">
                <div class="spinner"></div>
                <p>Chargement des actualités...</p>
            </div>
        `;
    }

    showError() {
        if (!this.articlesContainer) return;
        this.articlesContainer.innerHTML = `
            <div class="news-error">
                <p>❌ Impossible de charger les actualités.</p>
                <button id="news-refresh" class="btn-retry">Réessayer</button>
            </div>
        `;
        setTimeout(() => {
            const retryBtn = document.getElementById('news-refresh');
            if (retryBtn) {
                retryBtn.addEventListener('click', () => this.loadInitial());
            }
        }, 100);
    }

    showTemporaryMessage(message) {
        if (!this.statusElement) return;
        this.statusElement.textContent = message;
        this.statusElement.hidden = false;
        window.clearTimeout(this.statusTimer);
        this.statusTimer = window.setTimeout(() => {
            this.statusElement.hidden = true;
        }, 2500);
    }

    renderArticles(articles) {
        if (!this.articlesContainer) return;

        if (!articles.length) {
            this.articlesContainer.innerHTML = `
                <div class="news-empty">
                    <p>Aucune actualité trouvée.</p>
                </div>
            `;
            this.statusElement.hidden = true;
            return;
        }

        const html = articles.map((article) => this.createArticleCard(article)).join('');
        this.articlesContainer.innerHTML = html;
    }

    createArticleCard(article) {
        const date = this.formatDate(article.pubDate || article.publishedAt);
        const categoryClass = this.getCategoryClass(article.category || 'Monde');
        const source = article.sourceName || article.source || 'Source inconnue';
        const description = this.escapeHtml(article.description || article.content || '');
        const title = this.escapeHtml(article.title || 'Sans titre');
        const link = article.link || article.originalUrl || '#';

        return `
            <article class="news-card" data-id="${this.escapeHtml(String(article.id || ''))}">
                <div class="news-card-header">
                    <span class="news-source">${this.escapeHtml(source)}</span>
                    <span class="news-category ${categoryClass}">${this.escapeHtml(article.category || 'Monde')}</span>
                    <span class="news-date">${date}</span>
                </div>
                <h3 class="news-title">${title}</h3>
                <p class="news-excerpt">${description}</p>
                <a href="${link}" target="_blank" rel="noopener noreferrer" class="news-link">
                    Lire la suite →
                </a>
            </article>
        `;
    }

    syncLoadMoreButton() {
        if (!this.loadMoreButton) return;
        this.loadMoreButton.hidden = false;
        this.loadMoreButton.disabled = false;
        this.loadMoreButton.dataset.hasMore = String(this.hasMore);
        this.loadMoreButton.textContent = 'Voir plus';
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
        } catch (error) {
            return 'Date inconnue';
        }
    }

    getCategoryClass(category) {
        const map = {
            Afrique: 'cat-afrique',
            Monde: 'cat-monde',
            Politique: 'cat-politique',
            Économie: 'cat-economie',
            Technologie: 'cat-tech',
            Santé: 'cat-sante',
            Sports: 'cat-sports'
        };
        return map[category] || 'cat-default';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('news-articles')) {
        new NewsViewer();
    }
});
