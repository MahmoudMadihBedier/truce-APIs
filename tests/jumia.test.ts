import { JumiaScraper } from '../src/data/scrapers/jumia/JumiaScraper';

describe('JumiaScraper', () => {
  it('should be defined', () => {
    const scraper = new JumiaScraper();
    expect(scraper).toBeDefined();
  });
});
