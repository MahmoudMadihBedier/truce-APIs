import * as cheerio from 'cheerio';
import { AmazonScraper } from '../src/data/scrapers/amazon/AmazonScraper';

describe('AmazonScraper Parsing', () => {
  const scraper = new AmazonScraper();

  it('should correctly parse an Amazon search result element', () => {
    const mockHtml = `
      <div data-component-type="s-search-result">
        <div class="s-item-container">
          <h2><a href="/dp/B09XYZ"><span>Test Amazon Product</span></a></h2>
          <img class="s-image" src="https://m.media-amazon.com/test.jpg" />
          <span class="a-price-whole">500</span>
          <span class="a-price-fraction">50</span>
          <span class="a-price a-text-price"><span class="a-offscreen">EGP 700</span></span>
        </div>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const $el = $('[data-component-type="s-search-result"]').first();

    const product = scraper.parseProduct($el);

    expect(product).toBeDefined();
    expect(product?.product_name).toBe('Test Amazon Product');
    expect(product?.current_price_egp).toBe(500.5);
    expect(product?.previous_price_egp).toBe(700);
    expect(product?.availability_status).toBe('In Stock');
  });

  it('should handle Amazon out of stock', () => {
    const mockHtml = `
      <div data-component-type="s-search-result">
        <div class="s-item-container">
           <span>Test Amazon Product</span>
           <span class="a-color-price">Currently unavailable</span>
           <a href="/dp/B09XYZ"></a>
        </div>
      </div>
    `;
    const $ = cheerio.load(mockHtml);
    const $el = $('[data-component-type="s-search-result"]').first();

    const product = scraper.parseProduct($el);
    expect(product?.availability_status).toBe('Out of Stock');
  });
});
