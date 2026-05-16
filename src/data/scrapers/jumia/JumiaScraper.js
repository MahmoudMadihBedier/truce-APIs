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
exports.JumiaScraper = void 0;
const chromium_min_1 = __importDefault(require("@sparticuz/chromium-min"));
const playwright_core_1 = require("playwright-core");
const cheerio = __importStar(require("cheerio"));
const BaseScraper_1 = require("../BaseScraper");
/**
 * Scraper for Jumia Egypt using Playwright
 */
class JumiaScraper extends BaseScraper_1.BaseScraper {
    constructor() {
        super(...arguments);
        this.baseUrl = 'https://www.jumia.com.eg';
    }
    /**
     * Scrapes Jumia search results or category pages
     * @param category Category path or search query
     * @returns List of scraped products
     */
    async scrape(category = '/all-products/') {
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
                    .waitForSelector('.prd._fb.col.c-prd', { timeout: 15000 })
                    .catch(() => { });
                const content = await page.content();
                const $ = cheerio.load(content);
                const products = [];
                $('.prd._fb.col.c-prd').each((_, el) => {
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
        if (status === 403 || title.includes('Just a moment')) {
            throw new Error('Jumia blocked request (Cloudflare)');
        }
    }
    /**
     * Public method to parse a product element for testing.
     * @param $el Cheerio element
     * @returns Product or null
     */
    parseProduct($el) {
        try {
            const name = $el.find('.name').text().trim();
            const relativeUrl = $el.find('.core').attr('href');
            const url = relativeUrl
                ? relativeUrl.startsWith('http')
                    ? relativeUrl
                    : this.baseUrl + relativeUrl
                : '';
            const imageUrl = $el.find('.img').attr('data-src') || $el.find('.img').attr('src') || '';
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
            const isOutOfStock = $el.hasClass('out-of-stock') ||
                $el.find('.out-of-stock').length > 0 ||
                $el.text().includes('Out of Stock');
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
                availability_status: isOutOfStock ? 'Out of Stock' : 'In Stock',
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
        const name = cheerioApi('h1').first().text().trim();
        const currentPrice = parseFloat(cheerioApi('.prc')
            .first()
            .text()
            .replace(/[^\d.]/g, '')) || 0;
        const previousPriceStr = cheerioApi('.old')
            .first()
            .text()
            .replace(/[^\d.]/g, '');
        const previousPrice = previousPriceStr
            ? parseFloat(previousPriceStr)
            : null;
        const imageUrl = cheerioApi('.img-c img').first().attr('data-src') ||
            cheerioApi('.img-c img').first().attr('src') ||
            '';
        const brand = cheerioApi('.--df.-i-ctr.-pvs a').first().text().trim() || 'Unknown';
        const categories = [];
        cheerioApi('.brdcms a').each((_, el) => {
            categories.push(cheerioApi(el).text().trim());
        });
        const oos = cheerioApi('.-oos').length > 0 || cheerioApi('.out-of-stock').length > 0;
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
            availability_status: oos ? 'Out of Stock' : 'In Stock',
            location_city: 'Cairo',
            last_updated_utc: new Date().toISOString(),
        };
    }
}
exports.JumiaScraper = JumiaScraper;
