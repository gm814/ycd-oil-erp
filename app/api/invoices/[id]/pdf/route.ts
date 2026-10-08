import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { invoicePdfHtml, invoicePdfInclude } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bound simultaneous renderer memory usage on the small trial instance.
let rendering = false;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return new Response("يرجى تسجيل الدخول أولًا", { status: 401, headers });
  if (!session.branchId || !hasPermission(session.permissions, PERMISSIONS.CUSTOMER_VIEW)) return new Response("غير مصرح", { status: 403, headers });
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") || "a4";
  if (format !== "a4" && format !== "epson80") return new Response("تنسيق غير صالح", { status: 400, headers });
  const invoice = await db.invoice.findFirst({ where: { id, serviceOrder: { branchId: session.branchId } }, include: invoicePdfInclude });
  if (!invoice) return new Response("الفاتورة غير موجودة", { status: 404, headers });
  if (rendering) return new Response("يجري تجهيز ملف آخر. حاول مجددًا بعد لحظات.", { status: 503, headers: { ...headers, "Retry-After": "5" } });
  rendering = true;
  try {
    const logo = await readFile(path.join(process.cwd(), "public/brand/ycd-logo-source.svg"));
    const html = invoicePdfHtml(invoice, format, logo.toString("base64"));
    const pdf = await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(process.env.PDF_PYTHON || "python3", [path.join(process.cwd(), "scripts/render-invoice-pdf.py")], { stdio: ["pipe", "pipe", "ignore"] });
      const chunks: Buffer[] = [];
      let size = 0;
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("PDF_TIMEOUT")); }, 30000);
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { child.kill("SIGKILL"); reject(new Error("PDF_TOO_LARGE")); }
        else chunks.push(chunk);
      });
      child.on("error", error => { clearTimeout(timeout); reject(error); });
      child.on("close", code => {
        clearTimeout(timeout);
        const result = Buffer.concat(chunks);
        if (code === 0 && result.subarray(0, 5).toString() === "%PDF-") resolve(result);
        else reject(new Error("PDF_RENDER_FAILED"));
      });
      child.stdin.on("error", () => { /* close/error handlers report the renderer failure */ });
      child.stdin.end(html);
    });
    const filename = invoice.invoiceNo.replace(/[^A-Za-z0-9_-]/g, "_") + `-${format}.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch {
    return new Response("تعذر تجهيز PDF. حاول مجددًا أو استخدم الطابعة.", { status: 500, headers });
  } finally { rendering = false; }
}
