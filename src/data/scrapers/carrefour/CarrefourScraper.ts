import { chromium, Browser } from 'playwright-core';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { BaseScraper } from '../BaseScraper';
import { Product } from '@/domain/entities/Product';

/**
 * Scraper for Carrefour Egypt using Playwright
 */
export class CarrefourScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.carrefouregypt.com';

  async scrape(category = '/mafegy/en/c/FEGY1000000'): Promise<Product[]> {
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
          userAgent: this.config.userAgent,
          viewport: { width: 1280, height: 720 },
        });
        const page = await context.newPage();

        const url = `${this.baseUrl}${category}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await page
          .waitForSelector('.css-176f571', { timeout: 10000 })
          .catch(() => {});

        const content = await page.content();
        const $ = cheerio.load(content);
        const products: Product[] = [];

        $('.css-176f571').each((_, el) => {
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

  async scrapeProduct(url: string): Promise<Product> {
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
          userAgent: this.config.userAgent,
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

  private parseProduct($el: cheerio.Cheerio<Element>): Product | null {
    try {
      const name = $el.find('.css-10n5s6n').text().trim();
      const relativeUrl = $el.find('a').attr('href');
      const url = relativeUrl
        ? relativeUrl.startsWith('http')
          ? relativeUrl
          : this.baseUrl + relativeUrl
        : '';
      const imageUrl = $el.find('img').attr('src') || '';

      const currentPrice =
        parseFloat(
          $el
            .find('.css-17n6it9')
            .first()
            .text()
            .replace(/[^\d.]/g, ''),
        ) || 0;
      const previousPriceStr = $el
        .find('.css-1p20455')
        .first()
        .text()
        .replace(/[^\d.]/g, '');
      const previousPrice = previousPriceStr
        ? parseFloat(previousPriceStr)
        : null;

      return {
        product_name: name,
        product_category: 'Carrefour | Supermarket',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Carrefour Egypt',
        discounts_offers: null,
        availability_status: 'In Stock',
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

    return {
      product_name: name,
      product_category: 'Carrefour',
      brand_name: 'Unknown',
      product_url: '',
      current_price_egp: currentPrice,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Carrefour Egypt',
      discounts_offers: null,
      availability_status: 'In Stock',
      location_city: 'Cairo',
      last_updated_utc: new Date().toISOString(),
    };
  }
}
