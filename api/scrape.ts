import { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';
import { ScraperOrchestrator } from '../src/core/ScraperOrchestrator';

/**
 * Endpoint to trigger the daily scraping process.
 * Protected by a secret token.
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = req.headers['x-scrape-secret'];
  if (secret !== process.env.SCRAPE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const repository = new RedisProductRepository();
    const orchestrator = new ScraperOrchestrator(repository);

    // Fire and forget: the scraping task runs in the background.
    // Vercel's waitUntil ensures the task finishes even after the response is sent.
    waitUntil(
      orchestrator.runAll().catch((err) => {
        console.error('Background scraping failed:', err);
      }),
    );

    res.status(200).json({
      message: 'Scraping triggered successfully in background',
    });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
