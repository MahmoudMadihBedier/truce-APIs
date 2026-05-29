import '../src/core/environment';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { MarketRatesService } from '../src/services/MarketRatesService';

/**
 * Public endpoint that returns the latest USD/EGP exchange rate and gold price in EGP.
 * Rates are refreshed automatically each time a scrape run is triggered.
 * GET /api/rates
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const service = new MarketRatesService();
    const rates = await service.getCurrent();

    if (!rates) {
      return res.status(404).json({
        error: 'No rates available yet. Trigger a scrape run to populate them.',
      });
    }

    return res.status(200).json(rates);
  } catch (error) {
    console.error('Failed to retrieve market rates:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
