import { createHmac, timingSafeEqual } from "node:crypto";
const lifetime = 7 * 24 * 60 * 60;
function sign(value: string) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET_MISSING");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`customer-package:v1:${value}`).digest("base64url");
}
export function createPackageToken(invoiceId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id: invoiceId, exp: Math.floor(now / 1000) + lifetime })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readPackageToken(token: string, now = Date.now()): string | null {
  if (token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (extra || !payload || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature || "")) return null;
  const expected = Buffer.from(sign(payload)), actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    const seconds = Math.floor(now / 1000);
    return typeof data.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(data.id) && Number.isInteger(data.exp) && data.exp > seconds && data.exp <= seconds + lifetime ? data.id : null;
  } catch { return null; }
}
export function packageOrigin() {
  const value = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("INVALID_APP_ORIGIN");
  return url.origin;
}
