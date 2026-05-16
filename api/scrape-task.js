"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RedisProductRepository_1 = require("../src/data/repositories/RedisProductRepository");
const JumiaScraper_1 = require("../src/data/scrapers/jumia/JumiaScraper");
const AmazonScraper_1 = require("../src/data/scrapers/amazon/AmazonScraper");
const CarrefourScraper_1 = require("../src/data/scrapers/carrefour/CarrefourScraper");
const NoonScraper_1 = require("../src/data/scrapers/noon/NoonScraper");
/**
 * Executes a granular scraping task for a specific store and category.
 * Designed to be called by the orchestrator to stay within platform limits.
 */
exports.default = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    const { store, category_path, category_name } = req.body;
    const secret = req.headers['x-scrape-secret'];
    if (secret !== process.env.SCRAPE_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!store) {
        return res.status(400).json({ error: 'Missing store parameter' });
    }
    try {
        const repository = new RedisProductRepository_1.RedisProductRepository();
        const config = { proxyUrl: process.env.PROXY_URL };
        let scraper;
        switch (store.toLowerCase()) {
            case 'amazon':
                scraper = new AmazonScraper_1.AmazonScraper(config);
                break;
            case 'jumia':
                scraper = new JumiaScraper_1.JumiaScraper(config);
                break;
            case 'carrefour':
                scraper = new CarrefourScraper_1.CarrefourScraper(config);
                break;
            case 'noon':
                scraper = new NoonScraper_1.NoonScraper(config);
                break;
            default:
                return res.status(400).json({ error: 'Unsupported store' });
        }
        console.log(`Starting scrape for ${store} in ${category_name || 'default'}`);
        const products = await scraper.scrape(category_path);
        // Enrich with category metadata
        const enriched = category_name
            ? products.map(p => ({ ...p, product_category: `${category_name} | ${p.product_category}` }))
            : products;
        await repository.saveAll(enriched);
        res.status(200).json({
            message: `Successfully scraped ${enriched.length} products from ${store}`,
            count: enriched.length,
        });
    }
    catch (error) {
        console.error(`Scrape task failed for ${store}:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
