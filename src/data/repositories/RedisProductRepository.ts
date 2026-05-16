import Redis from 'ioredis';
import {
  Product,
  ProductFilters,
  PaginatedProducts,
} from '@/domain/entities/Product';
import { IProductRepository } from '@/domain/repositories/IProductRepository';

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

    // Add to a set for easier listing
    await this.redis.sadd('products:all', key);

    // Indexing for search (basic implementation)
    const searchKey = `idx:name:${product.product_name.toLowerCase()}`;
    await this.redis.sadd(searchKey, key);
  }

  async saveAll(products: Product[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const product of products) {
      const key = `product:${product.store_name}:${product.product_url}`;
      pipeline.set(key, JSON.stringify(product));
      pipeline.sadd('products:all', key);
    }
    await pipeline.exec();
  }

  async find(filters: ProductFilters): Promise<PaginatedProducts> {
    const { page = 1, limit = 50, product_name, store_name } = filters;

    // This is a simplified search logic.
    // In production, we might use RediSearch or another search engine.
    let keys: string[] = [];

    if (product_name) {
      // Very basic keyword matching
      const allKeys = await this.redis.smembers('products:all');
      for (const key of allKeys) {
        const productJson = await this.redis.get(key);
        if (productJson) {
          const product: Product = JSON.parse(productJson);
          if (
            product.product_name
              .toLowerCase()
              .includes(product_name.toLowerCase())
          ) {
            if (!store_name || product.store_name === store_name) {
              keys.push(key);
            }
          }
        }
      }
    } else {
      keys = await this.redis.smembers('products:all');
    }

    const total_count = keys.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedKeys = keys.slice(start, end);

    const products: Product[] = [];
    for (const key of paginatedKeys) {
      const data = await this.redis.get(key);
      if (data) {
        products.push(JSON.parse(data));
      }
    }

    return {
      products,
      total_count,
      timestamp: new Date().toISOString(),
    };
  }

  async findByUrl(url: string): Promise<Product | null> {
    // We would need to know the store to reconstruct the exact key,
    // or search across all products.
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
