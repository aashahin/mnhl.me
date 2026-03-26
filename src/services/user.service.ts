// ============================================================
// User Service — DB operations for users
// ============================================================

/**
 * Upsert a user by external ID (scoped to a tenant) and return the internal D1 id.
 */
export async function upsertUser(
  db: D1Database,
  externalId: string,
  tenantId: number,
): Promise<number> {
  const record = await db
    .prepare(
      `INSERT INTO users (external_id, tenant_id) VALUES (?, ?)
       ON CONFLICT(external_id) DO UPDATE SET external_id=external_id
       RETURNING id`,
    )
    .bind(externalId, tenantId)
    .first<{ id: number }>();

  if (!record) throw new Error("Failed to resolve User ID");
  return record.id;
}
