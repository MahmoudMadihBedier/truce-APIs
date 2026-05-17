import { VercelRequest, VercelResponse } from '@vercel/node';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';
import { ProductFilters, Product } from '../src/domain/entities/Product';
import { JumiaScraper } from '../src/data/scrapers/jumia/JumiaScraper';
import { AmazonScraper } from '../src/data/scrapers/amazon/AmazonScraper';
import { CarrefourScraper } from '../src/data/scrapers/carrefour/CarrefourScraper';
import { NoonScraper } from '../src/data/scrapers/noon/NoonScraper';

/**
 * Product search and real-time scraping endpoint.
 * @param req VercelRequest
 * @param res VercelResponse
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { product_url } = req.query;

  try {
    const repository = new RedisProductRepository();
    const config = { proxyUrl: process.env.PROXY_URL };

    if (product_url && typeof product_url === 'string') {
      // Real-time scrape for single URL
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
        return res.status(200).json({
          products: [{ ...product, sr_no: 1 }],
          total_count: 1,
          timestamp: new Date().toISOString(),
        });
      } else {
        return res
          .status(404)
          .json({ error: 'Product not found or store not supported' });
      }
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

    // Populate sr_no for the result set
    const productsWithSrNo = result.products.map((p, i) => ({
        ...p,
        sr_no: (page - 1) * limit + i + 1
    }));

    res.status(200).json({
        ...result,
        products: productsWithSrNo
    });
  } catch (error) {
    console.error('API Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      filters: req.query,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      details:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};
