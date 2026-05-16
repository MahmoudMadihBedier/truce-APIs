import dotenv from 'dotenv';
import { RedisProductRepository } from './data/repositories/RedisProductRepository';
import { ScraperOrchestrator } from './core/ScraperOrchestrator';

dotenv.config();

/**
 * Main entry point for local execution.
 */
async function main() {
  console.log('Starting Egypt Store Scraper (Local Dev)...');

  const repository = new RedisProductRepository();
  const orchestrator = new ScraperOrchestrator(repository);

  try {
    await orchestrator.runAll();
    console.log('Scraping completed successfully.');
  } catch (err) {
    console.error('Scraping failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
