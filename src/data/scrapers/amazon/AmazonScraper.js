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
exports.AmazonScraper = void 0;
const chromium_min_1 = __importDefault(require("@sparticuz/chromium-min"));
const playwright_core_1 = require("playwright-core");
const cheerio = __importStar(require("cheerio"));
const BaseScraper_1 = require("../BaseScraper");
/**
 * Scraper for Amazon Egypt using Playwright
 */
class AmazonScraper extends BaseScraper_1.BaseScraper {
    constructor() {
        super(...arguments);
        this.baseUrl = 'https://www.amazon.eg';
    }
    /**
     * Scrapes Amazon search results
     * @param category Search query or category path
     * @returns List of scraped products
     */
    async scrape(category = '/s?k=coffee') {
        return this.withRetry(async () => {
            let browser = null;
            try {
                browser = await this.launchBrowser();
                const context = await this.createContext(browser);
                const page = await context.newPage();
                const url = `${this.baseUrl}${category}`;
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                });
                await this.checkBlocked(page, response?.status());
                await page
                    .waitForSelector('[data-component-type="s-search-result"]', {
                    timeout: 10000,
                })
                    .catch(() => { });
                const content = await page.content();
                const $ = cheerio.load(content);
                const products = [];
                $('[data-component-type="s-search-result"]').each((_, el) => {
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
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                });
                await this.checkBlocked(page, response?.status());
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
    async checkBlocked(page, status) {
        const title = await page.title();
        const content = await page.content();
        if (status === 503 ||
            title.includes('Robot Check') ||
            content.includes('captcha')) {
            throw new Error('Amazon blocked request (Captcha/530)');
        }
    }
    /**
     * Public method to parse a product element for testing.
     * @param $el Cheerio element
     * @returns Product or null
     */
    parseProduct($el) {
        try {
            const name = $el.find('h2 span').text().trim();
            const relativeUrl = $el.find('h2 a').attr('href');
            const url = relativeUrl
                ? relativeUrl.startsWith('http')
                    ? relativeUrl
                    : this.baseUrl + relativeUrl
                : '';
            const imageUrl = $el.find('.s-image').attr('src') || '';
            const priceWhole = $el
                .find('.a-price-whole')
                .first()
                .text()
                .replace(/[^\d]/g, '');
            const priceFraction = $el
                .find('.a-price-fraction')
                .first()
                .text()
                .replace(/[^\d]/g, '');
            const currentPrice = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
            const previousPriceStr = $el
                .find('.a-price.a-text-price span.a-offscreen')
                .first()
                .text()
                .replace(/[^\d.]/g, '');
            const previousPrice = previousPriceStr
                ? parseFloat(previousPriceStr)
                : null;
            const outOfStock = $el.find('.s-item-container').text().includes('Out of Stock') ||
                $el.find('.a-color-price').text().includes('Currently unavailable');
            // Attempt to extract city from search result context
            const location = $el.find('.s-item-location').text().trim() || null;
            return {
                product_name: name,
                product_category: 'Amazon | Search Result',
                brand_name: 'Unknown',
                product_url: url,
                current_price_egp: currentPrice || 0,
                previous_price_egp: previousPrice,
                product_image_url: imageUrl,
                store_name: 'Amazon Egypt',
                discounts_offers: null,
                availability_status: outOfStock ? 'Out of Stock' : 'In Stock',
                location_city: location,
                last_updated_utc: new Date().toISOString(),
            };
        }
        catch (e) {
            return null;
        }
    }
    normalize($) {
        const cheerioApi = $;
        const name = cheerioApi('#productTitle').text().trim();
        const priceWhole = cheerioApi('.a-price-whole')
            .first()
            .text()
            .replace(/[^\d]/g, '');
        const priceFraction = cheerioApi('.a-price-fraction')
            .first()
            .text()
            .replace(/[^\d]/g, '');
        const currentPrice = parseFloat(`${priceWhole}.${priceFraction || '00'}`);
        const previousPriceStr = cheerioApi('.a-price.a-text-price span.a-offscreen')
            .first()
            .text()
            .replace(/[^\d.]/g, '');
        const previousPrice = previousPriceStr
            ? parseFloat(previousPriceStr)
            : null;
        const imageUrl = cheerioApi('#landingImage').attr('src') || '';
        const brand = cheerioApi('#bylineInfo').text().replace('Brand: ', '').trim() ||
            'Unknown';
        const availabilityText = cheerioApi('#availability')
            .text()
            .trim()
            .toLowerCase();
        let availabilityStatus = 'In Stock';
        if (availabilityText.includes('out of stock') ||
            availabilityText.includes('currently unavailable')) {
            availabilityStatus = 'Out of Stock';
        }
        else if (availabilityText.includes('pre-order')) {
            availabilityStatus = 'Pre-order';
        }
        return {
            product_name: name,
            product_category: 'Amazon',
            brand_name: brand,
            product_url: '',
            current_price_egp: currentPrice || 0,
            previous_price_egp: previousPrice,
            product_image_url: imageUrl,
            store_name: 'Amazon Egypt',
            discounts_offers: null,
            availability_status: availabilityStatus,
            location_city: null,
            last_updated_utc: new Date().toISOString(),
        };
    }
}
exports.AmazonScraper = AmazonScraper;
