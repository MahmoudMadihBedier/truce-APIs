import { AmazonScraper } from '../src/data/scrapers/amazon/AmazonScraper';

describe('AmazonScraper', () => {
  it('should be defined', () => {
    const scraper = new AmazonScraper();
    expect(scraper).toBeDefined();
  });
});
