// ============================================================
// mnhl.me — URL Shortener Worker (Entry Point)
// ============================================================

import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AnalyticsEvent, AppEnv, Bindings } from "./types";

// Middleware
import { apiCors } from "./middleware/cors";
import { hmacAuthMiddleware } from "./middleware/hmac-auth";

// Routes
import { linksRoutes } from "./routes/links";
import { publicRoutes } from "./routes/public";
import { shortenRoutes } from "./routes/shorten";
import { statsRoutes } from "./routes/stats";
// Note: link-specific stats (GET /api/links/:slug/stats) live in linksRoutes
import { tagsRoutes } from "./routes/tags";

// Queue
import { handleAnalyticsQueue } from "./queue/analytics-consumer";

// ============================================================
// App Setup
// ============================================================

const app = new Hono<AppEnv>();

// --- Global Middleware ---
app.use("*", secureHeaders());
app.use("/api/*", apiCors);

// --- Protected API sub-router ---
const api = new Hono<AppEnv>();
api.use("*", hmacAuthMiddleware);
api.route("/links", linksRoutes);
api.route("/tags", tagsRoutes);
api.route("/stats", statsRoutes);

// --- Mount routes ---
app.route("/api", api);
app.route("/", shortenRoutes);
app.route("/", publicRoutes);

// --- Fallback ---
app.notFound((c) => c.redirect("https://manhali.com", 301));

// ============================================================
// Worker Export
// ============================================================

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<AnalyticsEvent>, env: Bindings) {
    await handleAnalyticsQueue(batch, env);
  },
};
