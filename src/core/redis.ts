import Redis from 'ioredis';

let redisInstance: Redis | null = null;

/**
 * Provides a singleton Redis connection to prevent connection leaks.
 * Supports TLS for production environments like Upstash.
 * Optimized for serverless responsiveness with fast-fail settings.
 * @returns Redis instance
 */
export const getRedisClient = (): Redis => {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;

  if (!redisUrl) {
    throw new Error(
      'REDIS_URL or KV_URL environment variable is missing. Please set it in your Vercel Project Settings -> Environment Variables.',
    );
  }

  // Detect if user provided a REST URL (Upstash often gives https:// for REST APIs)
  if (redisUrl.startsWith('http')) {
    throw new Error(
      'Detected a REST URL (http/https) in REDIS_URL. This app requires the Redis Protocol URL (redis:// or rediss://). Please check your Upstash dashboard for the "Redis Connect" string.',
    );
  }

  // If instance exists but is closed, reset it
  if (redisInstance && ['closed', 'end'].includes(redisInstance.status)) {
    console.log(
      `Redis connection status is ${redisInstance.status}. Re-initializing...`,
    );
    redisInstance.disconnect();
    redisInstance = null;
  }

  if (!redisInstance) {
    const options: any = {
      maxRetriesPerRequest: 0,
      connectTimeout: 5000,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // Only retry 3 times in serverless
        return Math.min(times * 200, 1000);
      },
    };

    if (redisUrl.startsWith('rediss://')) {
      options.tls = { rejectUnauthorized: false };
    }

    console.log(
      `Initializing Redis client (TLS: ${redisUrl.startsWith('rediss://')})...`,
    );
    redisInstance = new Redis(redisUrl, options);

    redisInstance.on('error', (err) =>
      console.error('Redis Client Error:', err),
    );
    redisInstance.on('connect', () =>
      console.log('Redis connected successfully.'),
    );
  }
  return redisInstance;
};
