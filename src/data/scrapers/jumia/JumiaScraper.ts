import chromium from '@sparticuz/chromium-min';
import { chromium as playwright } from 'playwright-core';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { BaseScraper } from '../BaseScraper';
import { Product } from '../../../domain/entities/Product';

/**
 * Scraper for Jumia Egypt using Playwright
 */
export class JumiaScraper extends BaseScraper {
  private readonly baseUrl = 'https://www.jumia.com.eg';

  async scrape(category = '/all-products/'): Promise<Product[]> {
    return this.withRetry(async () => {
      let browser = null;
      try {
        browser = await playwright.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });
        const page = await browser.newPage({
          userAgent: this.config.userAgent,
        });

        const url = `${this.baseUrl}${category}`;
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        if (
          response?.status() === 403 ||
          (await page.title()).includes('Just a moment')
        ) {
          throw new Error('Jumia blocked request (Cloudflare)');
        }

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

  async scrapeProduct(url: string): Promise<Product> {
    return this.withRetry(async () => {
      let browser = null;
      try {
        browser = await playwright.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });
        const page = await browser.newPage({
          userAgent: this.config.userAgent,
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const content = await page.content();

        if ((await page.title()).includes('Just a moment')) {
          throw new Error('Jumia blocked request (Cloudflare)');
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

      return {
        product_name: name,
        product_category: 'Home | Jumia',
        brand_name: 'Unknown',
        product_url: url,
        current_price_egp: currentPrice || 0,
        previous_price_egp: previousPrice,
        product_image_url: imageUrl,
        store_name: 'Jumia Egypt',
        discounts_offers: discount,
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

    return {
      product_name: name,
      product_category: categories.join(' | '),
      brand_name: brand,
      product_url: '',
      current_price_egp: currentPrice,
      previous_price_egp: previousPrice,
      product_image_url: imageUrl,
      store_name: 'Jumia Egypt',
      discounts_offers: cheerioApi('.bdg._dsct').first().text().trim() || null,
      availability_status: 'In Stock',
      location_city: 'Cairo',
      last_updated_utc: new Date().toISOString(),
    };
  }
}
