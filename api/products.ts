import { VercelRequest, VercelResponse } from '@vercel/node';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';
import { ProductFilters } from '../src/domain/entities/Product';

export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const repository = new RedisProductRepository();
    const filters: ProductFilters = {
      product_name: req.query.product_name as string,
      category: req.query.category as string,
      brand_name: req.query.brand_name as string,
      store_name: req.query.store_name as string,
      location_city: req.query.location_city as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    };

    const result = await repository.find(filters);
    res.status(200).json(result);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
