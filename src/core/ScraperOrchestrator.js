"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperOrchestrator = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * Service to orchestrate the scraping process across multiple stores and categories.
 * Distributes work via HTTP calls to Vercel API tasks to stay within execution limits.
 */
class ScraperOrchestrator {
    constructor(repository) {
        this.repository = repository;
        this.categories = [
            {
                name: 'Electronics',
                paths: {
                    amazon: '/s?k=electronics',
                    jumia: '/electronics/',
                    noon: '/egypt-en/electronics/',
                    carrefour: '/mafegy/en/c/FEGY1000000',
                },
            },
            {
                name: 'Food & Drinks',
                paths: {
                    amazon: '/s?k=grocery',
                    jumia: '/groceries/',
                    noon: '/egypt-en/grocery/',
                    carrefour: '/mafegy/en/c/FEGY1600000',
                },
            },
            {
                name: 'Fashion',
                paths: {
                    amazon: '/s?k=fashion',
                    jumia: '/category-fashion-by-jumia/',
                    noon: '/egypt-en/fashion/',
                    carrefour: '/mafegy/en/c/FEGY1200000',
                },
            },
            {
                name: 'Home Furniture',
                paths: {
                    amazon: '/s?k=furniture',
                    jumia: '/home-office/',
                    noon: '/egypt-en/home-kitchen/',
                    carrefour: '/mafegy/en/c/FEGY1400000',
                },
            },
            {
                name: 'Beauty & Health',
                paths: {
                    amazon: '/s?k=beauty',
                    jumia: '/health-beauty/',
                    noon: '/egypt-en/beauty-health/',
                    carrefour: '/mafegy/en/c/FEGY1100000',
                },
            },
            {
                name: 'Baby & Toys',
                paths: {
                    amazon: '/s?k=toys',
                    jumia: '/baby-products/',
                    noon: '/egypt-en/baby-toys/',
                    carrefour: '/mafegy/en/c/FEGY1300000',
                },
            },
            {
                name: 'Sports & Outdoors',
                paths: {
                    amazon: '/s?k=sports',
                    jumia: '/sporting-goods/',
                    noon: '/egypt-en/sports-outdoors/',
                    carrefour: '/mafegy/en/c/FEGY1700000',
                },
            },
            {
                name: 'Automotive',
                paths: {
                    amazon: '/s?k=automotive',
                    jumia: '/automobile/',
                    noon: '/egypt-en/automotive/',
                    carrefour: '/mafegy/en/c/FEGY1800000',
                },
            },
        ];
    }
    /**
     * Triggers granular scraping tasks for all stores and categories.
     * Uses internal HTTP calls to distribute the load across multiple Vercel function instances.
     */
    async runAll() {
        const stores = ['jumia', 'amazon', 'carrefour', 'noon'];
        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'http://localhost:3000';
        for (const category of this.categories) {
            for (const store of stores) {
                const path = category.paths[store];
                if (!path)
                    continue;
                try {
                    // Fire and forget: trigger a sub-task for each store/category pair
                    // In a real production system, this could be a message queue.
                    axios_1.default
                        .post(`${baseUrl}/api/scrape-task`, {
                        store,
                        category_path: path,
                        category_name: category.name,
                    }, {
                        headers: {
                            'x-scrape-secret': process.env.SCRAPE_SECRET,
                        },
                    })
                        .catch((err) => console.error(`Failed to trigger task for ${store}:`, err.message));
                }
                catch (error) {
                    console.error(`Orchestrator error for ${store}:`, error);
                }
            }
        }
    }
}
exports.ScraperOrchestrator = ScraperOrchestrator;
