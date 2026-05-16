import Redis from 'ioredis';
import {
  Product,
  ProductFilters,
  PaginatedProducts,
} from '../../domain/entities/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';

/**
 * Implementation of IProductRepository using Redis
 */
export class RedisProductRepository implements IProductRepository {
  private redis: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async save(product: Product): Promise<void> {
    const key = `product:${product.store_name}:${product.product_url}`;
    await this.redis.set(key, JSON.stringify(product));

    const pipeline = this.redis.pipeline();
    pipeline.sadd('products:all', key);
    pipeline.sadd(`idx:store:${product.store_name}`, key);
    pipeline.sadd(`idx:brand:${product.brand_name.toLowerCase()}`, key);

    // Normalize and index categories
    const categories = product.product_category
      .split('|')
      .map((c) => c.trim().toLowerCase());
    for (const cat of categories) {
      pipeline.sadd(`idx:category:${cat}`, key);
    }

    // Basic keyword indexing for name
    const words = product.product_name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    for (const word of words) {
      pipeline.sadd(`idx:name:${word}`, key);
    }

    await pipeline.exec();
  }

  async saveAll(products: Product[]): Promise<void> {
    for (const product of products) {
      await this.save(product);
    }
  }

  async find(filters: ProductFilters): Promise<PaginatedProducts> {
    const {
      page = 1,
      limit = 50,
      product_name,
      store_name,
      brand_name,
      category,
    } = filters;

    let resultKeys: string[] = [];
    const setsToIntersect: string[] = [];

    if (store_name) setsToIntersect.push(`idx:store:${store_name}`);
    if (brand_name)
      setsToIntersect.push(`idx:brand:${brand_name.toLowerCase()}`);
    if (category)
      setsToIntersect.push(`idx:category:${category.toLowerCase()}`);

    if (product_name) {
      const words = product_name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      for (const word of words) {
        setsToIntersect.push(`idx:name:${word}`);
      }
    }

    if (setsToIntersect.length > 0) {
      // Use temporary key for intersection
      const tempKey = `temp:search:${Date.now()}:${Math.random()}`;
      await this.redis.sinterstore(tempKey, ...setsToIntersect);
      resultKeys = await this.redis.smembers(tempKey);
      await this.redis.del(tempKey);
    } else {
      resultKeys = await this.redis.smembers('products:all');
    }

    const total_count = resultKeys.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedKeys = resultKeys.slice(start, end);

    const products: Product[] = [];
    if (paginatedKeys.length > 0) {
      const data = await this.redis.mget(...paginatedKeys);
      for (const item of data) {
        if (item) {
          products.push(JSON.parse(item));
        }
      }
    }

    return {
      products,
      total_count,
      timestamp: new Date().toISOString(),
    };
  }

  async findByUrl(url: string): Promise<Product | null> {
    const allKeys = await this.redis.smembers('products:all');
    for (const key of allKeys) {
      if (key.endsWith(url)) {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      }
    }
    return null;
  }
}
