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
        await this.applyStealthToContext(context);
        const page = await context.newPage();

        const url = `${this.baseUrl}${category}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait for JS rendering to settle after initial DOM is ready
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch {
          // Continue with whatever content is already loaded
        }

        await page
          .waitForSelector('[data-qa="product-card"]', { timeout: 15000 })
          .catch(() => {});

        // Scroll to trigger any lazy-loaded content
        await page.evaluate(() => window.scrollBy(0, 1000));
        await this.randomDelay(1000, 2000);

        // Prefer structured JSON embedded by Next.js — more reliable than CSS class selectors
        const nextDataProducts = await this.extractFromNextData(page);
        if (nextDataProducts && nextDataProducts.length > 0) {
          console.log(`Carrefour: extracted ${nextDataProducts.length} products from __NEXT_DATA__`);
          return nextDataProducts;
        }

        // Fall back to HTML parsing
        const content = await page.content();
        const $ = cheerio.load(content);
        const products: Product[] = [];

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
        await this.applyStealthToContext(context);
        const page = await context.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch {}
        await page.waitForSelector('.css-10n5s6n', { timeout: 10000 }).catch(() => {});
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
    this.setupEnvironment();
    const executablePath = await chromium.executablePath();
    console.log(`Launching Carrefour browser with executablePath: ${executablePath}`);

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
   * Runs on every navigation in the context.
   */
  private async applyStealthToContext(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      // Most critical: hide webdriver flag checked by Cloudflare and other bot detectors
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
      // Headless Chrome omits window.chrome — add it so the page thinks it's a real browser
      if (!(window as any).chrome) {
        (window as any).chrome = {
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        };
      }
      // Headless Chrome has zero plugins — fake a realistic set
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
   * Attempts to extract product list from Next.js __NEXT_DATA__ script tag.
   * This is more reliable than CSS class selectors because data-qa attributes
   * and JSON keys are stable, while Emotion CSS hashes change on every deploy.
   */
  private async extractFromNextData(page: Page): Promise<Product[] | null> {
    const raw = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el || !el.textContent) return null;
      try {
        return JSON.parse(el.textContent);
      } catch {
        return null;
      }
    });

    if (!raw) return null;

    const pp = (raw as any)?.props?.pageProps;
    const items: any[] | null =
      pp?.products ||
      pp?.data?.products ||
      pp?.initialData?.categoryListing?.entities ||
      pp?.initialData?.productList?.products ||
      pp?.initialState?.productList?.products ||
      pp?.listing?.products ||
      pp?.categoryData?.products ||
      null;

    if (!items || !Array.isArray(items)) return null;

    const products: Product[] = [];
    for (const item of items) {
      const p = this.normalizeNextDataProduct(item);
      if (p && p.product_name) products.push(p);
    }
    return products.length > 0 ? products : null;
  }

  private normalizeNextDataProduct(item: any): Product | null {
    try {
      const name = item?.name || item?.title || '';
      if (!name) return null;

      const price =
        typeof item?.price === 'object'
          ? (item.price?.value ?? item.price?.current ?? 0)
          : Number(item?.price ?? item?.salePrice ?? 0);

      const oldPriceRaw = item?.oldPrice ?? item?.regularPrice ?? null;
      const oldPrice =
        oldPriceRaw == null
          ? null
          : typeof oldPriceRaw === 'object'
          ? (oldPriceRaw?.value ?? null)
          : Number(oldPriceRaw);

      const imageUrl =
        item?.imageUrl ||
        item?.image ||
        (Array.isArray(item?.images) && item.images.length > 0 ? item.images[0] : '') ||
        '';

      const urlPath = item?.url || item?.productUrl || item?.slug || '';
      const fullUrl = urlPath.startsWith('http') ? urlPath : `${this.baseUrl}${urlPath}`;
      const productId = String(
        item?.id || item?.sku || item?.productId || urlPath.split('/').pop() || 'unknown',
      );

      const inStock = item?.inStock ?? item?.isAvailable ?? true;

      return {
        product_id: productId,
        product_name: name,
        product_category: 'Carrefour | Supermarket',
        brand_name: item?.brand || item?.brandName || 'Unknown',
        product_url: fullUrl,
        current_price_egp: price || 0,
        previous_price_egp: oldPrice,
        product_image_url: imageUrl,
        store_name: 'Carrefour Egypt',
        discounts_offers: null,
        availability_status: inStock === false ? 'Out of Stock' : 'In Stock',
        location_city: 'Cairo',
        last_updated_utc: new Date().toISOString(),
      };
    } catch {
      return null;
    }
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
