import { NoonScraper } from '../src/data/scrapers/noon/NoonScraper';

describe('NoonScraper', () => {
  it('should be defined', () => {
    const scraper = new NoonScraper();
    expect(scraper).toBeDefined();
  });
});
