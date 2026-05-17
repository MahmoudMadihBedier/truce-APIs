import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { RedisProductRepository } from './data/repositories/RedisProductRepository';
import { getRedisClient } from './core/redis';
import { ScraperOrchestrator } from './core/ScraperOrchestrator';
import { JumiaScraper } from './data/scrapers/jumia/JumiaScraper';
import { AmazonScraper } from './data/scrapers/amazon/AmazonScraper';
import { CarrefourScraper } from './data/scrapers/carrefour/CarrefourScraper';
import { NoonScraper } from './data/scrapers/noon/NoonScraper';
import { ProductFilters, Product } from './domain/entities/Product';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const repository = new RedisProductRepository();
const config = { proxyUrl: process.env.PROXY_URL };

/**
 * Health check endpoint.
 */
app.get('/api/health', async (req, res) => {
  try {
    const redis = getRedisClient();
    await redis.ping();
    res.json({
      status: 'ok',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', redis: String(err) });
  }
});

/**
 * Product search and real-time scraping.
 */
app.get('/api/products', async (req, res) => {
  try {
    const { product_url } = req.query;

    if (product_url && typeof product_url === 'string') {
      let product: Product | null = null;
      if (product_url.includes('jumia.com.eg')) {
        product = await new JumiaScraper(config).scrapeProduct(product_url);
      } else if (product_url.includes('amazon.eg')) {
        product = await new AmazonScraper(config).scrapeProduct(product_url);
      } else if (product_url.includes('carrefouregypt.com')) {
        product = await new CarrefourScraper(config).scrapeProduct(product_url);
      } else if (product_url.includes('noon.com')) {
        product = await new NoonScraper(config).scrapeProduct(product_url);
      }

      if (product) {
        await repository.save(product);
        return res.json({
          products: [{ ...product, sr_no: 1 }],
          total_count: 1,
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(404).json({ error: 'Not supported' });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const filters: ProductFilters = {
      product_name: req.query.product_name as string,
      category: req.query.category as string,
      brand_name: req.query.brand_name as string,
      store_name: req.query.store_name as string,
      location_city: req.query.location_city as string,
      page,
      limit,
    };

    const result = await repository.find(filters);
    const productsWithSrNo = result.products.map((p, i) => ({
      ...p,
      sr_no: (page - 1) * limit + i + 1,
    }));

    res.json({ ...result, products: productsWithSrNo });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown',
    });
  }
});

/**
 * Trigger scrape orchestration.
 */
app.post('/api/scrape', async (req, res) => {
  const secret = req.headers['x-scrape-secret'];
  if (secret !== process.env.SCRAPE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const orchestrator = new ScraperOrchestrator(repository);
  orchestrator
    .runAll()
    .catch((err) => console.error('Full scrape failed:', err));

  res
    .status(202)
    .json({ message: 'Scrape started', timestamp: new Date().toISOString() });
});

/**
 * Granular scrape task for workers.
 */
app.post('/api/scrape-task', async (req, res) => {
  const { store, category_path, category_name } = req.body;
  const secret = req.headers['x-scrape-secret'];

  if (secret !== process.env.SCRAPE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let scraper;
    switch (store.toLowerCase()) {
      case 'amazon':
        scraper = new AmazonScraper(config);
        break;
      case 'jumia':
        scraper = new JumiaScraper(config);
        break;
      case 'carrefour':
        scraper = new CarrefourScraper(config);
        break;
      case 'noon':
        scraper = new NoonScraper(config);
        break;
      default:
        return res.status(400).json({ error: 'Unsupported store' });
    }

    const products = await scraper.scrape(category_path);
    const enriched = category_name
      ? products.map((p) => ({
          ...p,
          product_category: `${category_name} | ${p.product_category}`,
        }))
      : products;

    await repository.saveAll(enriched);

    res.json({
      message: `Scraped ${enriched.length} products from ${store}`,
      count: enriched.length,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

export default app;
