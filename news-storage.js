/**
 * news-storage.js
 * Gestion du stockage local des actualités pour la section Information
 * Sauvegarde les articles lus, les favoris et les préférences utilisateur
 */

class NewsStorage {
    constructor() {
        this.prefix = 'news_';
        this.keys = {
            READ_ARTICLES: this.prefix + 'read',
            FAVORITES: this.prefix + 'favorites',
            PREFERENCES: this.prefix + 'prefs',
            LAST_FETCH: this.prefix + 'last_fetch'
        };
    }

    /**
     * Récupérer les articles lus
     */
    getReadArticles() {
        try {
            const data = localStorage.getItem(this.keys.READ_ARTICLES);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('❌ Erreur lecture articles lus:', error);
            return [];
        }
    }

    /**
     * Marquer un article comme lu
     */
    markAsRead(articleId) {
        try {
            const read = this.getReadArticles();
            if (!read.includes(articleId)) {
                read.push(articleId);
                localStorage.setItem(this.keys.READ_ARTICLES, JSON.stringify(read));
            }
        } catch (error) {
            console.error('❌ Erreur marquage article lu:', error);
        }
    }

    /**
     * Récupérer les favoris
     */
    getFavorites() {
        try {
            const data = localStorage.getItem(this.keys.FAVORITES);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('❌ Erreur lecture favoris:', error);
            return [];
        }
    }

    /**
     * Ajouter/Supprimer un favori
     */
    toggleFavorite(articleId) {
        try {
            const favs = this.getFavorites();
            const index = favs.indexOf(articleId);
            
            if (index > -1) {
                favs.splice(index, 1);
            } else {
                favs.push(articleId);
            }
            
            localStorage.setItem(this.keys.FAVORITES, JSON.stringify(favs));
            return index === -1; // Retourne true si ajouté
        } catch (error) {
            console.error('❌ Erreur gestion favoris:', error);
            return false;
        }
    }

    /**
     * Vérifier si un article est en favori
     */
    isFavorite(articleId) {
        return this.getFavorites().includes(articleId);
    }

    /**
     * Sauvegarder les préférences
     */
    savePreferences(prefs) {
        try {
            localStorage.setItem(this.keys.PREFERENCES, JSON.stringify(prefs));
        } catch (error) {
            console.error('❌ Erreur sauvegarde préférences:', error);
        }
    }

    /**
     * Récupérer les préférences
     */
    getPreferences() {
        try {
            const data = localStorage.getItem(this.keys.PREFERENCES);
            return data ? JSON.parse(data) : {
                theme: 'light',
                autoRefresh: true,
                refreshInterval: 30,
                showRead: true,
                articlesPerPage: 20
            };
        } catch (error) {
            console.error('❌ Erreur lecture préférences:', error);
            return {};
        }
    }

    /**
     * Sauvegarder le timestamp du dernier fetch
     */
    setLastFetch(timestamp) {
        try {
            localStorage.setItem(this.keys.LAST_FETCH, timestamp.toString());
        } catch (error) {
            console.error('❌ Erreur sauvegarde last fetch:', error);
        }
    }

    /**
     * Récupérer le timestamp du dernier fetch
     */
    getLastFetch() {
        try {
            const data = localStorage.getItem(this.keys.LAST_FETCH);
            return data ? parseInt(data) : 0;
        } catch (error) {
            console.error('❌ Erreur lecture last fetch:', error);
            return 0;
        }
    }

    /**
     * Nettoyer le stockage
     */
    clear() {
        try {
            Object.values(this.keys).forEach(key => {
                localStorage.removeItem(key);
            });
            console.log('✅ Stockage news nettoyé');
        } catch (error) {
            console.error('❌ Erreur nettoyage stockage:', error);
        }
    }
}

// Exporter pour utilisation
if (typeof window !== 'undefined') {
    window.NewsStorage = NewsStorage;
}