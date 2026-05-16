import Redis from 'ioredis';

let redisInstance: Redis | null = null;

/**
 * Provides a singleton Redis connection to prevent connection leaks.
 * @returns Redis instance
 */
export const getRedisClient = (): Redis => {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is missing');
    }

    redisInstance = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisInstance.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }
  return redisInstance;
};
