/**
 * news-collector.js
 * Système de collecte d'actualités pour la section Information
 * Utilise des flux RSS et des API externes
 */

class NewsCollector {
    constructor() {
        this.sources = [
            {
                name: 'Africanews',
                url: 'https://www.africanews.com/feed/',
                category: 'Afrique'
            },
            {
                name: 'BBC Afrique',
                url: 'https://www.bbc.com/afrique/rss.xml',
                category: 'Afrique'
            },
            {
                name: 'DW Afrique',
                url: 'https://rss.dw.com/feeds/rss-afrique/all',
                category: 'Afrique'
            },
            {
                name: 'Al Jazeera',
                url: 'https://www.aljazeera.com/rss',
                category: 'Monde'
            },
            {
                name: 'Jeune Afrique',
                url: 'https://www.jeuneafrique.com/feed/',
                category: 'Afrique'
            },
            {
                name: 'The Africa Report',
                url: 'https://www.theafricareport.com/feed/',
                category: 'Afrique'
            },
            {
                name: 'Reuters',
                url: 'https://feeds.reuters.com/Reuters/worldNews',
                category: 'Monde'
            },
            {
                name: 'AP News',
                url: 'https://feeds.apnews.com/feeds/news/topstories',
                category: 'Monde'
            },
            {
                name: 'AFP',
                url: 'https://www.afp.com/fr/rss',
                category: 'Monde'
            }
        ];
        this.cache = new Map();
        this.cacheDuration = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Collecte les actualités depuis une source RSS
     */
    async collectFromRSS(source) {
        try {
            // Utiliser un proxy CORS pour éviter les problèmes de même origine
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const response = await fetch(proxyUrl + encodeURIComponent(source.url));
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, 'application/xml');
            
            const items = doc.querySelectorAll('item');
            const articles = [];

            items.forEach((item, index) => {
                if (index >= 5) return; // Limit to 5 articles per source

                const title = item.querySelector('title')?.textContent || '';
                const link = item.querySelector('link')?.textContent || '';
                const description = item.querySelector('description')?.textContent || '';
                const pubDate = item.querySelector('pubDate')?.textContent || '';
                const category = item.querySelector('category')?.textContent || source.category;

                // Nettoyer la description (enlever les balises HTML)
                const cleanDescription = description.replace(/<[^>]*>/g, '');

                articles.push({
                    title: this.cleanText(title),
                    link: link,
                    description: this.cleanText(cleanDescription).substring(0, 200),
                    pubDate: pubDate,
                    source: source.name,
                    category: category,
                    id: this.generateId(link)
                });
            });

            return articles;
        } catch (error) {
            console.error(`❌ Erreur collecte ${source.name}:`, error);
            return [];
        }
    }

    /**
     * Nettoyer le texte
     */
    cleanText(text) {
        return text.replace(/&nbsp;/g, ' ')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'")
                  .trim();
    }

    /**
     * Générer un ID unique pour un article
     */
    generateId(url) {
        return 'news_' + url.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
    }

    /**
     * Collecter toutes les actualités
     */
    async collectAll() {
        const cacheKey = 'all_news';
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
            console.log('✅ Actualités depuis le cache');
            return cached.data;
        }

        console.log('🔍 Collecte des actualités depuis les sources...');

        const promises = this.sources.map(source => this.collectFromRSS(source));
        const results = await Promise.allSettled(promises);

        const allArticles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);

        // Trier par date (plus récent en premier)
        allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // Mettre en cache
        this.cache.set(cacheKey, {
            data: allArticles,
            timestamp: Date.now()
        });

        console.log(`✅ ${allArticles.length} articles collectés`);
        return allArticles;
    }

    /**
     * Filtrer les articles par catégorie
     */
    filterByCategory(articles, category) {
        if (!category || category === 'Toutes') return articles;
        return articles.filter(a => a.category === category);
    }

    /**
     * Rechercher dans les articles
     */
    searchArticles(articles, query) {
        if (!query) return articles;
        const q = query.toLowerCase();
        return articles.filter(a => 
            a.title.toLowerCase().includes(q) ||
            a.description.toLowerCase().includes(q) ||
            a.source.toLowerCase().includes(q)
        );
    }
}

// Exporter pour utilisation
if (typeof window !== 'undefined') {
    window.NewsCollector = NewsCollector;
}