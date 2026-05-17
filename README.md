# Egypt Store Scraper API

Production-ready API that scrapes product data from Jumia Egypt, Amazon Egypt, Carrefour Egypt, and Noon Egypt.

## Architecture

- **Backend:** TypeScript / Node.js
- **Platform:** Vercel (Serverless Functions)
- **Database:** Redis (Upstash recommended)
- **Scraping:** Playwright-core (Chromium)

## API Endpoints

### GET `/api/products`

Search and filter products.

**Query Parameters:**
- `product_name`: Search by product name keyword. (Supports Arabic)
- `brand_name`: Filter by brand.
- `category`: Filter by category.
- `store_name`: Filter by store name.
- `product_url`: Scrape a single URL in real-time.
- `page`: Pagination page (default: 1).
- `limit`: Results per page (default: 50).

### POST `/api/scrape`

Trigger a full daily scrape. Runs in the background using Vercel's `waitUntil`.

**Headers:**
- `x-scrape-secret`: Must match `SCRAPE_SECRET` environment variable.

### GET `/api/health`

Health check endpoint.

## Environment Variables

- `REDIS_URL`: Redis connection string (e.g., `redis://default:password@host:port`).
- `SCRAPE_SECRET`: Secret token for triggering scrapes.
- `PROXY_URL`: (Optional) Proxy URL for anti-blocking.

## Setup & Deployment

1. Install dependencies: `npm install`
2. Install Playwright browsers: `npx playwright install chromium`
3. Build: `npm run build`
4. Deploy to Vercel: `vercel`

### Important: Vercel Configuration
After deploying to Vercel, you **must** add the following environment variables in the Vercel Dashboard (Project Settings > Environment Variables):

- `REDIS_URL`: Your Redis connection string (e.g., from Upstash). If you are using Vercel KV, it will automatically provide `KV_URL` which this app also supports.
- `SCRAPE_SECRET`: A random string used to authorize the `/api/scrape` endpoint.

Without these variables, the API will return a 500 error.

## Development

- Run locally: `npm run dev`
- Run tests: `npm test`
- Lint: `npm run lint`
