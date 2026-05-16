import chromium from '@sparticuz/chromium-min';
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
 * Scraper for Noon Egypt using Playwright
 */
export class NoonScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.noon.com/egypt-en';

  /**
   * Scrapes Noon search results
   * @param category Search query or category path
   */
  async scrape(category = '/egypt-en/electronics/'): Promise<Product[]> {
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

        if (response?.status() === 403) {
          throw new Error('Noon blocked request (403)');
        }

        await page
          .waitForSelector('.productContainer', { timeout: 10000 })
          .catch(() => {});

        const content = await page.content();
        const $ = cheerio.load(content);
        const products: Product[] = [];

        $('.productContainer').each((_, el) => {
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
        if (response?.status() === 403) {
          throw new Error('Noon blocked request (403)');
        }

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
    return await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
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

  private parseProduct($el: cheerio.Cheerio<Element>): Product | null {
    try {
      const name = $el.find('[data-qa="product-name"]').text().trim();
      const relativeUrl = $el.find('a').attr('href');
      const url = relativeUrl
        ? relativeUrl.startsWith('http')
          ? relativeUrl
          : `https://www.noon.com${relativeUrl}`
        : '';
      const imageUrl = $el.find('img').attr('src') || '';

      const currentPrice =
        parseFloat(
          $el
            .find('.amount')
            .first()
            .text()
            .replace(/[^\d.]/g, ''),
        ) || 0;
      const previousPriceStr = $el
        .find('.oldPrice')
        .first()
        .text()
        .replace(/[^\d.]/g, '');
      const previousPrice = previousPriceStr
        ? parseFloat(previousPriceStr)
        : null;

      const isOos =
        $el.find('.outOfStock').length > 0 ||
        $el.text().includes('Out of Stock');

      return {
        product_name: name,
        product_category: 'Noon | Category',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Noon Egypt',
        discounts_offers: $el.find('.discount').text().trim() || null,
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
    const name = cheerioApi('h1').first().text().trim();
    const currentPrice =
      parseFloat(
        cheerioApi('.priceNow .amount')
          .first()
          .text()
          .replace(/[^\d.]/g, ''),
      ) || 0;
    const previousPriceStr = cheerioApi('.priceWas .amount')
      .first()
      .text()
      .replace(/[^\d.]/g, '');
    const previousPrice = previousPriceStr
      ? parseFloat(previousPriceStr)
      : null;
    const imageUrl = cheerioApi('.productImage img').first().attr('src') || '';

    const brand = cheerioApi('.brand').first().text().trim() || 'Unknown';
    const isOos = cheerioApi('.outOfStock').length > 0;

    return {
      product_name: name,
      product_category: 'Noon',
      brand_name: brand,
      product_url: '',
      current_price_egp: currentPrice,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Noon Egypt',
      discounts_offers: null,
      availability_status: isOos ? 'Out of Stock' : 'In Stock',
      location_city: 'Cairo',
      last_updated_utc: new Date().toISOString(),
    };
  }
}
