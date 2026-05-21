import chromium from '@sparticuz/chromium';
import {
  chromium as playwright,
  Browser,
  BrowserContext,
  Response,
} from 'playwright-core';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { BaseScraper } from '../BaseScraper';
import { Product } from '../../../domain/entities/Product';

/**
 * Scraper for Noon Egypt using Playwright
 */
export class NoonScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.noon.com';

  /**
   * Scrapes Noon search results
   * @param category Search query or category path
   * @returns List of scraped products
   */
  async scrape(category = '/egypt-en/electronics/'): Promise<Product[]> {
    const targetUrl = `${this.baseUrl}${category}`;

    // ScraperAPI path with render=true: Noon is a React SPA so JS must execute
    // to populate product listings. ScraperAPI handles this via headless browser
    // on residential IPs, bypassing the cloud IP blocks Vercel faces.
    const html = await this.fetchViaScraperApi(targetUrl, true);
    if (html) {
      const products = this.parseProductsFromHtml(html);
      if (products.length > 0) {
        console.log(`Noon: got ${products.length} products via ScraperAPI`);
        return products;
      }
      // ScraperAPI rendered but found no product containers — try embedded state
      const embedded = this.extractFromEmbeddedHtml(html);
      if (embedded.length > 0) {
        console.log(`Noon: got ${embedded.length} products from embedded data via ScraperAPI`);
        return embedded;
      }
      console.warn('Noon: ScraperAPI returned HTML but found no products, falling back to browser');
    }

    // Playwright fallback (may be blocked from cloud IPs without a proxy)
    return this.withRetry(async () => {
      let browser: Browser | null = null;
      try {
        browser = await this.launchBrowser();
        const context = await this.createContext(browser);
        await this.applyStealthToContext(context);
        const page = await context.newPage();

        // Capture JSON API responses that carry product listings
        const capturedApiItems: any[] = [];
        const handleResponse = async (response: Response) => {
          const url = response.url();
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('application/json')) return;
          if (!/catalog|search|product|listing|browse/i.test(url)) return;
          try {
            const body = await response.json();
            const items: any[] =
              body?.hits ||
              body?.products ||
              body?.catalog?.products ||
              body?.result?.products ||
              body?.data?.products ||
              [];
            if (items.length > 0) capturedApiItems.push(...items);
          } catch {
            // Ignore parse errors from non-product JSON
          }
        };
        page.on('response', handleResponse);

        const response = await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });

        if (response?.status() === 403) {
          throw new Error('Noon blocked request (403)');
        }

        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch {
          // Continue with whatever content is loaded
        }

        await page
          .waitForSelector('.productContainer', { timeout: 20000 })
          .catch(() => {});

        await this.randomDelay(1000, 2000);
        page.off('response', handleResponse);

        if (capturedApiItems.length > 0) {
          console.log(`Noon: captured ${capturedApiItems.length} products from API responses`);
          const products = capturedApiItems
            .map((item) => this.normalizeApiProduct(item))
            .filter((p): p is Product => p !== null && !!p.product_name);
          if (products.length > 0) return products;
        }

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
    const html = await this.fetchViaScraperApi(url, true);
    if (html) {
      const $ = cheerio.load(html);
      const product = this.normalize($);
      product.product_url = url;
      product.product_id = url.split('/').pop()?.split('?').shift() || '';
      if (product.product_name) {
        console.log(`Noon: scraped product via ScraperAPI: ${product.product_name}`);
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
        if (response?.status() === 403) {
          throw new Error('Noon blocked request (403)');
        }
        try {
          await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch {}
        await page.waitForSelector('.priceNow', { timeout: 10000 }).catch(() => {});

        const content = await page.content();
        const $ = cheerio.load(content);
        const product = this.normalize($);
        product.product_url = url;
        product.product_id = url.split('/').pop()?.split('?').shift() || '';
        return product;
      } finally {
        if (browser) await browser.close();
      }
    });
  }

  private parseProductsFromHtml(html: string): Product[] {
    const $ = cheerio.load(html);
    const products: Product[] = [];
    $('.productContainer').each((_, el) => {
      const product = this.parseProduct($(el));
      if (product && product.product_name) products.push(product);
    });
    return products;
  }

  /**
   * Tries to extract products from embedded JavaScript state objects in the HTML.
   * Noon may expose initial state via window.__INITIAL_STATE__ or Next.js __NEXT_DATA__.
   */
  private extractFromEmbeddedHtml(html: string): Product[] {
    // Try Next.js __NEXT_DATA__
    const nextMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1]);
        const pp = data?.props?.pageProps;
        const items: any[] | null =
          pp?.products ||
          pp?.data?.products ||
          pp?.initialData?.products ||
          pp?.catalog?.products ||
          null;
        if (items && Array.isArray(items) && items.length > 0) {
          return items
            .map((item: any) => this.normalizeApiProduct(item))
            .filter((p): p is Product => p !== null && !!p.product_name);
        }
      } catch {}
    }

    // Try inline window state scripts
    const stateMatch = html.match(/(?:__INITIAL_STATE__|__REDUX_STATE__|__PRELOADED_STATE__)\s*=\s*({[\s\S]*?});/);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const items: any[] | null =
          state?.catalog?.products ||
          state?.listing?.products ||
          state?.search?.products ||
          null;
        if (items && Array.isArray(items) && items.length > 0) {
          return items
            .map((item: any) => this.normalizeApiProduct(item))
            .filter((p): p is Product => p !== null && !!p.product_name);
        }
      } catch {}
    }

    return [];
  }

  private normalizeApiProduct(item: any): Product | null {
    try {
      const name = item?.name || item?.title || item?.product_name || '';
      if (!name) return null;
      const price =
        typeof item?.price === 'object'
          ? (item.price?.value ?? item.price?.now ?? item.price?.current ?? 0)
          : Number(item?.price ?? item?.salePrice ?? item?.now_price ?? 0);
      const oldPriceRaw = item?.oldPrice ?? item?.was_price ?? item?.regularPrice ?? null;
      const oldPrice =
        oldPriceRaw == null
          ? null
          : typeof oldPriceRaw === 'object'
          ? (oldPriceRaw?.value ?? null)
          : Number(oldPriceRaw);
      const imageUrl =
        item?.imageUrl ||
        item?.image_url ||
        item?.image ||
        (Array.isArray(item?.images) && item.images.length > 0 ? item.images[0] : '') ||
        '';
      const urlPath = item?.url || item?.productUrl || item?.slug || '';
      const fullUrl = urlPath.startsWith('http')
        ? urlPath
        : urlPath
        ? `${this.baseUrl}${urlPath}`
        : '';
      const productId = String(
        item?.id || item?.sku || item?.product_id || urlPath.split('/').pop()?.split('?').shift() || 'unknown',
      );
      const inStock = item?.inStock ?? item?.is_available ?? item?.available ?? true;
      return {
        product_id: productId,
        product_name: name,
        product_category: 'Noon | Category',
        brand_name: item?.brand || item?.brand_name || 'Unknown',
        product_url: fullUrl,
        current_price_egp: price || 0,
        previous_price_egp: oldPrice,
        product_image_url: imageUrl,
        store_name: 'Noon Egypt',
        discounts_offers: item?.discount || item?.promo || null,
        availability_status: inStock === false ? 'Out of Stock' : 'In Stock',
        location_city: 'Cairo',
        last_updated_utc: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async launchBrowser(): Promise<Browser> {
    this.setupEnvironment();
    const executablePath = await chromium.executablePath();
    console.log(`Launching Noon browser with executablePath: ${executablePath}`);

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
   * Parses a product element from the list page.
   * @param $el Cheerio element
   * @returns Product or null
   */
  public parseProduct($el: cheerio.Cheerio<Element>): Product | null {
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

      const productId = url.split('/').pop()?.split('?').shift() || 'unknown';

      return {
        product_id: productId,
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
      product_id: '', // Set by caller
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
