import { CarrefourScraper } from '../src/data/scrapers/carrefour/CarrefourScraper';

describe('CarrefourScraper', () => {
  it('should be defined', () => {
    const scraper = new CarrefourScraper();
    expect(scraper).toBeDefined();
  });
});
