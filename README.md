# Egypt Store Scraper API

Production-ready API that scrapes product data from Jumia Egypt, Amazon Egypt, Carrefour Egypt, and Noon Egypt.

## Architecture

- **Backend:** TypeScript / Node.js
- **Platform:** Vercel (Serverless Functions)
- **Database:** Redis (Upstash recommended)
- **Scraping:** Playwright-core (Chromium) with Anti-blocking measures

## API Endpoints

### GET `/api/products`

Search and filter products in the unified database.

**Query Parameters:**
- `product_name`: Search by product name keyword. (Supports Arabic prefix stripping and bilingual terms)
- `brand_name`: Filter by brand.
- `category`: Filter by category.
- `store_name`: Filter by store name (e.g., "Amazon Egypt").
- `product_url`: Scrape a single URL in real-time.
- `page`: Pagination page (default: 1).
- `limit`: Results per page (default: 50).

### GET `/api/all-products`

Retrieve all products stored in the database.

**Query Parameters:**
- `page`: Pagination page (default: 1).
- `limit`: Results per page (default: 100, max: 1000).

### POST `/api/scrape`

Trigger a market-wide data refresh. Runs in the background using Vercel's `waitUntil` and an orchestrator-worker pattern to bypass platform timeouts.

**Headers:**
- `x-scrape-secret`: Must match `SCRAPE_SECRET` environment variable.

### GET `/api/health`

Diagnostic check for Redis connectivity and Chromium environment setup.

## Automating Daily Updates (GitHub Actions)

The scraper is automated to refresh every 12 hours via GitHub Actions.

1.  Go to your GitHub Repository **Settings** > **Secrets and variables** > **Actions**.
2.  Add the following **Repository secrets**:
    - `API_BASE_URL`: Your Vercel deployment URL (e.g., `https://my-app.vercel.app`).
    - `SCRAPE_SECRET`: The same secret string used in your Vercel `SCRAPE_SECRET` environment variable.

The workflow file is located at `.github/workflows/daily-scrape.yml`.

## Environment Variables

- `REDIS_URL`: Redis connection string (`rediss://...` for TLS).
- `SCRAPE_SECRET`: Secret token for authorizing `/api/scrape`.
- `PROXY_URL`: (Optional) Proxy URL for enhanced anti-blocking.
- `WEBHOOK_URL`: (Optional) URL to notify when a full scrape cycle completes.

## Testing Guide

### 1. Verify Deployment Health
```bash
curl https://your-app.vercel.app/api/health
```

### 2. Trigger Full Scrape
```bash
curl -X POST https://your-app.vercel.app/api/scrape \
     -H "x-scrape-secret: your_secret_here"
```

### 3. Search Products (Arabic Support)
```bash
# Search for coffee
curl "https://your-app.vercel.app/api/products?product_name=قهوة"
```

### 4. Real-time Scrape
```bash
curl "https://your-app.vercel.app/api/products?product_url=https://www.amazon.eg/dp/B0..."
```

### 5. Get All Products
```bash
curl "https://your-app.vercel.app/api/all-products?limit=10"
```

## Development

- **Run locally:** `npm run dev`
- **Run tests:** `npm test`
- **Install Playwright:** `npx playwright install chromium`
