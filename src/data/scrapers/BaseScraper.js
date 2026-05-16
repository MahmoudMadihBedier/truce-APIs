"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseScraper = void 0;
/**
 * Abstract base class for all scrapers
 */
class BaseScraper {
    constructor(config = {}) {
        this.config = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            maxRetries: 3,
            baseDelayMs: 2000,
            ...config,
        };
    }
    /**
     * Executes a task with retry logic
     * @param task The task to execute
     */
    async withRetry(task) {
        let lastError;
        for (let i = 0; i < (this.config.maxRetries || 3); i++) {
            try {
                if (i > 0) {
                    const delay = (this.config.baseDelayMs || 2000) * Math.pow(2, i) +
                        Math.random() * 1000;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    console.log(`Retry attempt ${i}...`);
                }
                return await task();
            }
            catch (error) {
                lastError = error;
                console.warn(`Attempt ${i + 1} failed:`, error instanceof Error ? error.message : error);
            }
        }
        throw lastError;
    }
}
exports.BaseScraper = BaseScraper;
