import type { AppContext, AppNext } from "../types";

// ============================================================
// HMAC Crypto Helpers
// ============================================================

async function computeHmac(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const message = `${timestamp}.${method}.${path}.${body}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i]! ^ bufB[i]!;
  }
  return diff === 0;
}

// ============================================================
// HMAC Auth Middleware
// ============================================================

const FIVE_MINUTES = 5 * 60 * 1000;

export const hmacAuthMiddleware = async (c: AppContext, next: AppNext) => {
  const signature = c.req.header("x-signature");
  const timestamp = c.req.header("x-timestamp");
  const tenantId = c.req.header("x-tenant-id");

  if (!signature || !timestamp || !tenantId) {
    return c.json(
      {
        error:
          "Missing required auth headers: x-signature, x-timestamp, x-tenant-id",
      },
      401,
    );
  }

  // Replay protection: reject requests older than 5 minutes
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();

  if (isNaN(requestTime) || Math.abs(now - requestTime) > FIVE_MINUTES) {
    return c.json({ error: "Request expired or invalid timestamp" }, 401);
  }

  // Read body for signature verification (empty string for GET requests)
  const body = ["GET", "HEAD", "DELETE"].includes(c.req.method)
    ? ""
    : await c.req.text();

  const url = new URL(c.req.url);
  const expectedSignature = await computeHmac(
    c.env.HMAC_SECRET,
    timestamp,
    c.req.method,
    url.pathname + url.search,
    body,
  );

  if (!timingSafeEqual(signature, expectedSignature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Attach tenant ID for downstream handlers
  c.set("tenantId", tenantId);

  await next();
};
