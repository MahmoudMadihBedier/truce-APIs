"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const RedisProductRepository_1 = require("./data/repositories/RedisProductRepository");
const ScraperOrchestrator_1 = require("./core/ScraperOrchestrator");
dotenv_1.default.config();
/**
 * Main entry point for local execution.
 */
async function main() {
    console.log('Starting Egypt Store Scraper (Local Dev)...');
    const repository = new RedisProductRepository_1.RedisProductRepository();
    const orchestrator = new ScraperOrchestrator_1.ScraperOrchestrator(repository);
    try {
        await orchestrator.runAll();
        console.log('Scraping completed successfully.');
    }
    catch (err) {
        console.error('Scraping failed:', err);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
