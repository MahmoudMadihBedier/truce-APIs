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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CarrefourScraper = void 0;
const chromium_min_1 = __importDefault(require("@sparticuz/chromium-min"));
const playwright_core_1 = require("playwright-core");
const cheerio = __importStar(require("cheerio"));
const BaseScraper_1 = require("../BaseScraper");
/**
 * Scraper for Carrefour Egypt using Playwright
 */
class CarrefourScraper extends BaseScraper_1.BaseScraper {
    constructor() {
        super(...arguments);
        this.baseUrl = 'https://www.carrefouregypt.com';
    }
    /**
     * Scrapes Carrefour category pages
     * @param category Category path
     * @returns List of scraped products
     */
    async scrape(category = '/mafegy/en/c/FEGY1000000') {
        return this.withRetry(async () => {
            let browser = null;
            try {
                browser = await this.launchBrowser();
                const context = await this.createContext(browser);
                const page = await context.newPage();
                const url = `${this.baseUrl}${category}`;
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                // Use more stable data attributes or generic selectors if possible
                await page
                    .waitForSelector('[data-qa="product-card"]', { timeout: 10000 })
                    .catch(() => { });
                const content = await page.content();
                const $ = cheerio.load(content);
                const products = [];
                // Try both hashed and data-qa selectors
                $('[data-qa="product-card"], .css-176f571').each((_, el) => {
                    const product = this.parseProduct($(el));
                    if (product && product.product_name) {
                        products.push(product);
                    }
                });
                return products;
            }
            finally {
                if (browser)
                    await browser.close();
            }
        });
    }
    /**
     * Scrapes a single product page
     * @param url Product URL
     * @returns Scraped product entity
     */
    async scrapeProduct(url) {
        return this.withRetry(async () => {
            let browser = null;
            try {
                browser = await this.launchBrowser();
                const context = await this.createContext(browser);
                const page = await context.newPage();
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                const content = await page.content();
                const $ = cheerio.load(content);
                const product = this.normalize($);
                product.product_url = url;
                return product;
            }
            finally {
                if (browser)
                    await browser.close();
            }
        });
    }
    async launchBrowser() {
        return await playwright_core_1.chromium.launch({
            args: chromium_min_1.default.args,
            executablePath: await chromium_min_1.default.executablePath(),
            headless: true,
            proxy: this.config.proxyUrl
                ? { server: this.config.proxyUrl }
                : undefined,
        });
    }
    async createContext(browser) {
        return await browser.newContext({
            userAgent: this.config.userAgent,
            viewport: { width: 1280, height: 720 },
        });
    }
    /**
     * Public method to parse a product element for testing.
     * @param $el Cheerio element
     * @returns Product or null
     */
    parseProduct($el) {
        try {
            const name = ($el.find('[data-qa="product-name"]').text() ||
                $el.find('.css-10n5s6n').text()).trim();
            const relativeUrl = $el.find('a').attr('href');
            const url = relativeUrl
                ? relativeUrl.startsWith('http')
                    ? relativeUrl
                    : this.baseUrl + relativeUrl
                : '';
            const imageUrl = $el.find('img').attr('src') || '';
            const priceText = $el.find('[data-qa="product-price"]').text() ||
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
            const isOos = $el.find('.css-1m0m2v4').length > 0 ||
                $el.text().includes('Out of Stock');
            return {
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
        }
        catch (e) {
            return null;
        }
    }
    normalize($) {
        const cheerioApi = $;
        const name = cheerioApi('.css-10n5s6n').first().text().trim();
        const currentPrice = parseFloat(cheerioApi('.css-17n6it9')
            .first()
            .text()
            .replace(/[^\d.]/g, '')) || 0;
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
exports.CarrefourScraper = CarrefourScraper;
