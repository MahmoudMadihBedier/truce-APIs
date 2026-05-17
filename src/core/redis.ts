import Redis from 'ioredis';

let redisInstance: Redis | null = null;

/**
 * Provides a singleton Redis connection to prevent connection leaks.
 * Supports TLS for production environments like Upstash.
 * @returns Redis instance
 */
export const getRedisClient = (): Redis => {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is missing');
    }

    const options: any = {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    // Support for TLS (rediss://)
    if (redisUrl.startsWith('rediss://')) {
      options.tls = {
        rejectUnauthorized: false,
      };
    }

    redisInstance = new Redis(redisUrl, options);

    redisInstance.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }
  return redisInstance;
};
