// ============================================================
// Shared Types
// ============================================================

import type { Context, Next } from "hono";

export type Bindings = {
  LINKS_KV: KVNamespace;
  ANALYTICS_QUEUE: Queue<AnalyticsEvent>;
  DB: D1Database;
  HMAC_SECRET: string;
};

export type Variables = {
  tenantId: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

export type AppContext = Context<AppEnv>;
export type AppNext = Next;

export type AnalyticsEvent = {
  slug: string;
  tenantId: string;
  country: string;
  city: string;
  ua: string;
  referrer: string;
  deviceType: string;
  browser: string;
  os: string;
  ts: number;
};

export type LinkRecord = {
  slug: string;
  long_url: string;
  tenant_id: number;
  tenant_external_id: string;
  is_active: number;
  expires_at: number | null;
  max_clicks: number | null;
  click_count: number;
};
