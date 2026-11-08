/**
 * Browser-side adapter for the server-collected Information feed.
 * RSS collection and persistence are handled by the scheduled Firebase backend.
 */
class NewsCollector {
    constructor() {
        this.firestore = typeof window !== 'undefined' ? window.InfoFirestore : null;
        this.articles = [];
    }

    async collectAll() {
        if (!this.firestore) {
            throw new Error('Le service Firestore Information est indisponible.');
        }
        const page = await this.firestore.beginFeedSession();
        this.articles = page.articles;
        return this.articles;
    }

    getPreparedArticles() {
        return this.articles;
    }

    filterByCategory(articles, category) {
        if (!category || category === 'Toutes') return articles || [];
        return (articles || []).filter((article) =>
            String(article.category || '').includes(category) ||
            String(article.sourceName || article.source || '').includes(category)
        );
    }

    searchArticles(articles, query) {
        if (!query || !query.trim()) return articles || [];
        const term = query.toLowerCase();
        return (articles || []).filter((article) =>
            String(article.title || '').toLowerCase().includes(term) ||
            String(article.description || '').toLowerCase().includes(term) ||
            String(article.sourceName || article.source || '').toLowerCase().includes(term)
        );
    }
}

if (typeof window !== 'undefined') {
    window.NewsCollector = NewsCollector;
}
