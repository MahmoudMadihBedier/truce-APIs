import chromium from '@sparticuz/chromium';
import {
  chromium as playwright,
  Browser,
  BrowserContext,
} from 'playwright-core';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { BaseScraper } from '../BaseScraper';
import { Product } from '../../../domain/entities/Product';

/**
 * Scraper for Carrefour Egypt using Playwright
 */
export class CarrefourScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.carrefouregypt.com';

  /**
   * Scrapes Carrefour category pages
   * @param category Category path
   * @returns List of scraped products
   */
  async scrape(category = '/mafegy/en/c/FEGY1000000'): Promise<Product[]> {
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        const context = await this.createContext(browser);
        const page = await context.newPage();

        const url = `${this.baseUrl}${category}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Use more stable data attributes or generic selectors if possible
        await page
          .waitForSelector('[data-qa="product-card"]', { timeout: 10000 })
          .catch(() => {});

        const content = await page.content();
        const $ = cheerio.load(content);
        const products: Product[] = [];

        // Try both hashed and data-qa selectors
        $('[data-qa="product-card"], .css-176f571').each((_, el) => {
          const product = this.parseProduct($(el));
          if (product && product.product_name) {
            products.push(product);
          }
        });

        return products;
      } finally {
        if (browser) await browser.close();
      }
    });
  }

  /**
   * Scrapes a single product page
   * @param url Product URL
   * @returns Scraped product entity
   */
  async scrapeProduct(url: string): Promise<Product> {
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        const context = await this.createContext(browser);
        const page = await context.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const content = await page.content();
        const $ = cheerio.load(content);
        const product = this.normalize($);
        product.product_url = url;
        product.product_id = url.split('/').pop() || '';
        return product;
      } finally {
        if (browser) await browser.close();
      }
    });
  }

  private async launchBrowser(): Promise<Browser> {
    const executablePath = await chromium.executablePath();
    console.log(`Launching Carrefour browser with executablePath: ${executablePath}`);
    return await playwright.launch({
      args: chromium.args,
      executablePath,
      headless: true,
      proxy: this.config.proxyUrl
        ? { server: this.config.proxyUrl }
        : undefined,
    });
  }

  private async createContext(browser: Browser): Promise<BrowserContext> {
    return await browser.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1280, height: 720 },
    });
  }

  /**
   * Public method to parse a product element for testing.
   * @param $el Cheerio element
   * @returns Product or null
   */
  public parseProduct($el: cheerio.Cheerio<Element>): Product | null {
    try {
      const name = (
        $el.find('[data-qa="product-name"]').text() ||
        $el.find('.css-10n5s6n').text()
      ).trim();
      const relativeUrl = $el.find('a').attr('href');
      const url = relativeUrl
        ? relativeUrl.startsWith('http')
          ? relativeUrl
          : this.baseUrl + relativeUrl
        : '';
      const imageUrl = $el.find('img').attr('src') || '';

      const priceText =
        $el.find('[data-qa="product-price"]').text() ||
        $el.find('.css-17n6it9').first().text();
      const currentPrice = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

      const previousPriceStr = $el
        .find('.css-1p20455')
        .first()
        .text()
        .replace(/[^\d.]/g, '');
      const previousPrice = previousPriceStr
        ? parseFloat(previousPriceStr)
        : null;

      const isOos =
        $el.find('.css-1m0m2v4').length > 0 ||
        $el.text().includes('Out of Stock');

      const productId = url.split('/').pop() || 'unknown';

      return {
        product_id: productId,
        product_name: name,
        product_category: 'Carrefour | Supermarket',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Carrefour Egypt',
        discounts_offers: null,
        availability_status: isOos ? 'Out of Stock' : 'In Stock',
        location_city: 'Cairo',
        last_updated_utc: new Date().toISOString(),
      };
    } catch (e) {
      return null;
    }
  }

  protected normalize($: unknown): Product {
    const cheerioApi = $ as cheerio.CheerioAPI;
    const name = cheerioApi('.css-10n5s6n').first().text().trim();
    const currentPrice =
      parseFloat(
        cheerioApi('.css-17n6it9')
          .first()
          .text()
          .replace(/[^\d.]/g, ''),
      ) || 0;
    const previousPriceStr = cheerioApi('.css-1p20455')
      .first()
      .text()
      .replace(/[^\d.]/g, '');
    const previousPrice = previousPriceStr
      ? parseFloat(previousPriceStr)
      : null;
    const imageUrl = cheerioApi('.css-17n6it9 img').first().attr('src') || '';

    const brand = cheerioApi('.css-1f9yqmo').first().text().trim() || 'Unknown';
    const isOos = cheerioApi('.css-1m0m2v4').length > 0;

    return {
      product_id: '', // Will be set by caller from URL
      product_name: name,
      product_category: 'Carrefour',
      brand_name: brand,
      product_url: '',
      current_price_egp: currentPrice,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Carrefour Egypt',
      discounts_offers: null,
      availability_status: isOos ? 'Out of Stock' : 'In Stock',
      location_city: 'Cairo',
      last_updated_utc: new Date().toISOString(),
    };
  }
}
