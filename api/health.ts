import { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisClient } from '../src/core/redis';

/**
 * Basic health check with Redis connectivity verification.
 */
export default async (req: VercelRequest, res: VercelResponse) => {
  let redisStatus = 'init';
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
    redis: redisStatus,
    env: process.env.NODE_ENV,
    url: process.env.REDIS_URL ? 'configured' : 'missing'
  });
};
