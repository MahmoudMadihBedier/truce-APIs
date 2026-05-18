import * as fs from 'fs';

/**
 * Utility to fix environment detection for @sparticuz/chromium on Vercel.
 * Also handles cleanup of inconsistent /tmp states to force re-extraction.
 */
export function fixChromiumEnvironment(): void {
  if (process.env.VERCEL) {
    // 1. Force detection as Lambda node20 to target AL2023 libraries
    const forcedEnv = 'AWS_Lambda_nodejs20.x';
    if (process.env.AWS_EXECUTION_ENV !== forcedEnv) {
      console.log(`Environment: Forcing AWS_EXECUTION_ENV to "${forcedEnv}"`);
      process.env.AWS_EXECUTION_ENV = forcedEnv;
    }

    // 2. Detect and fix stale/inconsistent extraction state.
    // If /tmp/chromium exists but libnss3.so is missing, the extraction was partial.
    // Deleting /tmp/chromium forces @sparticuz/chromium to re-extract everything.
    const binPath = '/tmp/chromium';
    const libPath = '/tmp/al2023/lib/libnss3.so';

    if (fs.existsSync(binPath) && !fs.existsSync(libPath)) {
      console.warn('Environment: Inconsistent Chromium state detected. Forcing re-extraction...');
      try {
        fs.unlinkSync(binPath);
      } catch (e) {
        console.error('Environment: Failed to delete stale chromium binary', e);
      }
    }

    // 3. Configure LD_LIBRARY_PATH
    const paths = ['/tmp/al2/lib', '/tmp/al2023/lib'];
    let currentPath = process.env.LD_LIBRARY_PATH || '';
    const parts = currentPath.split(':').filter(Boolean);

    for (const p of paths) {
      if (!parts.includes(p)) {
        parts.unshift(p);
      }
    }

    process.env.LD_LIBRARY_PATH = parts.join(':');
    process.env.FONTCONFIG_PATH = '/tmp/fonts';

    console.log(`Environment: LD_LIBRARY_PATH=${process.env.LD_LIBRARY_PATH}`);
  }
}

// Execute immediately upon import
fixChromiumEnvironment();
