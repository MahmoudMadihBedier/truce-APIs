import '../src/core/environment';
import { VercelRequest, VercelResponse } from '@vercel/node';
import chromium from '@sparticuz/chromium';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';
import { JumiaScraper } from '../src/data/scrapers/jumia/JumiaScraper';
import { AmazonScraper } from '../src/data/scrapers/amazon/AmazonScraper';
import { CarrefourScraper } from '../src/data/scrapers/carrefour/CarrefourScraper';
import { NoonScraper } from '../src/data/scrapers/noon/NoonScraper';

/**
 * Executes a granular scraping task for a specific store and category.
 * Designed to be called by the orchestrator to stay within platform limits.
 * @param req VercelRequest
 * @param res VercelResponse
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { store, category_path, category_name } = req.body;
  const secret = req.headers['x-scrape-secret'];
  const expectedSecret = process.env.SCRAPE_SECRET?.trim();

  if (!expectedSecret || secret !== expectedSecret) {
    console.warn(`Unauthorized scrape-task attempt for ${store}.`);
    console.warn(`Header Secret provided: ${secret ? 'YES (matches: ' + (secret === expectedSecret) + ')' : 'NO'}`);
    console.warn(`Config Secret defined: ${!!expectedSecret} (Length: ${expectedSecret?.length})`);
    return res.status(401).json({
      error: 'Unauthorized',
      details: 'Secret mismatch or missing environment variable on this deployment.'
    });
  }

  if (!store) {
    return res.status(400).json({ error: 'Missing store parameter' });
  }

  try {
    // Randomized delay to spread load on Vercel environment and avoid "thundering herd"
    // when multiple tasks are triggered simultaneously.
    const staggerDelay = Math.floor(Math.random() * 20000); // 0-20 seconds
    console.log(`Staggering worker start for ${store} in ${category_name} by ${staggerDelay}ms`);
    await new Promise((resolve) => setTimeout(resolve, staggerDelay));

    // Pre-flight extraction to ensure shared libraries are available before scrapers start
    if (process.env.VERCEL) {
      console.log('Pre-flight: Ensuring chromium binaries are extracted...');
      await chromium.executablePath();
    }

    const repository = new RedisProductRepository();
    const config = { proxyUrl: process.env.PROXY_URL };

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

    console.log(
      `Starting scrape for ${store} in ${category_name || 'default'}`,
    );
    const products = await scraper.scrape(category_path);

    // Enrich with category metadata
    const enriched = category_name
      ? products.map((p) => ({
          ...p,
          product_category: `${category_name} | ${p.product_category}`,
        }))
      : products;

    await repository.saveAll(enriched);

    res.status(200).json({
      message: `Successfully scraped ${enriched.length} products from ${store}`,
      count: enriched.length,
    });
  } catch (error) {
    console.error(`Scrape task failed for ${store}:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
