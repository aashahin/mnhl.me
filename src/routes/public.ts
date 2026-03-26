// ============================================================
// Public Routes — redirect and home
// ============================================================

import { Hono } from "hono";
import { inferReferrer, parseUserAgent } from "../lib/utils";
import {
  cacheLinkInKV,
  findLinkBySlug,
  getLinkFromKV,
  incrementClickCount,
} from "../services/link.service";
import type { AnalyticsEvent, AppEnv } from "../types";

const publicRoutes = new Hono<AppEnv>();

// Home → redirect to main site
publicRoutes.get("/", (c) => c.redirect("https://manhali.com", 301));

// Slug redirect
publicRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  // Reject potentially malicious slugs
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) {
    return c.redirect("https://manhali.com", 301);
  }

  // A. Try KV Cache (fastest path)
  let linkData = await getLinkFromKV(c.env.LINKS_KV, slug);

  // B. Cache miss → Check D1
  if (!linkData) {
    linkData = await findLinkBySlug(c.env.DB, slug);

    if (linkData) {
      // Refill cache (7 days TTL)
      c.executionCtx.waitUntil(cacheLinkInKV(c.env.LINKS_KV, slug, linkData));
    }
  }

  // C. Not found or inactive
  if (!linkData || !linkData.is_active) {
    return c.redirect("https://manhali.com", 301);
  }

  // D. Check expiration
  if (
    linkData.expires_at &&
    linkData.expires_at < Math.floor(Date.now() / 1000)
  ) {
    return c.redirect("https://manhali.com", 301);
  }

  // E. Check click cap
  if (linkData.max_clicks && linkData.click_count >= linkData.max_clicks) {
    return c.redirect("https://manhali.com", 301);
  }

  // F. Analytics + increment click count (non-blocking)
  const ua = c.req.header("user-agent") || "Unknown";
  const parsed = parseUserAgent(ua);

  const analyticsData: AnalyticsEvent = {
    slug,
    tenantId: linkData.tenant_external_id,
    country: c.req.header("cf-ipcountry") || "XX",
    city: (c.req.raw as any).cf?.city || "Unknown",
    ua,
    referrer: inferReferrer(c.req.header("referer") || "", ua),
    deviceType: parsed.deviceType,
    browser: parsed.browser,
    os: parsed.os,
    ts: Date.now(),
  };

  c.executionCtx.waitUntil(
    Promise.all([
      c.env.ANALYTICS_QUEUE.send(analyticsData).catch(console.error),
      incrementClickCount(c.env.DB, slug).catch(console.error),
    ]),
  );

  // G. Redirect with cache headers
  return new Response(null, {
    status: 302,
    headers: {
      Location: linkData.long_url,
      "Cache-Control": "private, max-age=0, no-cache",
      "X-Robots-Tag": "noindex",
    },
  });
});

export { publicRoutes };
