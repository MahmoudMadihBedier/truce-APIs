import { JumiaScraper } from '../data/scrapers/jumia/JumiaScraper';
import { AmazonScraper } from '../data/scrapers/amazon/AmazonScraper';
import { CarrefourScraper } from '../data/scrapers/carrefour/CarrefourScraper';
import { NoonScraper } from '../data/scrapers/noon/NoonScraper';
import { IProductRepository } from '../domain/repositories/IProductRepository';

/**
 * Service to orchestrate the scraping process across multiple stores and categories.
 */
export class ScraperOrchestrator {
  private readonly categories = [
    {
      name: 'Electronics',
      paths: {
        amazon: '/s?k=electronics',
        jumia: '/electronics/',
        noon: '/egypt-en/electronics/',
        carrefour: '/mafegy/en/c/FEGY1000000',
      },
    },
    {
      name: 'Food & Drinks',
      paths: {
        amazon: '/s?k=grocery',
        jumia: '/groceries/',
        noon: '/egypt-en/grocery/',
        carrefour: '/mafegy/en/c/FEGY1600000',
      },
    },
    {
      name: 'Fashion',
      paths: {
        amazon: '/s?k=fashion',
        jumia: '/category-fashion-by-jumia/',
        noon: '/egypt-en/fashion/',
        carrefour: '/mafegy/en/c/FEGY1200000',
      },
    },
  ];

  constructor(private repository: IProductRepository) {}

  /**
   * Runs all scrapers for all predefined categories and saves results to the repository.
   */
  async runAll(): Promise<void> {
    const scrapers = [
      { instance: new JumiaScraper(), key: 'jumia' as const },
      { instance: new AmazonScraper(), key: 'amazon' as const },
      { instance: new CarrefourScraper(), key: 'carrefour' as const },
      { instance: new NoonScraper(), key: 'noon' as const },
    ];

    for (const category of this.categories) {
      console.log(`Starting scrape for category: ${category.name}`);

      await Promise.allSettled(
        scrapers.map(async ({ instance, key }) => {
          try {
            const path = category.paths[key];
            if (!path) return;

            const products = await instance.scrape(path);

            // Tag products with the high-level category
            const enrichedProducts = products.map((p) => ({
              ...p,
              product_category: `${category.name} | ${p.product_category}`,
            }));

            await this.repository.saveAll(enrichedProducts);
            console.log(
              `Saved ${enrichedProducts.length} products from ${instance.constructor.name} in ${category.name}`,
            );
          } catch (error) {
            console.error(
              `Error in ${instance.constructor.name} for ${category.name}:`,
              error,
            );
          }
        }),
      );
    }
  }
}
