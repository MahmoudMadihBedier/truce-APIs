import axios from 'axios';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { MarketRatesService } from '../services/MarketRatesService';

/**
 * Service to orchestrate the scraping process across multiple stores and categories.
 * Distributes work via HTTP calls to Vercel API tasks to stay within execution limits.
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
    {
      name: 'Home Furniture',
      paths: {
        amazon: '/s?k=furniture',
        jumia: '/home-office/',
        noon: '/egypt-en/home-kitchen/',
        carrefour: '/mafegy/en/c/FEGY1400000',
      },
    },
    {
      name: 'Beauty & Health',
      paths: {
        amazon: '/s?k=beauty',
        jumia: '/health-beauty/',
        noon: '/egypt-en/beauty-health/',
        carrefour: '/mafegy/en/c/FEGY1100000',
      },
    },
    {
      name: 'Baby & Toys',
      paths: {
        amazon: '/s?k=toys',
        jumia: '/baby-products/',
        noon: '/egypt-en/baby-toys/',
        carrefour: '/mafegy/en/c/FEGY1300000',
      },
    },
    {
      name: 'Sports & Outdoors',
      paths: {
        amazon: '/s?k=sports',
        jumia: '/sporting-goods/',
        noon: '/egypt-en/sports-outdoors/',
        carrefour: '/mafegy/en/c/FEGY1700000',
      },
    },
    {
      name: 'Automotive',
      paths: {
        amazon: '/s?k=automotive',
        jumia: '/automobile/',
        noon: '/egypt-en/automotive/',
        carrefour: '/mafegy/en/c/FEGY1800000',
      },
    },
  ];

  constructor(private repository: IProductRepository) {}

  /**
   * Triggers granular scraping tasks for all stores and categories.
   * @param overrideBaseUrl Optional URL to use for sub-tasks (e.g. from request headers)
   */
  async runAll(overrideBaseUrl?: string): Promise<void> {
    const stores = ['jumia', 'amazon', 'carrefour', 'noon'];

    // Priority: 1. Manual override, 2. System VERCEL_URL, 3. Localhost
    let baseUrl = overrideBaseUrl || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Ensure we don't have trailing slashes
    baseUrl = baseUrl.replace(/\/$/, '');

    // Fetch and store market rates (USD/EGP + gold) at the start of each scrape run
    try {
      const ratesService = new MarketRatesService();
      await ratesService.fetchAndStore();
    } catch (err) {
      console.error('Failed to fetch market rates:', (err as Error).message);
    }

    const tasks: Promise<void>[] = [];

    for (const category of this.categories) {
      for (const store of stores) {
        const path = (category.paths as Record<string, string>)[store];
        if (!path) continue;

        // Trigger tasks in parallel to avoid orchestrator timeout
        const task = axios
          .post(
            `${baseUrl}/api/scrape-task`,
            {
              store,
              category_path: path,
              category_name: category.name,
            },
            {
              headers: {
                'x-scrape-secret': process.env.SCRAPE_SECRET,
              },
            },
          )
          .then(() => {
            console.log(`Triggered task for ${store} in ${category.name}`);
          })
          .catch((err) => {
            console.error(
              `Failed to trigger task for ${store} in ${category.name}:`,
              err.message,
            );
          });

        tasks.push(task);
      }
    }

    // Wait for all trigger requests to be sent before finishing orchestration
    const results = await Promise.allSettled(tasks);

    // Call webhook if configured
    await this.notifyWebhook(results);
  }

  /**
   * Notifies the configured webhook about the scrape completion.
   * @param results Results of the scrape tasks
   */
  private async notifyWebhook(
    results: PromiseSettledResult<void>[],
  ): Promise<void> {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    try {
      await axios.post(webhookUrl, {
        event: 'scrape_completed',
        timestamp: new Date().toISOString(),
        summary: {
          total_tasks: results.length,
          successful,
          failed,
        },
      });
      console.log('Webhook notification sent successfully');
    } catch (err) {
      console.error(
        'Failed to send webhook notification:',
        (err as Error).message,
      );
    }
  }
}
