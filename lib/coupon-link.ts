import { createHmac, timingSafeEqual } from "node:crypto";

function signature(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET_MISSING");
  return createHmac("sha256", secret).update(`ycd-coupon-view:v1:${payload}`).digest("base64url");
}
export function couponViewToken(serial: string) {
  const payload = Buffer.from(serial, "utf8").toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function couponSerialFromToken(token: string): string | null {
  if (token.length > 256) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = Buffer.from(signature(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const serial = Buffer.from(parts[0], "base64url").toString("utf8");
  return /^[A-Z0-9-]{6,80}$/.test(serial) ? serial : null;
}
export function couponViewUrl(serial: string) {
  const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!origin) throw new Error("APP_ORIGIN_MISSING");
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_APP_ORIGIN");
  return `${url.origin}/coupon/${couponViewToken(serial)}`;
}
// Scanners may submit either the legacy serial or the new signed card URL.
export function couponSerialFromScan(input: string) {
  const value = input.trim();
  if (/^[a-z0-9-]{6,80}$/i.test(value)) return value.toUpperCase();
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    const match = /^\/coupon\/([A-Za-z0-9_.-]+)\/?$/.exec(url.pathname);
    const serial = match && couponSerialFromToken(match[1]);
    if (serial) return serial;
  } catch { /* Untrusted scanner input never triggers a network request. */ }
  throw new Error("INVALID_INPUT");
}
