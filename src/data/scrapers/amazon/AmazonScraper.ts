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
 * Scraper for Amazon Egypt using Playwright
 */
export class AmazonScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.amazon.eg';

  /**
   * Scrapes Amazon search results
   * @param category Search query or category path
   * @returns List of scraped products
   */
  async scrape(category = '/s?k=coffee'): Promise<Product[]> {
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
          .waitForSelector('[data-component-type="s-search-result"]', {
            timeout: 10000,
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
    const executablePath = await chromium.executablePath();
    console.log(`Launching Amazon browser with executablePath: ${executablePath}`);
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
    const content = await page.content();
    if (
      status === 503 ||
      title.includes('Robot Check') ||
      content.includes('captcha')
    ) {
      throw new Error('Amazon blocked request (Captcha/530)');
    }
  }

  /**
   * Public method to parse a product element for testing.
   * @param $el Cheerio element
   * @returns Product or null
   */
  public parseProduct($el: cheerio.Cheerio<Element>): Product | null {
    try {
      const name = $el.find('h2 span').text().trim();
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

      const outOfStock =
        $el.find('.s-item-container').text().includes('Out of Stock') ||
        $el.find('.a-color-price').text().includes('Currently unavailable');

      // Attempt to extract city from search result context
      const location = $el.find('.s-item-location').text().trim() || null;
      const asin = $el.attr('data-asin') || 'unknown';

      return {
        product_id: asin,
        product_name: name,
        product_category: 'Amazon | Search Result',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice || 0,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Amazon Egypt',
        discounts_offers: null,
        availability_status: outOfStock ? 'Out of Stock' : 'In Stock',
        location_city: location,
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

    const availabilityText = cheerioApi('#availability')
      .text()
      .trim()
      .toLowerCase();
    let availabilityStatus: 'In Stock' | 'Out of Stock' | 'Pre-order' =
      'In Stock';
    if (
      availabilityText.includes('out of stock') ||
      availabilityText.includes('currently unavailable')
    ) {
      availabilityStatus = 'Out of Stock';
    } else if (availabilityText.includes('pre-order')) {
      availabilityStatus = 'Pre-order';
    }

    const asin = (cheerioApi('#ASIN').val() as string) || '';

    return {
      product_id: asin,
      product_name: name,
      product_category: 'Amazon',
      brand_name: brand,
      product_url: '',
      current_price_egp: currentPrice || 0,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Amazon Egypt',
      discounts_offers: null,
      availability_status: availabilityStatus,
      location_city: null,
      last_updated_utc: new Date().toISOString(),
    };
  }
}
