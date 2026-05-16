import Redis from 'ioredis';
import {
  Product,
  ProductFilters,
  PaginatedProducts,
} from '../../domain/entities/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import crypto from 'crypto';
import { getRedisClient } from '../../core/redis';

/**
 * Implementation of IProductRepository using Redis with secondary indexing and sorted sets.
 */
export class RedisProductRepository implements IProductRepository {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Generates a unique key for a product based on its URL.
   * @param url Product URL
   * @returns Hashed product key
   */
  private getProductKey(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return `product:${hash}`;
  }

  /**
   * Saves a product and updates its secondary indexes and sorted update set.
   * @param product Product entity
   */
  async save(product: Product): Promise<void> {
    const key = this.getProductKey(product.product_url);
    await this.redis.set(key, JSON.stringify(product));

    const pipeline = this.redis.pipeline();
    pipeline.sadd('products:all', key);

    // Index by last update time (Sorted Set)
    const timestamp = new Date(product.last_updated_utc).getTime();
    pipeline.zadd('products:latest', timestamp, key);

    pipeline.sadd(`idx:store:${product.store_name.toLowerCase()}`, key);
    pipeline.sadd(`idx:brand:${product.brand_name.toLowerCase()}`, key);

    const categories = product.product_category
      .split('|')
      .map((c) => c.trim().toLowerCase());
    for (const cat of categories) {
      pipeline.sadd(`idx:category:${cat}`, key);
    }

    const words = product.product_name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    for (const word of words) {
      pipeline.sadd(`idx:name:${word}`, key);
    }

    await pipeline.exec();
  }

  /**
   * Saves multiple products efficiently using pipelining.
   * @param products Array of products
   */
  async saveAll(products: Product[]): Promise<void> {
    for (const product of products) {
      await this.save(product);
    }
  }

  /**
   * Finds products using secondary indexes and intersection.
   * Supports pagination and filtering.
   * @param filters Filtering criteria
   * @returns Paginated products
   */
  async find(filters: ProductFilters): Promise<PaginatedProducts> {
    const {
      page = 1,
      limit = 50,
      product_name,
      store_name,
      brand_name,
      category,
    } = filters;

    const setsToIntersect: string[] = [];

    if (store_name)
      setsToIntersect.push(`idx:store:${store_name.toLowerCase()}`);
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

    let resultKeys: string[] = [];
    let total_count = 0;

    if (setsToIntersect.length > 0) {
      // Use SINTER for read-only intersection (O(N*M))
      // For large datasets, consider a dedicated search engine.
      resultKeys = await this.redis.sinter(...setsToIntersect);
      total_count = resultKeys.length;

      // Sort and paginate in-memory for the intersected set
      // (Redis SORT works on sets, but we can't combine SINTER and SORT easily without a temp key)
      // To avoid writing (SINTERSTORE), we do basic slicing.
      resultKeys = resultKeys.sort().slice((page - 1) * limit, page * limit);
    } else {
      total_count = await this.redis.scard('products:all');
      resultKeys = (await this.redis.sort(
        'products:all',
        'LIMIT',
        (page - 1) * limit,
        limit,
      )) as string[];
    }

    const products = await this.fetchProducts(resultKeys);
    return { products, total_count, timestamp: new Date().toISOString() };
  }

  private async fetchProducts(keys: string[]): Promise<Product[]> {
    if (keys.length === 0) return [];
    const data = await this.redis.mget(...keys);
    return data
      .map((item) => (item ? JSON.parse(item) : null))
      .filter((item): item is Product => item !== null);
  }

  /**
   * Retrieves a product by its unique URL.
   * @param url Product URL
   * @returns Product or null
   */
  async findByUrl(url: string): Promise<Product | null> {
    const key = this.getProductKey(url);
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}
