// ============================================================
// Queue Consumer — Analytics Batch Writer
// ============================================================

import type { AnalyticsEvent, Bindings } from "../types";

export async function handleAnalyticsQueue(
  batch: MessageBatch<AnalyticsEvent>,
  env: Bindings,
): Promise<void> {
  if (batch.messages.length === 0) return;

  // Pre-resolve all unique tenant IDs (external cuid2 → internal D1 id)
  const tenantCache = new Map<string, number>();
  const uniqueTenantIds = [
    ...new Set(batch.messages.map((m) => m.body.tenantId)),
  ];

  for (const extId of uniqueTenantIds) {
    const record = await env.DB.prepare(
      "SELECT id FROM tenants WHERE external_id = ?",
    )
      .bind(extId)
      .first<{ id: number }>();

    if (record) tenantCache.set(extId, record.id);
  }

  const stmt = env.DB.prepare(`
    INSERT INTO analytics (slug, tenant_id, country, city, user_agent, referrer, device_type, browser, os, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batchOps = [];

  for (const msg of batch.messages) {
    const {
      slug,
      tenantId,
      country,
      city,
      ua,
      referrer,
      deviceType,
      browser,
      os,
      ts,
    } = msg.body;
    const tenantIdInternal = tenantCache.get(tenantId);

    if (!tenantIdInternal) {
      console.warn(`Skipping analytics for unresolvable tenant: ${tenantId}`);
      continue;
    }

    batchOps.push(
      stmt.bind(
        slug,
        tenantIdInternal,
        country,
        city,
        ua,
        referrer,
        deviceType,
        browser,
        os,
        ts,
      ),
    );
  }

  if (batchOps.length === 0) {
    batch.ackAll();
    return;
  }

  try {
    await env.DB.batch(batchOps);
    batch.ackAll();
  } catch (e) {
    console.error("Batch Analytics Failed:", e);
    throw e; // Triggers Cloudflare's automatic retry
  }
}
