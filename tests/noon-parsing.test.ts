import * as cheerio from 'cheerio';
import { NoonScraper } from '../src/data/scrapers/noon/NoonScraper';

describe('NoonScraper Parsing', () => {
  const scraper = new NoonScraper();

  it('should correctly parse a Noon search result element', () => {
    const mockHtml = `
      <div class="productContainer">
        <a href="/p/B09XYZ">
          <div data-qa="product-name">Test Noon Product</div>
          <img src="https://m.media-noon.com/test.jpg" />
          <div class="amount">500</div>
          <div class="oldPrice">700</div>
          <div class="discount">29% off</div>
        </a>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const $el = $('.productContainer').first();

    const product = scraper.parseProduct($el);

    expect(product).toBeDefined();
    expect(product?.product_name).toBe('Test Noon Product');
    expect(product?.current_price_egp).toBe(500);
    expect(product?.previous_price_egp).toBe(700);
    expect(product?.discounts_offers).toBe('29% off');
    expect(product?.availability_status).toBe('In Stock');
  });

  it('should handle Noon out of stock', () => {
    const mockHtml = `
      <div class="productContainer">
        <div data-qa="product-name">OOS Product</div>
        <div class="amount">100</div>
        <div class="outOfStock">Out of Stock</div>
        <a href="/oos"></a>
      </div>
    `;
    const $ = cheerio.load(mockHtml);
    const $el = $('.productContainer').first();

    const product = scraper.parseProduct($el);
    expect(product?.availability_status).toBe('Out of Stock');
  });
});
