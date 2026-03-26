// ============================================================
// Tenant Service — DB operations for tenants
// ============================================================

/**
 * Upsert a tenant by external ID and return the internal D1 id.
 */
export async function upsertTenant(
  db: D1Database,
  externalId: string,
): Promise<number> {
  const record = await db
    .prepare(
      `INSERT INTO tenants (external_id) VALUES (?)
       ON CONFLICT(external_id) DO UPDATE SET external_id=external_id
       RETURNING id`,
    )
    .bind(externalId)
    .first<{ id: number }>();

  if (!record) throw new Error("Failed to resolve Tenant ID");
  return record.id;
}

/**
 * Resolve an external tenant ID to the internal D1 id.
 * Returns `null` when the tenant doesn't exist yet.
 */
export async function resolveTenant(
  db: D1Database,
  externalId: string,
): Promise<number | null> {
  const record = await db
    .prepare("SELECT id FROM tenants WHERE external_id = ?")
    .bind(externalId)
    .first<{ id: number }>();

  return record?.id ?? null;
}
