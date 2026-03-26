// ============================================================
// Analytics Service — Stats & reporting queries
// ============================================================

// ---------- Tenant-wide Stats ----------

export interface StatsParams {
  tenantId: number;
  since: number;
  slug?: string;
  tagsLimit: number;
}

export async function getTenantStats(db: D1Database, params: StatsParams) {
  const { tenantId, since, slug, tagsLimit } = params;

  const slugFilter = slug ? " AND a.slug = ?" : "";
  const slugBindings = slug ? [slug] : [];

  const [
    overview,
    topLinks,
    countries,
    devices,
    browsers,
    oses,
    clicksOverTime,
    tagsByLinks,
    tagsByClicks,
    referrers,
  ] = await Promise.all([
    // 1. Overview
    db
      .prepare(
        `SELECT
          COUNT(*) as total_clicks,
          COUNT(DISTINCT slug) as unique_links,
          COUNT(DISTINCT country) as unique_countries
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}`,
      )
      .bind(tenantId, since, ...slugBindings)
      .first<{
        total_clicks: number;
        unique_links: number;
        unique_countries: number;
      }>(),

    // 2. Top links by clicks
    db
      .prepare(
        `SELECT a.slug, l.long_url, COUNT(*) as clicks
         FROM analytics a
         LEFT JOIN links l ON a.slug = l.slug
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}
         GROUP BY a.slug
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all(),

    // 3. Clicks by country
    db
      .prepare(
        `SELECT country, COUNT(*) as clicks
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}
         GROUP BY country
         ORDER BY clicks DESC
         LIMIT 20`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all(),

    // 4. Clicks by device type
    db
      .prepare(
        `SELECT device_type, COUNT(*) as clicks
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}
         GROUP BY device_type
         ORDER BY clicks DESC`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all(),

    // 5. Clicks by browser
    db
      .prepare(
        `SELECT browser, COUNT(*) as clicks
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}
         GROUP BY browser
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all(),

    // 6. Clicks by OS
    db
      .prepare(
        `SELECT os, COUNT(*) as clicks
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}
         GROUP BY os
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all(),

    // 7. Clicks over time (daily buckets)
    db
      .prepare(
        `SELECT
          CAST(timestamp / 86400000 AS INTEGER) * 86400000 as day,
          COUNT(*) as clicks
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter}
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all(),

    // 8. Tags by links count
    db
      .prepare(
        `SELECT lt.tag, COUNT(DISTINCT lt.slug) as links_count
         FROM link_tags lt
         WHERE lt.tenant_id = ?${slug ? " AND lt.slug = ?" : ""}
         GROUP BY lt.tag
         ORDER BY links_count DESC, lt.tag ASC
         LIMIT ?`,
      )
      .bind(tenantId, ...(slug ? [slug] : []), tagsLimit)
      .all<{ tag: string; links_count: number }>(),

    // 9. Clicks grouped by tag
    db
      .prepare(
        `SELECT lt.tag, COUNT(a.id) as clicks
         FROM link_tags lt
         LEFT JOIN analytics a
           ON a.slug = lt.slug
          AND a.tenant_id = lt.tenant_id
          AND a.timestamp >= ?
         WHERE lt.tenant_id = ?${slug ? " AND lt.slug = ?" : ""}
         GROUP BY lt.tag
         ORDER BY clicks DESC, lt.tag ASC
         LIMIT ?`,
      )
      .bind(since, tenantId, ...(slug ? [slug] : []), tagsLimit)
      .all<{ tag: string; clicks: number }>(),

    // 10. Referrers by clicks
    db
      .prepare(
        `SELECT referrer, COUNT(*) as clicks
         FROM analytics a
         WHERE a.tenant_id = ? AND a.timestamp >= ?${slugFilter} AND a.referrer != ''
         GROUP BY referrer
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .bind(tenantId, since, ...slugBindings)
      .all<{ referrer: string; clicks: number }>(),
  ]);

  // Build tag-clicks map
  const tagClicksMap = new Map<string, number>();
  for (const row of tagsByClicks.results) {
    tagClicksMap.set(row.tag, row.clicks);
  }

  const topTags = tagsByLinks.results.map((row) => ({
    tag: row.tag,
    linksCount: row.links_count,
    clicksInPeriod: tagClicksMap.get(row.tag) ?? 0,
  }));

  return {
    overview: {
      totalClicks: overview?.total_clicks ?? 0,
      uniqueLinks: overview?.unique_links ?? 0,
      uniqueCountries: overview?.unique_countries ?? 0,
    },
    topLinks: topLinks.results,
    clicksByCountry: countries.results,
    clicksByDevice: devices.results,
    clicksByBrowser: browsers.results,
    clicksByOS: oses.results,
    clicksOverTime: clicksOverTime.results,
    topTags,
    referrers: referrers.results,
  };
}

// ---------- Single Link Stats ----------

export async function getLinkStats(
  db: D1Database,
  slug: string,
  tenantId: number,
) {
  const [recentClicks, referrers] = await Promise.all([
    db
      .prepare(
        `SELECT country, city, device_type, browser, os, referrer, timestamp
         FROM analytics
         WHERE slug = ? AND tenant_id = ?
         ORDER BY timestamp DESC
         LIMIT 50`,
      )
      .bind(slug, tenantId)
      .all(),

    db
      .prepare(
        `SELECT referrer, COUNT(*) as clicks
         FROM analytics
         WHERE slug = ? AND tenant_id = ? AND referrer != ''
         GROUP BY referrer
         ORDER BY clicks DESC
         LIMIT 10`,
      )
      .bind(slug, tenantId)
      .all(),
  ]);

  return {
    recentClicks: recentClicks.results,
    referrers: referrers.results,
  };
}
