import * as cheerio from 'cheerio';
import { CarrefourScraper } from '../src/data/scrapers/carrefour/CarrefourScraper';

describe('CarrefourScraper Parsing', () => {
  const scraper = new CarrefourScraper();

  it('should correctly parse a Carrefour search result element', () => {
    const mockHtml = `
      <div data-qa="product-card">
        <div data-qa="product-name">Test Carrefour Product</div>
        <a href="/p/123"></a>
        <img src="https://test.com/carrefour.jpg" />
        <div data-qa="product-price">EGP 500</div>
        <div class="css-1p20455">EGP 700</div>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const $el = $('[data-qa="product-card"]').first();

    const product = scraper.parseProduct($el);

    expect(product).toBeDefined();
    expect(product?.product_name).toBe('Test Carrefour Product');
    expect(product?.current_price_egp).toBe(500);
    expect(product?.previous_price_egp).toBe(700);
    expect(product?.availability_status).toBe('In Stock');
  });

  it('should handle Carrefour out of stock', () => {
    const mockHtml = `
      <div class="css-176f571">
        <div class="css-10n5s6n">OOS Product</div>
        <div class="css-17n6it9">EGP 100</div>
        <div class="css-1m0m2v4">Out of Stock</div>
        <a href="/oos"></a>
      </div>
    `;
    const $ = cheerio.load(mockHtml);
    const $el = $('.css-176f571').first();

    const product = scraper.parseProduct($el);
    expect(product?.availability_status).toBe('Out of Stock');
  });
});
