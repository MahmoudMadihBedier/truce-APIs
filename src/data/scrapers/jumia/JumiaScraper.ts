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
    const targetUrl = `${this.baseUrl}${category}`;

    // ScraperAPI path: routes through residential IPs, bypassing the 403 that
    // Vercel's AWS IP range receives from Jumia. Jumia is server-side rendered,
    // so no JS execution (render=false) is needed — raw HTML has the products.
    const html = await this.fetchViaScraperApi(targetUrl, false);
    if (html) {
      const products = this.parseProductsFromHtml(html);
      if (products.length > 0) {
        console.log(`Jumia: got ${products.length} products via ScraperAPI`);
        return products;
      }
      console.warn('Jumia: ScraperAPI returned HTML but found no products, falling back to browser');
    }

    // Playwright fallback (may be blocked from cloud IPs without a proxy)
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        const context = await this.createContext(browser);
        await this.applyStealthToContext(context);
        const page = await context.newPage();

        const response = await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });

        // Resolve Cloudflare "Just a moment" challenge instead of throwing immediately
        await this.checkBlocked(page, response?.status());

        await page
          .waitForSelector('.prd._fb.col.c-prd', { timeout: 20000 })
          .catch(() => {});

        await this.randomDelay(1000, 2000);

        const content = await page.content();
        return this.parseProductsFromHtml(content);
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
    // Try ScraperAPI first
    const html = await this.fetchViaScraperApi(url, false);
    if (html) {
      const $ = cheerio.load(html);
      const product = this.normalize($);
      product.product_url = url;
      if (product.product_name) {
        console.log(`Jumia: scraped product via ScraperAPI: ${product.product_name}`);
        return product;
      }
    }

    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        const context = await this.createContext(browser);
        await this.applyStealthToContext(context);
        const page = await context.newPage();

        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await this.checkBlocked(page, response?.status());
        await page.waitForSelector('.prc', { timeout: 10000 }).catch(() => {});

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

  private parseProductsFromHtml(html: string): Product[] {
    const $ = cheerio.load(html);
    const products: Product[] = [];
    $('.prd._fb.col.c-prd').each((_, el) => {
      const product = this.parseProduct($(el));
      if (product && product.product_name) products.push(product);
    });
    return products;
  }

  private async launchBrowser(): Promise<Browser> {
    this.setupEnvironment();
    const executablePath = await chromium.executablePath();
    console.log(`Launching Jumia browser with executablePath: ${executablePath}`);

    const args = [
      ...chromium.args,
      '--disable-http2',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
    ];

    return await playwright.launch({
      args,
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
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Upgrade-Insecure-Requests': '1',
        'Sec-CH-UA':
          '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
      },
    });
  }

  /**
   * Injects scripts before any page JS runs to mask automation signals.
   */
  private async applyStealthToContext(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
      if (!(window as any).chrome) {
        (window as any).chrome = {
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        };
      }
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const ps = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ];
          (ps as any).refresh = function () {};
          return ps;
        },
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'ar'],
      });
    });
  }

  /**
   * Detects blocking. For Cloudflare's "Just a moment" JS challenge, waits up to
   * 20s for it to auto-resolve rather than throwing immediately.
   */
  private async checkBlocked(page: Page, status?: number): Promise<void> {
    if (status === 403) {
      throw new Error('Jumia blocked request (403 Forbidden)');
    }
    const title = await page.title();
    if (title.includes('Just a moment')) {
      console.log('Cloudflare challenge detected on Jumia, waiting up to 20s for resolution...');
      try {
        await page.waitForFunction(
          () => !document.title.includes('Just a moment'),
          { timeout: 20000, polling: 500 },
        );
        console.log('Cloudflare challenge resolved on Jumia.');
      } catch {
        throw new Error('Jumia blocked: Cloudflare challenge did not resolve within timeout');
      }
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
