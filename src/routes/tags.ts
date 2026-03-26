// ============================================================
// Tags Routes — /api/tags
// ============================================================

import { Hono } from "hono";
import { parsePeriod } from "../lib/utils";
import { getTagsSummary } from "../services/tag.service";
import { resolveTenant } from "../services/tenant.service";
import type { AppEnv } from "../types";

const tagsRoutes = new Hono<AppEnv>();

tagsRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const period = c.req.query("period") || "30d";
  const limit = Math.min(
    100,
    Math.max(1, parseInt(c.req.query("limit") || "50", 10)),
  );

  const tenantIdInternal = await resolveTenant(c.env.DB, tenantId);
  if (!tenantIdInternal) return c.json({ error: "Tenant not found" }, 404);

  const parsed = parsePeriod(period);
  if (!parsed) {
    return c.json(
      { error: "Invalid period. Use 24h, 7d, 30d, 90d, or all" },
      400,
    );
  }

  const { totalUniqueTags, tags } = await getTagsSummary(c.env.DB, {
    tenantId: tenantIdInternal,
    since: parsed.since,
    limit,
  });

  return c.json({
    period,
    limit,
    totalUniqueTags,
    tags,
  });
});

export { tagsRoutes };
