# Egypt Store Scraper API

Production-ready REST API that scrapes product data from **Jumia Egypt**, **Amazon Egypt**, **Carrefour Egypt**, and **Noon Egypt**, and tracks live **USD/EGP** and **gold prices** in EGP.

- **Backend:** TypeScript / Node.js
- **Platform:** Vercel (Serverless Functions)
- **Database:** Redis (Upstash)
- **Scraping:** Playwright-core + ScraperAPI

---

## Base URL

```
https://<your-deployment>.vercel.app
```

---

## Endpoints

### `GET /api/rates` — Market Rates (Public)

Returns the latest USD/EGP exchange rate and gold price in EGP.  
Rates are updated automatically every time a scrape run is triggered.  
**No authentication required.**

**Response:**
```json
{
  "usd_to_egp": 49.75,
  "gold_per_gram_egp": 7842.50,
  "gold_per_oz_egp": 243950.00,
  "last_updated_utc": "2026-05-29T10:00:00.000Z"
}
```

**Example:**
```bash
curl https://<your-deployment>.vercel.app/api/rates
```

---

### `GET /api/products` — Search & Filter Products

Search products stored in the database with optional filters. Supports Arabic and English.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `product_name` | string | Search by name keyword (Arabic supported) |
| `brand_name` | string | Filter by brand |
| `category` | string | Filter by category (e.g. `Electronics`) |
| `store_name` | string | Filter by store (e.g. `Jumia Egypt`) |
| `product_url` | string | Real-time scrape a single product URL |
| `page` | number | Page number (default: `1`) |
| `limit` | number | Results per page (default: `50`) |

**Response:**
```json
{
  "products": [
    {
      "sr_no": 1,
      "product_id": "B0CXJ2K9LM",
      "product_name": "Samsung Galaxy S24",
      "product_category": "Electronics",
      "brand_name": "Samsung",
      "product_url": "https://www.amazon.eg/dp/B0CXJ2K9LM",
      "current_price_egp": 24999,
      "previous_price_egp": 27999,
      "product_image_url": "https://...",
      "store_name": "Amazon Egypt",
      "discounts_offers": "11% off",
      "availability_status": "In Stock",
      "location_city": null,
      "last_updated_utc": "2026-05-29T10:00:00.000Z"
    }
  ],
  "total_count": 120,
  "timestamp": "2026-05-29T10:01:00.000Z"
}
```

**Examples:**
```bash
# Search by name (English)
curl "https://<your-deployment>.vercel.app/api/products?product_name=samsung"

# Search by name (Arabic)
curl "https://<your-deployment>.vercel.app/api/products?product_name=قهوة"

# Filter by store
curl "https://<your-deployment>.vercel.app/api/products?store_name=Jumia+Egypt"

# Filter by category
curl "https://<your-deployment>.vercel.app/api/products?category=Electronics"

# Filter by brand with pagination
curl "https://<your-deployment>.vercel.app/api/products?brand_name=apple&page=2&limit=20"

# Real-time scrape a single product URL
curl "https://<your-deployment>.vercel.app/api/products?product_url=https://www.jumia.com.eg/..."
```

---

### `GET /api/all-products` — All Products

Returns all products in the database, ordered by most recently updated.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: `1`) |
| `limit` | number | Results per page (default: `100`, max: `1000`) |

**Response:**
```json
{
  "products": [...],
  "total_count": 5000,
  "page": 1,
  "limit": 100,
  "timestamp": "2026-05-29T10:01:00.000Z"
}
```

**Examples:**
```bash
# First page of all products
curl "https://<your-deployment>.vercel.app/api/all-products"

# Page 3, 50 items per page
curl "https://<your-deployment>.vercel.app/api/all-products?page=3&limit=50"
```

---

### `POST /api/scrape` — Trigger Full Market Scrape (Protected)

Triggers a full market-wide data refresh across all 4 stores and 8 categories (32 tasks total).  
Also fetches fresh USD/EGP and gold rates at the start of each run.  
Runs in the background — responds immediately with `202 Accepted`.

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `x-scrape-secret` | Yes | Must match the `SCRAPE_SECRET` environment variable |

**Response:**
```json
{
  "message": "Scrape orchestration started",
  "status": "accepted",
  "timestamp": "2026-05-29T10:00:00.000Z"
}
```

**Example:**
```bash
curl -X POST https://<your-deployment>.vercel.app/api/scrape \
     -H "x-scrape-secret: your_secret_here"
```

---

### `GET /api/health` — Health Check

Checks Redis connectivity, Chromium setup, and environment configuration.

**Example:**
```bash
curl https://<your-deployment>.vercel.app/api/health
```

---

## Environment Variables

Set these in your **Vercel Project Settings → Environment Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection string (`rediss://...` for TLS) |
| `SCRAPE_SECRET` | Yes | Secret token to protect `POST /api/scrape` |
| `METAL_PRICE_API_KEY` | Yes | API key for [metalpriceapi.com](https://metalpriceapi.com) |
| `SCRAPER_API_KEY` | Recommended | ScraperAPI key for bypassing IP blocks |
| `WEBHOOK_URL` | Optional | URL to notify when a scrape cycle completes |

---

## Scraped Categories

All 4 stores are scraped across these 8 categories:

| Category | Jumia | Amazon | Carrefour | Noon |
|----------|-------|--------|-----------|------|
| Electronics | ✅ | ✅ | ✅ | ✅ |
| Food & Drinks | ✅ | ✅ | ✅ | ✅ |
| Fashion | ✅ | ✅ | ✅ | ✅ |
| Home Furniture | ✅ | ✅ | ✅ | ✅ |
| Beauty & Health | ✅ | ✅ | ✅ | ✅ |
| Baby & Toys | ✅ | ✅ | ✅ | ✅ |
| Sports & Outdoors | ✅ | ✅ | ✅ | ✅ |
| Automotive | ✅ | ✅ | ✅ | ✅ |

---

## Automated Scraping (GitHub Actions)

The scraper runs automatically every 12 hours via GitHub Actions.

1. Go to **Settings → Secrets and variables → Actions** in your GitHub repo.
2. Add these repository secrets:
   - `API_BASE_URL` — your Vercel deployment URL (e.g. `https://my-app.vercel.app`)
   - `SCRAPE_SECRET` — same value as your Vercel `SCRAPE_SECRET`

Workflow file: `.github/workflows/daily-scrape.yml`

---

## Development

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Run locally (http://localhost:3000)
npm run dev

# Run tests
npm test
```
