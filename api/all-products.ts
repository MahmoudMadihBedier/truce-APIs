import { VercelRequest, VercelResponse } from '@vercel/node';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';

/**
 * API Endpoint to retrieve all products stored in the database.
 * Supports pagination via 'page' and 'limit' query parameters.
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const repository = new RedisProductRepository();

    // Default to a large limit if not provided
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 100, 1000);

    const result = await repository.find({ page, limit });

    // Enrich with sequence numbers
    const enrichedProducts = result.products.map((p, i) => ({
      ...p,
      sr_no: (page - 1) * limit + i + 1,
    }));

    res.status(200).json({
      products: enrichedProducts,
      total_count: result.total_count,
      page,
      limit,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to retrieve all products:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
