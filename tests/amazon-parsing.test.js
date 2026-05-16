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
const AmazonScraper_1 = require("../src/data/scrapers/amazon/AmazonScraper");
describe('AmazonScraper Parsing', () => {
    const scraper = new AmazonScraper_1.AmazonScraper();
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
