import { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisClient } from '../src/core/redis';

/**
 * Health check endpoint with Redis connectivity test.
 * @param req VercelRequest
 * @param res VercelResponse
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  let redisStatus = 'not_tested';

  try {
    const redis = getRedisClient();
    await redis.ping();
    redisStatus = 'connected';
  } catch (err) {
    redisStatus = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.1',
    redis: redisStatus,
    env: process.env.NODE_ENV
  });
};
