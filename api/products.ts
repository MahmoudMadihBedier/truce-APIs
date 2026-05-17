import { VercelRequest, VercelResponse } from '@vercel/node';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';
import { ProductFilters, Product } from '../src/domain/entities/Product';

/**
 * Lazy loads and executes scraping logic.
 */
async function performScrape(url: string, repo: RedisProductRepository) {
  const config = { proxyUrl: process.env.PROXY_URL };
  let product: Product | null = null;

  if (url.includes('jumia.com.eg')) {
    const { JumiaScraper } = await import('../src/data/scrapers/jumia/JumiaScraper');
    product = await new JumiaScraper(config).scrapeProduct(url);
  } else if (url.includes('amazon.eg')) {
    const { AmazonScraper } = await import('../src/data/scrapers/amazon/AmazonScraper');
    product = await new AmazonScraper(config).scrapeProduct(url);
  } else if (url.includes('carrefouregypt.com')) {
    const { CarrefourScraper } = await import('../src/data/scrapers/carrefour/CarrefourScraper');
    product = await new CarrefourScraper(config).scrapeProduct(url);
  } else if (url.includes('noon.com')) {
    const { NoonScraper } = await import('../src/data/scrapers/noon/NoonScraper');
    product = await new NoonScraper(config).scrapeProduct(url);
  }

  if (product) {
    await repo.save(product);
    return { products: [{ ...product, sr_no: 1 }], total_count: 1 };
  }
  return null;
}

/**
 * Handles product searching.
 */
async function performSearch(req: VercelRequest, repo: RedisProductRepository) {
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

  const result = await repo.find(filters);
  return {
    ...result,
    products: result.products.map((p, i) => ({
      ...p,
      sr_no: (page - 1) * limit + i + 1,
    })),
  };
}

/**
 * Main API entry point.
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const repo = new RedisProductRepository();
    const { product_url } = req.query;

    if (product_url && typeof product_url === 'string') {
      const data = await performScrape(product_url, repo);
      if (!data) return res.status(404).json({ error: 'Not Supported' });
      return res.status(200).json({ ...data, timestamp: new Date().toISOString() });
    }

    const searchResult = await performSearch(req, repo);
    res.status(200).json(searchResult);
  } catch (error) {
    console.error('API Error details:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : null,
    });
  }
};
