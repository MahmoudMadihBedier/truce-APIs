import { Product } from '../../domain/entities/Product';

/**
 * Configuration for proxies and anti-blocking
 */
export interface ScraperConfig {
  proxyUrl?: string;
  userAgent?: string;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * Abstract base class for all scrapers
 */
export abstract class BaseScraper {
  protected config: ScraperConfig;

  constructor(config: ScraperConfig = {}) {
    this.config = {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      maxRetries: 3,
      baseDelayMs: 2000,
      ...config,
    };
  }

  /**
   * Scrapes products from the given store
   * @param category Optional category to scrape
   */
  abstract scrape(category?: string): Promise<Product[]>;

  /**
   * Scrapes a single product by its URL
   * @param url The product URL
   */
  abstract scrapeProduct(url: string): Promise<Product>;

  /**
   * Normalizes the product data into the unified schema
   * @param data Raw data from the store
   */
  protected abstract normalize(data: unknown): Product;

  /**
   * Executes a task with retry logic
   * @param task The task to execute
   */
  protected async withRetry<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < (this.config.maxRetries || 3); i++) {
      try {
        if (i > 0) {
          const delay =
            (this.config.baseDelayMs || 2000) * Math.pow(2, i) +
            Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          console.log(`Retry attempt ${i}...`);
        }
        return await task();
      } catch (error) {
        lastError = error;
        console.warn(
          `Attempt ${i + 1} failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    throw lastError;
  }
}
