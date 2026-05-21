import axios from 'axios';
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
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
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
   * Fetches a URL via ScraperAPI, which routes through residential IPs and handles
   * anti-bot measures. This bypasses the IP-level blocks that cloud providers
   * (Vercel/AWS) face from Egyptian e-commerce sites.
   *
   * Requires SCRAPERAPI_KEY env var. Returns null if key is missing or request fails,
   * so callers can fall through to the Playwright browser path.
   *
   * @param url Target URL to fetch
   * @param render Whether to execute JavaScript before returning HTML (needed for SPAs)
   */
  protected async fetchViaScraperApi(url: string, render = false): Promise<string | null> {
    const apiKey = process.env.SCRAPERAPI_KEY;
    if (!apiKey) return null;
    try {
      const params = new URLSearchParams({
        api_key: apiKey,
        url,
        country_code: 'eg',
        keep_headers: 'true',
      });
      if (render) params.set('render', 'true');
      const apiUrl = `https://api.scraperapi.com?${params.toString()}`;
      console.log(`Fetching via ScraperAPI (render=${render}): ${url}`);
      const response = await axios.get<string>(apiUrl, {
        timeout: 50000,
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
      });
      const html = typeof response.data === 'string' ? response.data : String(response.data);
      return html.length > 500 ? html : null;
    } catch (err) {
      console.warn(`ScraperAPI fetch failed for ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Ensures the lambda environment is properly set up with necessary library paths.
   * Chromium on Vercel (AWS Lambda) requires specific shared libraries extracted to /tmp.
   */
  protected setupEnvironment(): void {
    if (process.env.VERCEL || process.env.AWS_EXECUTION_ENV) {
      // @sparticuz/chromium extracts libraries to these locations based on the runtime
      // Chromium on Vercel needs these paths for its shared libraries
      const paths = ['/tmp/al2/lib', '/tmp/al2023/lib'];

      let currentPath = process.env.LD_LIBRARY_PATH || '';
      const parts = currentPath.split(':').filter(Boolean);

      for (const p of paths) {
        if (!parts.includes(p)) {
          parts.unshift(p);
        }
      }

      process.env.LD_LIBRARY_PATH = parts.join(':');
      process.env.FONTCONFIG_PATH = '/tmp/fonts';

      console.log(`Environment setup: LD_LIBRARY_PATH=${process.env.LD_LIBRARY_PATH}`);
    }
  }

  /**
   * Generates a random delay between min and max milliseconds
   */
  protected async randomDelay(min = 1000, max = 5000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

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
