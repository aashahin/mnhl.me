const BASE_URL = "https://mnhl.me";
const HMAC_SECRET =
  "367c2e40c1614892d5672eee09103b8a027d25e10eb16da502fb7268c68e0570";
const TENANT_ID = "pat5glxx8okxsz9h5usju71e";

console.log(`Target: ${BASE_URL}`);

// --- HMAC Signing Helper ---
async function signRequest(
  method: string,
  path: string,
  body: string = "",
): Promise<{ signature: string; timestamp: string }> {
  const timestamp = String(Date.now());
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const message = `${timestamp}.${method}.${path}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));

  const signature = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { signature, timestamp };
}

async function signRequestWithTimestamp(
  method: string,
  path: string,
  timestamp: string,
  body: string = "",
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(HMAC_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const message = `${timestamp}.${method}.${path}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authHeaders(signature: string, timestamp: string) {
  return {
    "Content-Type": "application/json",
    "X-Signature": signature,
    "X-Timestamp": timestamp,
    "X-Tenant-Id": TENANT_ID,
  };
}

async function signedFetch(
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const bodyString = body ? JSON.stringify(body) : "";
  const { signature, timestamp } = await signRequest(method, path, bodyString);

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: authHeaders(signature, timestamp),
    body: bodyString || undefined,
  });
}

// 1. Test Root (Should redirect to manhali.com)
async function testRoot() {
  console.log("1. Testing GET / (Root)...");
  const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  console.log(`   Status: ${res.status}`);
  console.log(`   Location: ${res.headers.get("location")}`);
}

// 2. Test Shorten via /api/links (HMAC-protected)
async function testCreateLink() {
  console.log("\n2. Testing POST /api/links (Create Link)...");
  const payload = {
    url: "https://abdelrahman.co",
    userId: "test-user-123",
    tags: ["marketing", "campaign_2026"],
  };

  const res = await signedFetch("POST", "/api/links", payload);

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
  return data;
}

// 3. Test Redirect
async function testRedirect(slug: string) {
  console.log(`\n3. Testing GET /${slug} (Redirect)...`);
  const res = await fetch(`${BASE_URL}/${slug}`, { redirect: "manual" });
  console.log(`   Status: ${res.status}`);
  console.log(`   Location: ${res.headers.get("location")}`);
}

