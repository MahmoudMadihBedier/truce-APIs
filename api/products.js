"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RedisProductRepository_1 = require("../src/data/repositories/RedisProductRepository");
const JumiaScraper_1 = require("../src/data/scrapers/jumia/JumiaScraper");
const AmazonScraper_1 = require("../src/data/scrapers/amazon/AmazonScraper");
const CarrefourScraper_1 = require("../src/data/scrapers/carrefour/CarrefourScraper");
const NoonScraper_1 = require("../src/data/scrapers/noon/NoonScraper");
exports.default = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    const { product_url } = req.query;
    try {
        const repository = new RedisProductRepository_1.RedisProductRepository();
        const config = { proxyUrl: process.env.PROXY_URL };
        if (product_url && typeof product_url === 'string') {
            // Real-time scrape for single URL
            let product = null;
            if (product_url.includes('jumia.com.eg')) {
                product = await new JumiaScraper_1.JumiaScraper(config).scrapeProduct(product_url);
            }
            else if (product_url.includes('amazon.eg')) {
                product = await new AmazonScraper_1.AmazonScraper(config).scrapeProduct(product_url);
            }
            else if (product_url.includes('carrefouregypt.com')) {
                product = await new CarrefourScraper_1.CarrefourScraper(config).scrapeProduct(product_url);
            }
            else if (product_url.includes('noon.com')) {
                product = await new NoonScraper_1.NoonScraper(config).scrapeProduct(product_url);
            }
            if (product) {
                await repository.save(product);
                return res.status(200).json({
                    products: [product],
                    total_count: 1,
                    timestamp: new Date().toISOString(),
                });
            }
            else {
                return res
                    .status(404)
                    .json({ error: 'Product not found or store not supported' });
            }
        }
        const filters = {
            product_name: req.query.product_name,
            category: req.query.category,
            brand_name: req.query.brand_name,
            store_name: req.query.store_name,
            location_city: req.query.location_city,
            page: req.query.page ? parseInt(req.query.page) : 1,
            limit: req.query.limit ? parseInt(req.query.limit) : 50,
        };
        const result = await repository.find(filters);
        res.status(200).json(result);
    }
    catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
