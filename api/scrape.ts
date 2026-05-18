import '../src/core/environment';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import { RedisProductRepository } from '../src/data/repositories/RedisProductRepository';
import { ScraperOrchestrator } from '../src/core/ScraperOrchestrator';

/**
 * Main orchestration endpoint.
 * Triggers a market-wide data refresh using Vercel's waitUntil to manage the background task lifecycle.
 * @param req VercelRequest
 * @param res VercelResponse
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = req.headers['x-scrape-secret'];
  const expectedSecret = process.env.SCRAPE_SECRET?.trim();

  if (!expectedSecret || secret !== expectedSecret) {
    console.warn('Unauthorized scrape attempt or SCRAPE_SECRET not configured');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const repository = new RedisProductRepository();
    const orchestrator = new ScraperOrchestrator(repository);

    // Detect the current base URL from the request to ensure sub-tasks hit the correct deployment
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const currentBaseUrl = `${protocol}://${host}`;

    // Using Vercel's waitUntil to ensure the background orchestration task
    // finishes even after the HTTP response is sent.
    waitUntil(
      orchestrator.runAll(currentBaseUrl).catch((err) => {
        console.error('Market-wide scrape failed:', err);
      }),
    );

    res.status(202).json({
      message: 'Scrape orchestration started',
      status: 'accepted',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Orchestration trigger failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
