"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = __importStar(require("cheerio"));
const JumiaScraper_1 = require("../src/data/scrapers/jumia/JumiaScraper");
describe('JumiaScraper Parsing', () => {
    const scraper = new JumiaScraper_1.JumiaScraper();
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
