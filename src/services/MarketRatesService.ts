import axios from 'axios';
import { getRedisClient } from '../core/redis';
import { MarketRates } from '../domain/entities/MarketRates';

const RATES_KEY = 'market:rates';
const TROY_OZ_TO_GRAMS = 31.1035;

export class MarketRatesService {
  private readonly apiKey =
    process.env.METAL_PRICE_API_KEY || 'b819b9d518eef61ac6a58d3ac63ae402';

  async fetchAndStore(): Promise<MarketRates> {
    const url = `https://api.metalpriceapi.com/v1/latest?api_key=${this.apiKey}&base=USD&currencies=EGP,XAU`;
    const { data } = await axios.get(url, { timeout: 10000 });

    if (!data.success) {
      throw new Error(`Metal Price API error: ${JSON.stringify(data)}`);
    }

    const usdToEgp: number = data.rates.EGP;
    // XAU rate = troy oz per 1 USD, so 1/XAU = USD per troy oz
    const usdPerOz = 1 / data.rates.XAU;
    const goldPerOzEgp = usdPerOz * usdToEgp;
    const goldPerGramEgp = goldPerOzEgp / TROY_OZ_TO_GRAMS;

    const rates: MarketRates = {
      usd_to_egp: parseFloat(usdToEgp.toFixed(4)),
      gold_per_gram_egp: parseFloat(goldPerGramEgp.toFixed(2)),
      gold_per_oz_egp: parseFloat(goldPerOzEgp.toFixed(2)),
      last_updated_utc: new Date().toISOString(),
    };

    const redis = getRedisClient();
    await redis.set(RATES_KEY, JSON.stringify(rates));

    console.log(
      `Market rates stored: 1 USD = ${rates.usd_to_egp} EGP, Gold/gram = ${rates.gold_per_gram_egp} EGP`,
    );

    return rates;
  }

  async getCurrent(): Promise<MarketRates | null> {
    const redis = getRedisClient();
    const data = await redis.get(RATES_KEY);
    return data ? (JSON.parse(data) as MarketRates) : null;
  }
}
