import { cors } from "hono/cors";

export const apiCors = cors({
  origin: ["https://manhali.com", "https://*.manhali.com"],
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "X-Signature", "X-Timestamp", "X-Tenant-Id"],
  maxAge: 86400,
});