// 4. Test List Links
async function testListLinks() {
  console.log("\n4. Testing GET /api/links (List Links)...");
  const { signature, timestamp } = await signRequest(
    "GET",
    "/api/links?page=1&limit=10",
  );

  const res = await fetch(`${BASE_URL}/api/links?page=1&limit=10`, {
    method: "GET",
    headers: authHeaders(signature, timestamp),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", JSON.stringify(data, null, 2));
}

// 5. Test Tenant Stats
async function testStats() {
  console.log("\n5. Testing GET /api/stats (Tenant Stats)...");
  const { signature, timestamp } = await signRequest(
    "GET",
    "/api/stats?period=30d&tagsLimit=10",
  );

  const res = await fetch(`${BASE_URL}/api/stats?period=30d&tagsLimit=10`, {
    method: "GET",
    headers: authHeaders(signature, timestamp),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", JSON.stringify(data, null, 2));
}

// 5b. Test Tags Summary
async function testTagsSummary() {
  console.log("\n5b. Testing GET /api/tags (Tags Summary)...");
  const { signature, timestamp } = await signRequest(
    "GET",
    "/api/tags?period=30d&limit=20",
  );

  const res = await fetch(`${BASE_URL}/api/tags?period=30d&limit=20`, {
    method: "GET",
    headers: authHeaders(signature, timestamp),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", JSON.stringify(data, null, 2));
}

// 6. Test Link-specific Stats
async function testLinkStats(slug: string) {
  console.log(`\n6. Testing GET /api/links/${slug}/stats...`);
  const { signature, timestamp } = await signRequest(
    "GET",
    `/api/links/${slug}/stats`,
  );

  const res = await fetch(`${BASE_URL}/api/links/${slug}/stats`, {
    headers: authHeaders(signature, timestamp),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", JSON.stringify(data, null, 2));
}

// 7. Test Update Link
async function testUpdateLink(slug: string) {
  console.log(`\n7. Testing PUT /api/links/${slug} (Update)...`);
  const payload = {
    url: "https://abdelrahman.co/updated",
    tags: ["updated", "promo"],
  };

  const res = await signedFetch("PUT", `/api/links/${slug}`, payload);

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
}

// 7b. Test List Links by Tag Filter
async function testListLinksByTag(tag: string) {
  console.log(`\n7b. Testing GET /api/links with tag filter (${tag})...`);
  const path = `/api/links?page=1&limit=10&sort=clicks&tag=${encodeURIComponent(tag)}`;
  const { signature, timestamp } = await signRequest("GET", path);

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: authHeaders(signature, timestamp),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", JSON.stringify(data, null, 2));
}

// 7c. Test backward-compatible /shorten
async function testShortenCompat() {
  console.log("\n7c. Testing POST /shorten (Backward Compatibility)...");
  const payload = {
    url: "https://example.com/compat",
    userId: "test-user-compat",
    tags: ["compat"],
  };

  const bodyString = JSON.stringify(payload);
  const { signature, timestamp } = await signRequest(
    "POST",
    "/shorten",
    bodyString,
  );

  const res = await fetch(`${BASE_URL}/shorten`, {
    method: "POST",
    headers: authHeaders(signature, timestamp),
    body: bodyString,
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
  return data;
}

// 7d. Test Delete Link
async function testDeleteLink(slug: string) {
  console.log(`\n7d. Testing DELETE /api/links/${slug}...`);
  const res = await signedFetch("DELETE", `/api/links/${slug}`);
  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
}

// 7e. Verify deleted link stats returns 404
async function testDeletedLinkStats(slug: string) {
  console.log(
    `\n7e. Testing deleted link stats GET /api/links/${slug}/stats...`,
  );
  const path = `/api/links/${slug}/stats`;
  const { signature, timestamp } = await signRequest("GET", path);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: authHeaders(signature, timestamp),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
}

// 8. Negative test: missing auth headers should return 401
async function testUnauthorized() {
  console.log(
    "\n8. Negative test: POST /api/links without auth headers should return 401...",
  );
  const res = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com", userId: "u1" }),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
}

// 9. Negative test: invalid signature should return 401
async function testInvalidSignature() {
  console.log(
    "\n9. Negative test: POST /api/links with an invalid HMAC signature should return 401...",
  );
  const badHeaders = {
    "Content-Type": "application/json",
    "X-Signature": "deadbeef",
    "X-Timestamp": String(Date.now()),
    "X-Tenant-Id": TENANT_ID,
  };

  const res = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: badHeaders,
    body: JSON.stringify({ url: "https://example.com", userId: "u2" }),
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
}

// 10. Negative test: expired timestamp should return 401
async function testExpiredTimestamp() {
  console.log(
    "\n10. Negative test: POST /api/links with an expired timestamp should return 401...",
  );
  const body = JSON.stringify({ url: "https://example.com", userId: "u3" });
  const oldTimestamp = String(Date.now() - 10 * 60 * 1000);
  const signature = await signRequestWithTimestamp(
    "POST",
    "/api/links",
    oldTimestamp,
    body,
  );

  const res = await fetch(`${BASE_URL}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
      "X-Timestamp": oldTimestamp,
      "X-Tenant-Id": TENANT_ID,
    },
    body,
  });

  console.log(`   Status: ${res.status}`);
  const data = await res.json();
  console.log("   Response:", data);
}

// --- Execution Flow ---
// Start with deliberate auth failures so 401 responses are clearly expected.
(async () => {
  await testRoot();
  await testUnauthorized();
  await testInvalidSignature();
  await testExpiredTimestamp();

  const result = await testCreateLink();

  if (result?.success && result?.slug) {
    await testRedirect(result.slug);
    await testListLinks();
    await testStats();
    await testTagsSummary();
    await testLinkStats(result.slug);
    await testUpdateLink(result.slug);
    await testListLinksByTag("promo");

    const compatResult = await testShortenCompat();
    if (compatResult?.success && compatResult?.slug) {
      await testDeleteLink(compatResult.slug);
      await testDeletedLinkStats(compatResult.slug);
    }
  }

  console.log("\n--- All tests done ---");
})();
