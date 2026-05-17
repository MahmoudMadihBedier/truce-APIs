import Redis from 'ioredis';

let redisInstance: Redis | null = null;

/**
 * Provides a singleton Redis connection to prevent connection leaks.
 * Supports TLS for production environments like Upstash.
 * Optimized for serverless responsiveness with fast-fail settings.
 * @returns Redis instance
 */
export const getRedisClient = (): Redis => {
  if (!redisInstance) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is missing');
    }

    const options: any = {
      maxRetriesPerRequest: 0, // Fail fast in serverless to prevent timeouts
      connectTimeout: 3000,    // 3 seconds
      retryStrategy: null,     // Don't retry automatically in serverless
    };

    // Support for TLS (rediss://)
    if (redisUrl.startsWith('rediss://')) {
      options.tls = {
        rejectUnauthorized: false,
      };
    }

    console.log(
      `Initializing Redis client (TLS: ${redisUrl.startsWith('rediss://')})...`,
    );
    redisInstance = new Redis(redisUrl, options);

    redisInstance.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisInstance.on('connect', () => {
      console.log('Redis connected successfully.');
    });
  }
  return redisInstance;
};
