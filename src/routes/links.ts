// ============================================================
// Links Routes — /api/links CRUD
// ============================================================

import { Hono } from "hono";
import { isValidUrl, normalizeTags } from "../lib/utils";
import { getLinkStats } from "../services/analytics.service";
import {
  buildLinkRecord,
  cacheLinkInKV,
  createLink,
  deleteLink,
  findLinkBySlugAndTenant,
  findLinkDetailsBySlugAndTenant,
  invalidateLinkCache,
  listLinks,
  NoFieldsError,
  SlugTakenError,
  updateLink,
} from "../services/link.service";
import {
  getTagsForLink,
  getTagsForLinks,
  replaceTagsForLink,
  setTagsForLink,
} from "../services/tag.service";
import { resolveTenant, upsertTenant } from "../services/tenant.service";
import { upsertUser } from "../services/user.service";
import type { AppEnv } from "../types";

const linksRoutes = new Hono<AppEnv>();

// --- Create Link ---
linksRoutes.post("/", async (c) => {
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
  const tenantId = c.get("tenantId");

  // Validation
  if (!url || !isValidUrl(url)) return c.json({ error: "Invalid URL" }, 400);
  if (!userId) return c.json({ error: "userId is required" }, 400);
  if (slug && !/^[a-zA-Z0-9_-]{3,64}$/.test(slug)) {
    return c.json(
      { error: "Invalid slug: 3-64 alphanumeric, dash, or underscore chars" },
      400,
    );
  }
  if (
    expiresAt &&
    (typeof expiresAt !== "number" || expiresAt < Math.floor(Date.now() / 1000))
  ) {
    return c.json({ error: "expiresAt must be a future unix timestamp" }, 400);
  }
  if (
    maxClicks !== undefined &&
    (typeof maxClicks !== "number" || maxClicks < 1)
  ) {
    return c.json({ error: "maxClicks must be a positive integer" }, 400);
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
      shortUrl: `${new URL(c.req.url).origin}/${finalSlug}`,
      expiresAt: expiresAt ?? null,
      maxClicks: maxClicks ?? null,
      tags: normalizedTags,
    },
    201,
  );
});

// --- Update Link ---
linksRoutes.put("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tenantId = c.get("tenantId");

  let body: {
    url?: string;
    isActive?: boolean;
    expiresAt?: number | null;
    maxClicks?: number | null;
    tags?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Resolve tenant
  const tenantIdInternal = await resolveTenant(c.env.DB, tenantId);
  if (!tenantIdInternal) return c.json({ error: "Tenant not found" }, 404);

  // Verify ownership
  const link = await findLinkBySlugAndTenant(c.env.DB, slug, tenantIdInternal);
  if (!link) return c.json({ error: "Link not found" }, 404);

  // Validate URL if provided
  if (body.url !== undefined && !isValidUrl(body.url)) {
    return c.json({ error: "Invalid URL" }, 400);
  }

  // Validate tags if provided
  let normalizedTags: string[] | null = null;
  if (body.tags !== undefined) {
    try {
      normalizedTags = normalizeTags(body.tags);
    } catch (error: any) {
      return c.json({ error: error?.message || "Invalid tags" }, 400);
    }
  }

  // Update link fields
  try {
    await updateLink(c.env.DB, slug, {
      url: body.url,
      isActive: body.isActive,
      expiresAt: body.expiresAt,
      maxClicks: body.maxClicks,
    });
  } catch (e) {
    if (e instanceof NoFieldsError) {
      return c.json({ error: "No fields to update" }, 400);
    }
    throw e;
  }

  // Replace tags if provided
  if (normalizedTags !== null) {
    await replaceTagsForLink(c.env.DB, slug, tenantIdInternal, normalizedTags);
  }

  // Invalidate cache
  c.executionCtx.waitUntil(invalidateLinkCache(c.env.LINKS_KV, slug));

  return c.json({ success: true });
});

// --- Delete Link ---
linksRoutes.delete("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const tenantId = c.get("tenantId");

  const tenantIdInternal = await resolveTenant(c.env.DB, tenantId);
  if (!tenantIdInternal) return c.json({ error: "Tenant not found" }, 404);

  const deleted = await deleteLink(c.env.DB, slug, tenantIdInternal);
  if (!deleted) return c.json({ error: "Link not found" }, 404);

  c.executionCtx.waitUntil(invalidateLinkCache(c.env.LINKS_KV, slug));

  return c.json({ success: true });
});

// --- List Links ---
linksRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(c.req.query("limit") || "25", 10)),
  );
  const sort =
    c.req.query("sort") === "clicks"
      ? ("clicks" as const)
      : ("created" as const);
  const tagFilter = c.req.query("tag")?.trim().toLowerCase();

  if (tagFilter && !/^[a-z0-9_:.-]{1,64}$/.test(tagFilter)) {
    return c.json({ error: "Invalid tag filter" }, 400);
  }

  const tenantIdInternal = await resolveTenant(c.env.DB, tenantId);
  if (!tenantIdInternal) return c.json({ error: "Tenant not found" }, 404);

  const { links: linkRows, total } = await listLinks(c.env.DB, {
    tenantId: tenantIdInternal,
    page,
    limit,
    sort,
    tagFilter,
  });

  // Attach tags
  let linksWithTags = linkRows.map((link) => ({
    ...link,
    tags: [] as string[],
  }));

  if (linkRows.length > 0) {
    const slugs = linkRows.map((link) => link.slug);
    const tagsBySlug = await getTagsForLinks(c.env.DB, tenantIdInternal, slugs);

    linksWithTags = linkRows.map((link) => ({
      ...link,
      tags: tagsBySlug.get(link.slug) ?? [],
    }));
  }

  return c.json({
    links: linksWithTags,
    appliedTagFilter: tagFilter ?? null,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// --- Stats for a specific link ---
linksRoutes.get("/:slug/stats", async (c) => {
  const slug = c.req.param("slug");
  const tenantId = c.get("tenantId");

  const tenantIdInternal = await resolveTenant(c.env.DB, tenantId);
  if (!tenantIdInternal) return c.json({ error: "Tenant not found" }, 404);

  // Verify link belongs to tenant
  const link = await findLinkDetailsBySlugAndTenant(
    c.env.DB,
    slug,
    tenantIdInternal,
  );
  if (!link) return c.json({ error: "Link not found" }, 404);

  const [stats, tags] = await Promise.all([
    getLinkStats(c.env.DB, slug, tenantIdInternal),
    getTagsForLink(c.env.DB, slug, tenantIdInternal),
  ]);

  return c.json({
    link: { ...link, tags },
    recentClicks: stats.recentClicks,
    referrers: stats.referrers,
  });
});

export { linksRoutes };
