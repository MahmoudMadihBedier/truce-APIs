import { chromium, Browser } from 'playwright-core';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { BaseScraper } from '../BaseScraper';
import { Product } from '@/domain/entities/Product';

/**
 * Scraper for Amazon Egypt using Playwright
 */
export class AmazonScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.amazon.eg';

  async scrape(category = '/s?k=coffee'): Promise<Product[]> {
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
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        if (
          response?.status() === 503 ||
          (await page.title()).includes('Robot Check') ||
          (await page.content()).includes('captcha')
        ) {
          throw new Error('Amazon blocked request (Captcha/530)');
        }

        // Wait for some results to be visible
        await page
          .waitForSelector('[data-component-type="s-search-result"]', {
            timeout: 15000,
          })
          .catch(() => {});

        const content = await page.content();
        const $ = cheerio.load(content);
        const products: Product[] = [];

        $('[data-component-type="s-search-result"]').each((_, el) => {
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

        if (
          (await page.title()).includes('Robot Check') ||
          content.includes('captcha')
        ) {
          throw new Error('Amazon blocked request (Captcha)');
        }

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
      const nameEl = $el.find('h2 span');
      const name = nameEl.text().trim();
      const relativeUrl = $el.find('h2 a').attr('href');
      const url = relativeUrl
        ? relativeUrl.startsWith('http')
          ? relativeUrl
          : this.baseUrl + relativeUrl
        : '';
      const imageUrl = $el.find('.s-image').attr('src') || '';

      const priceWhole = $el
        .find('.a-price-whole')
        .first()
        .text()
        .replace(/[^\d]/g, '');
      const priceFraction = $el
        .find('.a-price-fraction')
        .first()
        .text()
        .replace(/[^\d]/g, '');
      const currentPrice = parseFloat(`${priceWhole}.${priceFraction || '00'}`);

      const previousPriceStr = $el
        .find('.a-price.a-text-price span.a-offscreen')
        .first()
        .text()
        .replace(/[^\d.]/g, '');
      const previousPrice = previousPriceStr
        ? parseFloat(previousPriceStr)
        : null;

      return {
        product_name: name,
        product_category: 'Amazon | Search Result',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice || 0,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Amazon Egypt',
        discounts_offers: null,
        availability_status: 'In Stock',
        location_city: null,
        last_updated_utc: new Date().toISOString(),
      };
    } catch (e) {
      return null;
    }
  }

  protected normalize($: unknown): Product {
    const cheerioApi = $ as cheerio.CheerioAPI;
    const name = cheerioApi('#productTitle').text().trim();

    const priceWhole = cheerioApi('.a-price-whole')
      .first()
      .text()
      .replace(/[^\d]/g, '');
    const priceFraction = cheerioApi('.a-price-fraction')
      .first()
      .text()
      .replace(/[^\d]/g, '');
    const currentPrice = parseFloat(`${priceWhole}.${priceFraction || '00'}`);

    const previousPriceStr = cheerioApi(
      '.a-price.a-text-price span.a-offscreen',
    )
      .first()
      .text()
      .replace(/[^\d.]/g, '');
    const previousPrice = previousPriceStr
      ? parseFloat(previousPriceStr)
      : null;

    const imageUrl = cheerioApi('#landingImage').attr('src') || '';
    const brand =
      cheerioApi('#bylineInfo').text().replace('Brand: ', '').trim() ||
      'Unknown';

    return {
      product_name: name,
      product_category: 'Amazon',
      brand_name: brand,
      product_url: '',
      current_price_egp: currentPrice || 0,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Amazon Egypt',
      discounts_offers: null,
      availability_status: 'In Stock',
      location_city: null,
      last_updated_utc: new Date().toISOString(),
    };
  }
}
