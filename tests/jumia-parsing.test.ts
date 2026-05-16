import * as cheerio from 'cheerio';
import { JumiaScraper } from '../src/data/scrapers/jumia/JumiaScraper';

describe('JumiaScraper Parsing', () => {
  const scraper = new JumiaScraper();

  it('should correctly parse a product list page element', () => {
    const mockHtml = `
      <div class="prd _fb col c-prd">
        <a class="core" href="/test-product">
          <div class="img-c">
            <img class="img" data-src="https://test.com/image.jpg" />
          </div>
          <div class="info">
            <h3 class="name">Test Product</h3>
            <div class="prc">EGP 500</div>
            <div class="s-prc-w">
              <div class="old">EGP 700</div>
              <div class="bdg _dsct">29% off</div>
            </div>
          </div>
        </a>
      </div>
    `;

    const $ = cheerio.load(mockHtml);
    const $el = $('.prd._fb.col.c-prd').first();

    const product = scraper.parseProduct($el);

    expect(product).toBeDefined();
    expect(product?.product_name).toBe('Test Product');
    expect(product?.current_price_egp).toBe(500);
    expect(product?.previous_price_egp).toBe(700);
    expect(product?.discounts_offers).toBe('29% off');
    expect(product?.availability_status).toBe('In Stock');
  });

  it('should handle out of stock status', () => {
    const mockHtml = `
      <div class="prd _fb col c-prd out-of-stock">
        <div class="name">OOS Product</div>
        <div class="prc">EGP 100</div>
        <a class="core" href="/oos"></a>
      </div>
    `;
    const $ = cheerio.load(mockHtml);
    const $el = $('.prd._fb.col.c-prd').first();

    const product = scraper.parseProduct($el);
    expect(product?.availability_status).toBe('Out of Stock');
  });
});
