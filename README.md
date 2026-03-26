# mnhl.me — URL Shortener & Analytics Worker

A high-performance, multi-tenant URL shortening and analytics service built for the Manhali platform. It runs on Cloudflare Workers using the Hono framework, leveraging Cloudflare's edge infrastructure for minimal latency and maximum scalability.

## Architecture

The service utilizes several Cloudflare ecosystem components:
- **Cloudflare Workers:** Serverless execution at the edge (via Hono).
- **Cloudflare D1:** Serverless SQLite database for persistent storage (tenants, links, analytics, tags).
- **Cloudflare KV:** Distributed Key-Value store for edge-caching short links to ensure ultra-fast redirects.
- **Cloudflare Queues:** Asynchronous message queues used to buffer and batch analytics events (clicks) before writing them to D1, reducing database load.

## Features

- **Multi-Tenant Isolation:** Safely manages links and analytics for different tenants using `X-Tenant-Id`.
- **High-Speed Redirects:** Uses KV caching so that redirects don't hit the database in the happy path.
- **Detailed Analytics:** Tracks clicks including geographic data (Country, City), device type, OS, browser, and referrer.
- **HMAC Security:** API endpoints for link creation, management, and stats are secured via HMAC-SHA256 signatures to prevent unauthorized access.
- **Link Management:** Supports tagging, expiration dates, click caps, updating, and soft-deleting links.

## Project Structure

```text
apps/workers/mnhl.me/
├── src/
│   ├── index.ts                 # Worker entry point and router setup
│   ├── middleware/              # Global CORS and HMAC authentication
│   ├── queue/                   # Analytics consumer logic
│   ├── routes/                  # API endpoints (links, shorten, stats, tags, public)
│   ├── services/                # Database/KV business logic
│   └── types.ts                 # Shared TypeScript interfaces and Cloudflare Bindings
├── schema.sql                   # D1 database schema
├── test-endpoints.ts            # E2E test scripts demonstrating HMAC usage
├── wrangler.toml                # Cloudflare configuration
└── package.json                 # Dependencies and scripts
```

## Setup & Deployment

1. **Install Dependencies:**
   Ensure you are using Bun or npm according to the main project standard.
   ```bash
   bun install
   ```

2. **Database Initialization (D1):**
   
   **For Local Development:**
   ```bash
   npx wrangler d1 execute mnhl_shorteener --local --file=./schema.sql
   ```

   **For Production:**
   ```bash
   npx wrangler d1 execute mnhl_shorteener --remote --file=./schema.sql
   ```

3. **Configure Secrets:**
   Put your `HMAC_SECRET` into Wrangler to secure the API.
   ```bash
   npx wrangler secret put HMAC_SECRET
   ```

4. **Local Development:**
   ```bash
   bun run dev
   ```

5. **Deploy to Cloudflare:**
   ```bash
   bun run deploy
   ```

## API Overview

### 1. Public Endpoints
- `GET /` - Redirects to the main `manhali.com` site.
- `GET /:slug` - Resolves the short link. If valid, redirects to the `long_url` and dispatches an analytics event to the Queue.

### 2. Protected API Endpoints (`/api/*`)
All protected endpoints require HMAC Authentication. Include the following headers in every request:
- `X-Tenant-Id`: The ID of the tenant.
- `X-Timestamp`: Unix timestamp (milliseconds) of the request.
- `X-Signature`: HMAC-SHA256 signature of `${timestamp}.${method}.${path}.${body}` using the `HMAC_SECRET`.

**Link Management:**
- `POST /api/links` - Create a new short link.
- `POST /shorten` - Backward-compatible endpoint to create links.
- `GET /api/links` - List all links for the tenant (supports pagination and tag filtering).
- `PUT /api/links/:slug` - Update a link (long URL, tags, etc.).
- `DELETE /api/links/:slug` - Soft delete a link.

**Analytics & Stats:**
- `GET /api/stats` - Fetch tenant-wide analytics.
- `GET /api/tags` - Fetch tags summary.
- `GET /api/links/:slug/stats` - Fetch analytics for a specific link.

## Testing

You can test the endpoints using the provided script `test-endpoints.ts`. It includes full flows for HMAC signing, link creation, redirects, updates, and analytics fetching.

```bash
bun test-endpoints.ts
```
*(Make sure to update `HMAC_SECRET` in the script to match your local/remote secret before running.)*
