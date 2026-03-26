// ============================================================
// Shorten Route — backward-compatible POST /shorten
// ============================================================

import { Hono } from "hono";
import { isValidUrl, normalizeTags } from "../lib/utils";
import { hmacAuthMiddleware } from "../middleware/hmac-auth";
import {
  buildLinkRecord,
  cacheLinkInKV,
  createLink,
  SlugTakenError,
} from "../services/link.service";
import { setTagsForLink } from "../services/tag.service";
import { upsertTenant } from "../services/tenant.service";
import { upsertUser } from "../services/user.service";
import type { AppEnv } from "../types";

const shortenRoutes = new Hono<AppEnv>();

shortenRoutes.post("/shorten", hmacAuthMiddleware, async (c) => {
  const tenantId = c.get("tenantId");

  let body: {
    url: string;
    slug?: string;
    userId: string;
    expiresAt?: number;
    maxClicks?: number;
    tags?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { url, slug, userId, expiresAt, maxClicks, tags } = body;

  // Validation
  if (!url || !isValidUrl(url)) return c.json({ error: "Invalid URL" }, 400);
  if (!userId) return c.json({ error: "userId is required" }, 400);
  if (slug && !/^[a-zA-Z0-9_-]{3,64}$/.test(slug)) {
    return c.json({ error: "Invalid slug format" }, 400);
  }

  let normalizedTags: string[];
  try {
    normalizedTags = normalizeTags(tags);
  } catch (error: any) {
    return c.json({ error: error?.message || "Invalid tags" }, 400);
  }

  // Upsert tenant + user
  let tenantIdInternal: number;
  try {
    tenantIdInternal = await upsertTenant(c.env.DB, tenantId);
  } catch (e) {
    console.error("Tenant Upsert Error:", e);
    return c.json({ error: "Database error" }, 500);
  }

  let userIdInternal: number;
  try {
    userIdInternal = await upsertUser(c.env.DB, userId, tenantIdInternal);
  } catch (e) {
    console.error("User Upsert Error:", e);
    return c.json({ error: "Database error" }, 500);
  }

  // Create link
  let finalSlug: string;
  try {
    finalSlug = await createLink(c.env.DB, {
      url,
      slug,
      userId: userIdInternal,
      tenantId: tenantIdInternal,
      expiresAt,
      maxClicks,
    });
  } catch (e) {
    if (e instanceof SlugTakenError) {
      return c.json({ error: "Slug already taken" }, 409);
    }
    return c.json(
      { error: "Could not generate a unique slug. Please try again." },
      500,
    );
  }

  // Tags
  if (normalizedTags.length > 0) {
    await setTagsForLink(c.env.DB, finalSlug, tenantIdInternal, normalizedTags);
  }

  // Cache in KV
  const linkData = buildLinkRecord(
    finalSlug,
    url,
    tenantIdInternal,
    tenantId,
    expiresAt,
    maxClicks,
  );
  c.executionCtx.waitUntil(cacheLinkInKV(c.env.LINKS_KV, finalSlug, linkData));

  return c.json(
    {
      success: true,
      slug: finalSlug,
      short_url: `${new URL(c.req.url).origin}/${finalSlug}`,
      userId,
      tags: normalizedTags,
    },
    201,
  );
});

export { shortenRoutes };
