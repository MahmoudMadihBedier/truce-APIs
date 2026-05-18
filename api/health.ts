import '../src/core/environment';
import { VercelRequest, VercelResponse } from '@vercel/node';
import chromium from '@sparticuz/chromium';
import * as fs from 'fs';
import { getRedisClient } from '../src/core/redis';

/**
 * Basic health check with Redis connectivity and Chromium environment verification.
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

  const redis = getRedisClient();
  let chromiumPath = 'unknown';
  try {
    chromiumPath = await chromium.executablePath();
  } catch (err) {
    chromiumPath = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const listDir = (p: string) => {
    try {
      return fs.existsSync(p) ? fs.readdirSync(p) : `missing: ${p}`;
    } catch (e) {
      return `error: ${String(e)}`;
    }
  };

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: redisStatus,
    redis_status: redis.status,
    chromium_path: chromiumPath,
    tmp_contents: listDir('/tmp'),
    tmp_al2_lib: listDir('/tmp/al2/lib'),
    tmp_al2023_lib: listDir('/tmp/al2023/lib'),
    libnss3_al2023: fs.existsSync('/tmp/al2023/lib/libnss3.so'),
    libnss3_al2: fs.existsSync('/tmp/al2/lib/libnss3.so'),
    tmp_chromium_exists: fs.existsSync('/tmp/chromium'),
    ld_library_path: process.env.LD_LIBRARY_PATH || 'not_set',
    aws_execution_env: process.env.AWS_EXECUTION_ENV || 'not_set',
    vercel_env: process.env.VERCEL || 'not_set',
    env: process.env.NODE_ENV,
    url: process.env.REDIS_URL ? 'configured' : (process.env.KV_URL ? 'kv_configured' : 'missing'),
    auth_configured: !!process.env.SCRAPE_SECRET,
    auth_secret_length: process.env.SCRAPE_SECRET?.length || 0
  });
};
