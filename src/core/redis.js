"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
let redisInstance = null;
/**
 * Provides a singleton Redis connection to prevent connection leaks.
 * @returns Redis instance
 */
const getRedisClient = () => {
    if (!redisInstance) {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            throw new Error('REDIS_URL environment variable is missing');
        }
        redisInstance = new ioredis_1.default(redisUrl, {
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
exports.getRedisClient = getRedisClient;
