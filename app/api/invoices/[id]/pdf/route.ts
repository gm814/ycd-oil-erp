import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canViewInvoice } from "@/lib/rbac";
import { invoicePdfHtml, invoicePdfInclude } from "@/lib/invoice-pdf";

import { readPackageToken } from "@/lib/customer-package-token";
import { customerPackageHtml } from "@/lib/customer-package-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bound simultaneous renderer memory usage on the small trial instance.
let rendering = false;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const bundle = query.get("bundle") === "1";
  const token = query.get("token");
  const signed = bundle && !!token && readPackageToken(token) === id;
  const session = signed ? null : await getSession();
  if (!signed && (!session || session.mustChangePassword)) return new Response("يرجى تسجيل الدخول أو طلب رابط جديد من المركز", { status: 401, headers });
  if (!signed && (!session?.branchId || !canViewInvoice(session.permissions))) return new Response("غير مصرح", { status: 403, headers });
  const format = query.get("format") || "a4";
  if (format !== "a4" && format !== "epson80") return new Response("تنسيق غير صالح", { status: 400, headers });
  const invoice = await db.invoice.findFirst({ where: { id, ...(signed ? {} : { serviceOrder: { branchId: session!.branchId! } }) }, include: invoicePdfInclude });
  if (!invoice) return new Response("الفاتورة غير موجودة", { status: 404, headers });
  if (bundle && (invoice.status === "VOID" || invoice.documentType !== "INVOICE" || invoice.serviceOrder.status !== "COMPLETED")) return new Response("حزمة المستندات غير متاحة لهذه الفاتورة", { status: 409, headers });
  if (rendering) return new Response("يجري تجهيز ملف آخر. حاول مجددًا بعد لحظات.", { status: 503, headers: { ...headers, "Retry-After": "5" } });
  rendering = true;
  try {
    const logo = await readFile(path.join(process.cwd(), "public/brand/ycd-logo-source.svg"));
    const html = (bundle ? customerPackageHtml : invoicePdfHtml)(invoice, format, logo.toString("base64"));
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
    const filename = invoice.invoiceNo.replace(/[^A-Za-z0-9_-]/g, "_") + `${bundle ? "-customer-package" : ""}-${format}.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `${query.get("inline") === "1" ? "inline" : "attachment"}; filename="${filename}"` } });
  } catch {
    return new Response("تعذر تجهيز PDF. حاول مجددًا أو استخدم الطابعة.", { status: 500, headers });
  } finally { rendering = false; }
}
