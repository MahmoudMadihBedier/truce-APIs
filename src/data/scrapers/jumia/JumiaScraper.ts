import chromium from '@sparticuz/chromium';
import {
  chromium as playwright,
  Browser,
  BrowserContext,
  Page,
} from 'playwright-core';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { BaseScraper } from '../BaseScraper';
import { Product } from '../../../domain/entities/Product';

/**
 * Scraper for Jumia Egypt using Playwright
 */
export class JumiaScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.jumia.com.eg';

  /**
   * Scrapes Jumia search results or category pages
   * @param category Category path or search query
   * @returns List of scraped products
   */
  async scrape(category = '/all-products/'): Promise<Product[]> {
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        const context = await this.createContext(browser);
        const page = await context.newPage();

        const url = `${this.baseUrl}${category}`;
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        await this.checkBlocked(page, response?.status());

        await page
          .waitForSelector('.prd._fb.col.c-prd', { timeout: 15000 })
          .catch(() => {});

        const content = await page.content();
        const $ = cheerio.load(content);
        const products: Product[] = [];

        $('.prd._fb.col.c-prd').each((_, el) => {
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

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await this.checkBlocked(page, response?.status());

        const content = await page.content();
        const $ = cheerio.load(content);
        const product = this.normalize($);
        product.product_url = url;
        return product;
      } finally {
        if (browser) await browser.close();
      }
    });
  }

  private async launchBrowser(): Promise<Browser> {
    this.setupEnvironment();
    const executablePath = await chromium.executablePath();
    console.log(`Launching Jumia browser with executablePath: ${executablePath}`);
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

  private async checkBlocked(page: Page, status?: number) {
    const title = await page.title();
    if (status === 403 || title.includes('Just a moment')) {
      throw new Error('Jumia blocked request (Cloudflare)');
    }
  }

  /**
   * Public method to parse a product element for testing.
   * @param $el Cheerio element
   * @returns Product or null
   */
  public parseProduct($el: cheerio.Cheerio<Element>): Product | null {
    try {
      const name = $el.find('.name').text().trim();
      const relativeUrl = $el.find('.core').attr('href');
      const url = relativeUrl
        ? relativeUrl.startsWith('http')
          ? relativeUrl
          : this.baseUrl + relativeUrl
        : '';
      const imageUrl =
        $el.find('.img').attr('data-src') || $el.find('.img').attr('src') || '';
      const currentPriceStr = $el
        .find('.prc')
        .first()
        .text()
        .replace(/[^\d.]/g, '');
      const currentPrice = parseFloat(currentPriceStr);
      const previousPriceStr = $el
        .find('.old')
        .first()
        .text()
        .replace(/[^\d.]/g, '');
      const previousPrice = previousPriceStr
        ? parseFloat(previousPriceStr)
        : null;
      const discount = $el.find('.bdg._dsct').text().trim() || null;

      const isOutOfStock =
        $el.hasClass('out-of-stock') ||
        $el.find('.out-of-stock').length > 0 ||
        $el.text().includes('Out of Stock');

      const sku =
        $el.find('.core').attr('data-sku') ||
        url.split('/').pop()?.split('.').shift() ||
        'unknown';

      return {
        product_id: sku,
        product_name: name,
        product_category: 'Home | Jumia',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice || 0,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Jumia Egypt',
        discounts_offers: discount,
        availability_status: isOutOfStock ? 'Out of Stock' : 'In Stock',
        location_city: 'Cairo',
        last_updated_utc: new Date().toISOString(),
      };
    } catch (e) {
      return null;
    }
  }

  protected normalize($: unknown): Product {
    const cheerioApi = $ as cheerio.CheerioAPI;
    const name = cheerioApi('h1').first().text().trim();
    const currentPrice =
      parseFloat(
        cheerioApi('.prc')
          .first()
          .text()
          .replace(/[^\d.]/g, ''),
      ) || 0;
    const previousPriceStr = cheerioApi('.old')
      .first()
      .text()
      .replace(/[^\d.]/g, '');
    const previousPrice = previousPriceStr
      ? parseFloat(previousPriceStr)
      : null;
    const imageUrl =
      cheerioApi('.img-c img').first().attr('data-src') ||
      cheerioApi('.img-c img').first().attr('src') ||
      '';
    const brand =
      cheerioApi('.--df.-i-ctr.-pvs a').first().text().trim() || 'Unknown';
    const categories: string[] = [];
    cheerioApi('.brdcms a').each((_, el) => {
      categories.push(cheerioApi(el).text().trim());
    });

    const oos =
      cheerioApi('.-oos').length > 0 || cheerioApi('.out-of-stock').length > 0;

    const sku = cheerioApi('[data-sku]').first().attr('data-sku') || '';

    return {
      product_id: sku,
      product_name: name,
      product_category: categories.join(' | '),
      brand_name: brand,
      product_url: '',
      current_price_egp: currentPrice,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Jumia Egypt',
      discounts_offers: cheerioApi('.bdg._dsct').first().text().trim() || null,
      availability_status: oos ? 'Out of Stock' : 'In Stock',
      location_city: 'Cairo',
      last_updated_utc: new Date().toISOString(),
    };
  }
}
