-- ============================================================
-- mnhl.me Short Links Schema
-- ============================================================

-- 1. Tenants Table (Multi-tenant isolation)
CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,    -- Tenant ID from main platform
    name TEXT,
    domain TEXT,                          -- Custom domain if any
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 2. Users Table (Maps your system's UserID to D1)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,     -- Your system's User ID
    tenant_id INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 3. Links Table (Persistent Storage)
CREATE TABLE IF NOT EXISTS links (
    slug TEXT PRIMARY KEY,
    long_url TEXT NOT NULL,
    user_id INTEGER,
    tenant_id INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,          -- Soft-disable links
    expires_at INTEGER,                   -- Optional expiration (unix epoch)
    max_clicks INTEGER,                   -- Optional click cap
    click_count INTEGER DEFAULT 0,        -- Denormalized click counter
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 4. Analytics Table (Raw Click Events)
CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    country TEXT,
    city TEXT,
    user_agent TEXT,
    referrer TEXT,
    device_type TEXT,                     -- mobile, tablet, desktop
    browser TEXT,                         -- Parsed browser name
    os TEXT,                              -- Parsed OS name
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 5. Link Tags Table (many tags per link)
CREATE TABLE IF NOT EXISTS link_tags (
    slug TEXT NOT NULL,
    tenant_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (slug, tag),
    FOREIGN KEY (slug) REFERENCES links(slug) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ============================================================
-- Indexes
-- ============================================================

-- Tenants
CREATE INDEX IF NOT EXISTS idx_tenants_external_id ON tenants(external_id);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_external ON users(tenant_id, external_id);

-- Links
CREATE INDEX IF NOT EXISTS idx_links_tenant_id ON links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_tenant_created ON links(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_tenant_clicks ON links(tenant_id, click_count DESC);
CREATE INDEX IF NOT EXISTS idx_links_expires_at ON links(expires_at) WHERE expires_at IS NOT NULL;

-- Link tags
CREATE INDEX IF NOT EXISTS idx_link_tags_tenant_tag ON link_tags(tenant_id, tag);
CREATE INDEX IF NOT EXISTS idx_link_tags_slug ON link_tags(slug);

-- Analytics (critical for stats queries)
CREATE INDEX IF NOT EXISTS idx_analytics_slug ON analytics(slug);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant_id ON analytics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant_timestamp ON analytics(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant_slug ON analytics(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_analytics_tenant_country ON analytics(tenant_id, country);