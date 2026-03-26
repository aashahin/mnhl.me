// ============================================================
// Tag Service — DB operations for link tags
// ============================================================

// ---------- Write ----------

export async function setTagsForLink(
  db: D1Database,
  slug: string,
  tenantId: number,
  tags: string[],
): Promise<void> {
  if (tags.length === 0) return;

  const stmt = db.prepare(
    "INSERT INTO link_tags (slug, tenant_id, tag) VALUES (?, ?, ?) ON CONFLICT(slug, tag) DO NOTHING",
  );
  await db.batch(tags.map((tag) => stmt.bind(slug, tenantId, tag)));
}

export async function replaceTagsForLink(
  db: D1Database,
  slug: string,
  tenantId: number,
  tags: string[],
): Promise<void> {
  // Delete existing tags
  await db
    .prepare("DELETE FROM link_tags WHERE slug = ? AND tenant_id = ?")
    .bind(slug, tenantId)
    .run();

  // Insert new tags
  if (tags.length > 0) {
    await setTagsForLink(db, slug, tenantId, tags);
  }
}

// ---------- Read ----------

export async function getTagsForLink(
  db: D1Database,
  slug: string,
  tenantId: number,
): Promise<string[]> {
  const result = await db
    .prepare(
      "SELECT tag FROM link_tags WHERE slug = ? AND tenant_id = ? ORDER BY tag ASC",
    )
    .bind(slug, tenantId)
    .all<{ tag: string }>();

  return result.results.map((row) => row.tag);
}

export async function getTagsForLinks(
  db: D1Database,
  tenantId: number,
  slugs: string[],
): Promise<Map<string, string[]>> {
  if (slugs.length === 0) return new Map();

  const placeholders = slugs.map(() => "?").join(",");
  const tagRows = await db
    .prepare(
      `SELECT slug, tag FROM link_tags WHERE tenant_id = ? AND slug IN (${placeholders}) ORDER BY tag ASC`,
    )
    .bind(tenantId, ...slugs)
    .all<{ slug: string; tag: string }>();

  const tagsBySlug = new Map<string, string[]>();
  for (const row of tagRows.results) {
    const existing = tagsBySlug.get(row.slug) ?? [];
    existing.push(row.tag);
    tagsBySlug.set(row.slug, existing);
  }

  return tagsBySlug;
}

// ---------- Tags Summary ----------

export interface TagSummaryParams {
  tenantId: number;
  since: number;
  limit: number;
}

export async function getTagsSummary(db: D1Database, params: TagSummaryParams) {
  const { tenantId, since, limit } = params;

  const [tagsByLinks, tagClicks, totalUniqueTags] = await Promise.all([
    db
      .prepare(
        `SELECT lt.tag, COUNT(DISTINCT lt.slug) as links_count
         FROM link_tags lt
         WHERE lt.tenant_id = ?
         GROUP BY lt.tag
         ORDER BY links_count DESC, lt.tag ASC
         LIMIT ?`,
      )
      .bind(tenantId, limit)
      .all<{ tag: string; links_count: number }>(),

    db
      .prepare(
        `SELECT lt.tag, COUNT(a.id) as clicks
         FROM link_tags lt
         JOIN analytics a ON a.slug = lt.slug AND a.tenant_id = lt.tenant_id
         WHERE lt.tenant_id = ? AND a.timestamp >= ?
         GROUP BY lt.tag`,
      )
      .bind(tenantId, since)
      .all<{ tag: string; clicks: number }>(),

    db
      .prepare(
        "SELECT COUNT(DISTINCT tag) as total FROM link_tags WHERE tenant_id = ?",
      )
      .bind(tenantId)
      .first<{ total: number }>(),
  ]);

  const clicksByTag = new Map<string, number>();
  for (const row of tagClicks.results) {
    clicksByTag.set(row.tag, row.clicks);
  }

  const tags = tagsByLinks.results.map((row) => ({
    tag: row.tag,
    linksCount: row.links_count,
    clicksInPeriod: clicksByTag.get(row.tag) ?? 0,
  }));

  return {
    totalUniqueTags: totalUniqueTags?.total ?? 0,
    tags,
  };
}
