// ============================================================
// Stats Routes — /api/stats (tenant-level analytics)
// ============================================================

import { Hono } from "hono";
import { parsePeriod } from "../lib/utils";
import { getTenantStats } from "../services/analytics.service";
import { getLinkCountForTenant } from "../services/link.service";
import { resolveTenant } from "../services/tenant.service";
import type { AppEnv } from "../types";

const statsRoutes = new Hono<AppEnv>();

// --- Tenant Stats ---
statsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const period = c.req.query("period") || "7d";
  const slug = c.req.query("slug");
  const tagsLimit = Math.min(
    50,
    Math.max(1, parseInt(c.req.query("tagsLimit") || "10", 10)),
  );

  const tenantIdInternal = await resolveTenant(c.env.DB, tenantId);
  if (!tenantIdInternal) return c.json({ error: "Tenant not found" }, 404);

  // Parse period (default to 7d on invalid)
  const parsed = parsePeriod(period);
  const since = parsed?.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;

  const [stats, linkCount] = await Promise.all([
    getTenantStats(c.env.DB, {
      tenantId: tenantIdInternal,
      since,
      slug,
      tagsLimit,
    }),
    getLinkCountForTenant(c.env.DB, tenantIdInternal),
  ]);

  return c.json({
    period,
    tagsLimit,
    slug: slug || null,
    overview: {
      ...stats.overview,
      totalLinksCreated: linkCount.total,
      lifetimeClicks: linkCount.totalClicks,
    },
    topLinks: stats.topLinks,
    clicksByCountry: stats.clicksByCountry,
    clicksByDevice: stats.clicksByDevice,
    clicksByBrowser: stats.clicksByBrowser,
    clicksByOS: stats.clicksByOS,
    clicksOverTime: stats.clicksOverTime,
    topTags: stats.topTags,
    referrers: stats.referrers,
  });
});

export { statsRoutes };
