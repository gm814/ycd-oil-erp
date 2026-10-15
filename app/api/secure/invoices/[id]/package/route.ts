import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createPackageToken, packageOrigin } from "@/lib/customer-package-token";
import { prepareCustomerPackage } from "@/services/customer-package";
const schema = z.object({ waiveFilter: z.boolean().default(false), reason: z.string().trim().max(300).default("") }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.mustChangePassword) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    const { id } = await params;
    const result = await prepareCustomerPackage(session, id, parsed.data.waiveFilter, parsed.data.reason);
    const token = createPackageToken(id);
    return NextResponse.json({ ...result, token, url: `${packageOrigin()}/documents/${token}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? e.code : null;
    const error = code === "P2034" || code === "P2002" ? "CONCURRENT_CHANGE" : e instanceof Error ? e.message : "PACKAGE_FAILED";
    const allowed = ["FORBIDDEN", "OVERRIDE_FORBIDDEN", "INVOICE_NOT_FOUND", "INVOICE_NOT_ELIGIBLE", "OIL_REQUIRED", "RETURN_REVIEW_REQUIRED", "CONCURRENT_CHANGE"];
    return NextResponse.json({ error: allowed.includes(error) ? error : "PACKAGE_FAILED" }, { status: error.includes("FORBIDDEN") ? 403 : error === "INVOICE_NOT_FOUND" ? 404 : 409 });
  }
}
