import { VercelRequest, VercelResponse } from '@vercel/node';
import { JumiaScraper } from '../src/data/scrapers/jumia/JumiaScraper';
import { AmazonScraper } from '../src/data/scrapers/amazon/AmazonScraper';
import { CarrefourScraper } from '../src/data/scrapers/carrefour/CarrefourScraper';
import { NoonScraper } from '../src/data/scrapers/noon/NoonScraper';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = req.headers['x-scrape-secret'];
  if (secret !== process.env.SCRAPE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const repository = new RedisProductRepository();
    const scrapers = [
      new JumiaScraper(),
      new AmazonScraper(),
      new CarrefourScraper(),
      new NoonScraper(),
    ];

    // In a real Vercel environment, we might use waitUntil or a background task
    // because this might exceed the timeout.
    const results = await Promise.allSettled(
      scrapers.map(async (scraper) => {
        const products = await scraper.scrape();
        await repository.saveAll(products);
        return { store: products[0]?.store_name, count: products.length };
      })
    );

    res.status(200).json({
      message: 'Scraping triggered successfully',
      results,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
