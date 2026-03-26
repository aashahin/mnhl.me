// ============================================================
// Link Service — CRUD + cache operations for links
// ============================================================

import { generateSlug } from "../lib/utils";
import type { LinkRecord } from "../types";

// ---------- Read ----------

export async function findLinkBySlug(
  db: D1Database,
  slug: string,
): Promise<LinkRecord | null> {
  return db
    .prepare(
      `SELECT l.slug, l.long_url, l.tenant_id, t.external_id AS tenant_external_id,
              l.is_active, l.expires_at, l.max_clicks, l.click_count
       FROM links l
       JOIN tenants t ON t.id = l.tenant_id
       WHERE l.slug = ?`,
    )
    .bind(slug)
    .first<LinkRecord>();
}

export async function findLinkBySlugAndTenant(
  db: D1Database,
  slug: string,
  tenantId: number,
): Promise<Record<string, unknown> | null> {
  return db
    .prepare("SELECT slug FROM links WHERE slug = ? AND tenant_id = ?")
    .bind(slug, tenantId)
    .first();
}

export async function findLinkDetailsBySlugAndTenant(
  db: D1Database,
  slug: string,
  tenantId: number,
): Promise<Record<string, unknown> | null> {
  return db
    .prepare(
      "SELECT slug, long_url, click_count, is_active, expires_at, max_clicks, created_at FROM links WHERE slug = ? AND tenant_id = ?",
    )
    .bind(slug, tenantId)
    .first();
}

// ---------- Create ----------

export interface CreateLinkParams {
  url: string;
  slug?: string;
  userId: number;
  tenantId: number;
  expiresAt?: number | null;
  maxClicks?: number | null;
}

export async function createLink(
  db: D1Database,
  params: CreateLinkParams,
): Promise<string> {
  const { url, slug, userId, tenantId, expiresAt, maxClicks } = params;

  const maxRetries = slug ? 1 : 3;
  let finalSlug: string | undefined = slug;

  for (let i = 0; i < maxRetries; i++) {
    if (!finalSlug) finalSlug = generateSlug();

    try {
      await db
        .prepare(
          `INSERT INTO links (slug, long_url, user_id, tenant_id, expires_at, max_clicks)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          finalSlug,
          url,
          userId,
          tenantId,
          expiresAt ?? null,
          maxClicks ?? null,
        )
        .run();

      return finalSlug;
    } catch (e: any) {
      if (e.message?.includes("UNIQUE constraint")) {
        if (slug) throw new SlugTakenError();
        finalSlug = undefined;
        continue;
      }
      throw e;
    }
  }

  throw new Error("Could not generate a unique slug. Please try again.");
}

// ---------- Update ----------

export interface UpdateLinkFields {
  url?: string;
  isActive?: boolean;
  expiresAt?: number | null;
  maxClicks?: number | null;
}

export async function updateLink(
  db: D1Database,
  slug: string,
  fields: UpdateLinkFields,
): Promise<void> {
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (fields.url !== undefined) {
    updates.push("long_url = ?");
    values.push(fields.url);
  }
  if (fields.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(fields.isActive ? 1 : 0);
  }
  if (fields.expiresAt !== undefined) {
    updates.push("expires_at = ?");
    values.push(fields.expiresAt);
  }
  if (fields.maxClicks !== undefined) {
    updates.push("max_clicks = ?");
    values.push(fields.maxClicks);
  }

  if (updates.length === 0) {
    throw new NoFieldsError();
  }

  updates.push("updated_at = ?");
  values.push(Math.floor(Date.now() / 1000));
  values.push(slug);

  await db
    .prepare(`UPDATE links SET ${updates.join(", ")} WHERE slug = ?`)
    .bind(...values)
    .run();
}

// ---------- Delete ----------

export async function deleteLink(
  db: D1Database,
  slug: string,
  tenantId: number,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM links WHERE slug = ? AND tenant_id = ?")
    .bind(slug, tenantId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

// ---------- List ----------

export interface ListLinksParams {
  tenantId: number;
  page: number;
  limit: number;
  sort: "clicks" | "created";
  tagFilter?: string;
}

export async function listLinks(db: D1Database, params: ListLinksParams) {
  const { tenantId, page, limit, sort, tagFilter } = params;
  const offset = (page - 1) * limit;
  const orderBy = sort === "clicks" ? "click_count DESC" : "created_at DESC";

  const tagWhere = tagFilter
    ? " AND EXISTS (SELECT 1 FROM link_tags lt WHERE lt.slug = links.slug AND lt.tenant_id = links.tenant_id AND lt.tag = ?)"
    : "";

  const listBindings = tagFilter
    ? [tenantId, tagFilter, limit, offset]
    : [tenantId, limit, offset];
  const countBindings = tagFilter ? [tenantId, tagFilter] : [tenantId];

  const [links, countResult] = await Promise.all([
    db
      .prepare(
        `SELECT slug, long_url, is_active, click_count, expires_at, max_clicks, created_at, updated_at
         FROM links WHERE tenant_id = ?${tagWhere} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      )
      .bind(...listBindings)
      .all(),
    db
      .prepare(
        `SELECT COUNT(*) as total FROM links WHERE tenant_id = ?${tagWhere}`,
      )
      .bind(...countBindings)
      .first<{ total: number }>(),
  ]);

  return {
    links: links.results as Array<{ slug: string } & Record<string, unknown>>,
    total: countResult?.total ?? 0,
  };
}

// ---------- Increment Click Count ----------

export async function incrementClickCount(
  db: D1Database,
  slug: string,
): Promise<void> {
  await db
    .prepare("UPDATE links SET click_count = click_count + 1 WHERE slug = ?")
    .bind(slug)
    .run();
}

// ---------- Cache Helpers ----------

export function buildLinkRecord(
  slug: string,
  url: string,
  tenantId: number,
  tenantExternalId: string,
  expiresAt?: number | null,
  maxClicks?: number | null,
): LinkRecord {
  return {
    slug,
    long_url: url,
    tenant_id: tenantId,
    tenant_external_id: tenantExternalId,
    is_active: 1,
    expires_at: expiresAt ?? null,
    max_clicks: maxClicks ?? null,
    click_count: 0,
  };
}

export async function cacheLinkInKV(
  kv: KVNamespace,
  slug: string,
  data: LinkRecord,
): Promise<void> {
  await kv.put(slug, JSON.stringify(data), { expirationTtl: 604800 });
}

export async function getLinkFromKV(
  kv: KVNamespace,
  slug: string,
): Promise<LinkRecord | null> {
  return kv.get(slug, "json") as Promise<LinkRecord | null>;
}

export async function invalidateLinkCache(
  kv: KVNamespace,
  slug: string,
): Promise<void> {
  await kv.delete(slug);
}

// ---------- Link Count ----------

export async function getLinkCountForTenant(
  db: D1Database,
  tenantId: number,
): Promise<{ total: number; totalClicks: number }> {
  const result = await db
    .prepare(
      "SELECT COUNT(*) as total, SUM(click_count) as total_clicks FROM links WHERE tenant_id = ?",
    )
    .bind(tenantId)
    .first<{ total: number; total_clicks: number }>();

  return {
    total: result?.total ?? 0,
    totalClicks: result?.total_clicks ?? 0,
  };
}

// ---------- Custom Errors ----------

export class SlugTakenError extends Error {
  constructor() {
    super("Slug already taken");
    this.name = "SlugTakenError";
  }
}

export class NoFieldsError extends Error {
  constructor() {
    super("No fields to update");
    this.name = "NoFieldsError";
  }
}
