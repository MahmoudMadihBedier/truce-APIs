import {
  Product,
  ProductFilters,
  PaginatedProducts,
} from '../../domain/entities/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import crypto from 'crypto';
import { getRedisClient } from '../../core/redis';

/**
 * Implementation of IProductRepository using Redis with secondary indexing.
 */
export class RedisProductRepository implements IProductRepository {
  constructor() {
    // Connection managed by singleton
  }

  /**
   * Generates a unique key for a product based on its URL.
   */
  private getProductKey(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return `product:${hash}`;
  }

  /**
   * Saves a product and updates its secondary indexes.
   */
  async save(product: Product): Promise<void> {
    const redis = getRedisClient();
    const key = this.getProductKey(product.product_url);
    await redis.set(key, JSON.stringify(product));

    const pipeline = redis.pipeline();
    pipeline.sadd('products:all', key);

    const timestamp = new Date(product.last_updated_utc).getTime();
    pipeline.zadd('products:latest', timestamp, key);

    pipeline.sadd(`idx:store:${product.store_name.toLowerCase()}`, key);
    pipeline.sadd(`idx:brand:${product.brand_name.toLowerCase()}`, key);

    this.indexCategories(pipeline, product.product_category, key);
    this.indexKeywords(pipeline, product.product_name, key);

    await pipeline.exec();
  }

  private indexCategories(pipeline: any, category: string, key: string) {
    const categories = category.split('|').map((c) => c.trim().toLowerCase());
    for (const cat of categories) {
      pipeline.sadd(`idx:category:${cat}`, key);
    }
  }

  private indexKeywords(pipeline: any, name: string, key: string) {
    const words = name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    for (const word of words) {
      pipeline.sadd(`idx:name:${word}`, key);
    }
  }

  async saveAll(products: Product[]): Promise<void> {
    for (const product of products) {
      await this.save(product);
    }
  }

  /**
   * Finds products using secondary indexes and intersection.
   */
  async find(filters: ProductFilters): Promise<PaginatedProducts> {
    const redis = getRedisClient();
    const sets = this.buildFilterSets(filters);

    let resultKeys: string[] = [];
    let total_count = 0;

    if (sets.length > 0) {
      resultKeys = await redis.sinter(...sets);
      total_count = resultKeys.length;
      resultKeys = resultKeys
        .sort()
        .slice(
          (filters.page! - 1) * filters.limit!,
          filters.page! * filters.limit!,
        );
    } else {
      total_count = await redis.scard('products:all');
      resultKeys = (await redis.sort(
        'products:all',
        'LIMIT',
        (filters.page! - 1) * filters.limit!,
        filters.limit!,
      )) as string[];
    }

    const products = await this.fetchProducts(resultKeys);
    return { products, total_count, timestamp: new Date().toISOString() };
  }

  private buildFilterSets(filters: ProductFilters): string[] {
    const sets: string[] = [];
    if (filters.store_name)
      sets.push(`idx:store:${filters.store_name.toLowerCase()}`);
    if (filters.brand_name)
      sets.push(`idx:brand:${filters.brand_name.toLowerCase()}`);
    if (filters.category)
      sets.push(`idx:category:${filters.category.toLowerCase()}`);
    if (filters.product_name) {
      const words = filters.product_name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      for (const word of words) {
        sets.push(`idx:name:${word}`);
      }
    }
    return sets;
  }

  private async fetchProducts(keys: string[]): Promise<Product[]> {
    if (keys.length === 0) return [];
    const data = await getRedisClient().mget(...keys);
    return data
      .map((item) => (item ? JSON.parse(item) : null))
      .filter((item): item is Product => item !== null);
  }

  async findByUrl(url: string): Promise<Product | null> {
    const key = this.getProductKey(url);
    const data = await getRedisClient().get(key);
    return data ? JSON.parse(data) : null;
  }
}
