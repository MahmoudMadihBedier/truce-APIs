import { JumiaScraper } from '../data/scrapers/jumia/JumiaScraper';
import { AmazonScraper } from '../data/scrapers/amazon/AmazonScraper';
import { CarrefourScraper } from '../data/scrapers/carrefour/CarrefourScraper';
import { NoonScraper } from '../data/scrapers/noon/NoonScraper';
import { IProductRepository } from '../domain/repositories/IProductRepository';

/**
 * Service to orchestrate the scraping process
 */
export class ScraperOrchestrator {
  constructor(private repository: IProductRepository) {}

  /**
   * Runs all scrapers and saves results to the repository
   */
  async runAll(): Promise<void> {
    const scrapers = [
      new JumiaScraper(),
      new AmazonScraper(),
      new CarrefourScraper(),
      new NoonScraper(),
    ];

    await Promise.all(
      scrapers.map(async (scraper) => {
        try {
          const products = await scraper.scrape();
          await this.repository.saveAll(products);
        } catch (error) {
          console.error(`Error in scraper:`, error);
        }
      }),
    );
  }
}
