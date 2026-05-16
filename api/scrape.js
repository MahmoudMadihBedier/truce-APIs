"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const functions_1 = require("@vercel/functions");
const RedisProductRepository_1 = require("../src/data/repositories/RedisProductRepository");
const ScraperOrchestrator_1 = require("../src/core/ScraperOrchestrator");
/**
 * Main orchestration endpoint.
 * Triggers a market-wide data refresh using Vercel's waitUntil to manage the background task lifecycle.
 * @param req VercelRequest
 * @param res VercelResponse
 */
exports.default = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    const secret = req.headers['x-scrape-secret'];
    if (secret !== process.env.SCRAPE_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const repository = new RedisProductRepository_1.RedisProductRepository();
        const orchestrator = new ScraperOrchestrator_1.ScraperOrchestrator(repository);
        // Using Vercel's waitUntil to ensure the background orchestration task
        // finishes even after the HTTP response is sent.
        (0, functions_1.waitUntil)(orchestrator.runAll().catch((err) => {
            console.error('Market-wide scrape failed:', err);
        }));
        res.status(202).json({
            message: 'Scrape orchestration started',
            status: 'accepted',
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Orchestration trigger failed:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
