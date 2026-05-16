"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AmazonScraper_1 = require("../src/data/scrapers/amazon/AmazonScraper");
describe('AmazonScraper', () => {
    it('should be defined', () => {
        const scraper = new AmazonScraper_1.AmazonScraper();
        expect(scraper).toBeDefined();
    });
});
