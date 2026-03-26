// ============================================================
// Utility Helpers
// ============================================================

export function generateSlug(length = 7): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i]! % chars.length]!;
  }
  return result;
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function parseUserAgent(ua: string): {
  deviceType: string;
  browser: string;
  os: string;
} {
  const lowerUa = ua.toLowerCase();

  // Device type
  let deviceType = "desktop";
  if (/tablet|ipad|playbook|silk/i.test(ua)) deviceType = "tablet";
  else if (
    /mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)
  )
    deviceType = "mobile";

  // Browser
  let browser = "Unknown";
  if (lowerUa.includes("firefox") && !lowerUa.includes("seamonkey"))
    browser = "Firefox";
  else if (lowerUa.includes("edg/")) browser = "Edge";
  else if (lowerUa.includes("opr/") || lowerUa.includes("opera"))
    browser = "Opera";
  else if (lowerUa.includes("chrome") && !lowerUa.includes("chromium"))
    browser = "Chrome";
  else if (lowerUa.includes("safari") && !lowerUa.includes("chrome"))
    browser = "Safari";
  else if (lowerUa.includes("trident")) browser = "IE";

  // OS
  let os = "Unknown";
  if (lowerUa.includes("windows")) os = "Windows";
  else if (lowerUa.includes("mac os")) os = "macOS";
  else if (lowerUa.includes("linux")) os = "Linux";
  else if (lowerUa.includes("android")) os = "Android";
  else if (lowerUa.includes("iphone") || lowerUa.includes("ipad")) os = "iOS";

  return { deviceType, browser, os };
}

export function normalizeTags(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    throw new Error("tags must be an array of strings");
  }

  const normalized = new Set<string>();
  for (const rawTag of input) {
    if (typeof rawTag !== "string") {
      throw new Error("tags must contain only strings");
    }

    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;

    if (!/^[a-z0-9_:.-]{1,64}$/.test(tag)) {
      throw new Error(
        "each tag must be 1-64 chars using lowercase letters, numbers, dash, underscore, colon, or dot",
      );
    }

    normalized.add(tag);
  }

  if (normalized.size > 20) {
    throw new Error("maximum 20 tags per link");
  }

  return [...normalized];
}

/**
 * Known app patterns in User-Agent strings.
 * Used to infer the referrer when the Referer header is missing
 * (e.g. links opened from WhatsApp, Telegram, etc.).
 */
const APP_UA_PATTERNS: [RegExp, string][] = [
  [/whatsapp/i, "WhatsApp"],
  [/telegram/i, "Telegram"],
  [/FBAN|FBIOS|FB_IAB|FBAV|facebookexternalhit/i, "Facebook"],
  [/instagram/i, "Instagram"],
  [/twitter|twitterbot/i, "Twitter"],
  [/linkedinbot|linkedin/i, "LinkedIn"],
  [/discordbot|discord/i, "Discord"],
  [/slackbot|slack/i, "Slack"],
  [/snapchat/i, "Snapchat"],
  [/pinterest/i, "Pinterest"],
  [/redditbot|reddit/i, "Reddit"],
  [/viber/i, "Viber"],
  [/line\//i, "LINE"],
  [/kakaotalk/i, "KakaoTalk"],
  [/wechat|micromessenger/i, "WeChat"],
];

/**
 * Infer the traffic source from the Referer header or User-Agent.
 * Many mobile/desktop apps (WhatsApp, Telegram, etc.) strip the Referer
 * header when opening links. This function falls back to detecting the
 * app from the User-Agent string.
 */
export function inferReferrer(
  refererHeader: string,
  userAgent: string,
): string {
  // If we already have a valid referer, return it as-is
  if (refererHeader) return refererHeader;

  // Try to detect app from User-Agent
  for (const [pattern, appName] of APP_UA_PATTERNS) {
    if (pattern.test(userAgent)) {
      return appName;
    }
  }

  return "";
}

/**
 * Parse a period string (24h, 7d, 30d, 90d, all) into a "since" timestamp.
 * Returns `null` if the period string is invalid.
 */
export function parsePeriod(period: string): { since: number } | null {
  const now = Date.now();
  switch (period) {
    case "24h":
      return { since: now - 24 * 60 * 60 * 1000 };
    case "7d":
      return { since: now - 7 * 24 * 60 * 60 * 1000 };
    case "30d":
      return { since: now - 30 * 24 * 60 * 60 * 1000 };
    case "90d":
      return { since: now - 90 * 24 * 60 * 60 * 1000 };
    case "all":
      return { since: 0 };
    default:
      return null;
  }
}
