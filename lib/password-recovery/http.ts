import { NextResponse } from "next/server";
import { sameApplicationOrigin } from "@/lib/request-origin";

export const recoveryResponse = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "cache-control": "no-store, max-age=0", "referrer-policy": "no-referrer" },
});

export async function recoveryInput(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site" ||
      !sameApplicationOrigin(origin, new URL(request.url).origin, process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL)) return null;
  if (!request.headers.get("content-type")?.startsWith("application/json")) return null;
  // Bound the actual stream, not only the client-supplied Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch { return null; }
}
