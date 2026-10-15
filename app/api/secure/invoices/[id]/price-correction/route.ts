import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { correctInvoicePrice } from "@/services/invoice-price-correction";
const schema = z.object({
  reason: z.string().trim().min(5).max(500),
  paymentReference: z.string().trim().min(1).max(120),
  receiptTotal: z.number().positive().max(100_000_000).refine(v=>Number.isInteger(Math.round(v*10000)/100)),
  prices: z.array(z.object({itemId:z.string().min(1),unitGross:z.number().nonnegative().max(10_000_000).refine(v=>Number.isInteger(Math.round(v*10000)/100))})).min(1).max(200),
});
export async function POST(request: Request, {params}: {params:Promise<{id:string}>}) {
  const session=await getSession();
  if(!session)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
  if(!session.branchId || ![PERMISSIONS.FINANCE_MANAGE,PERMISSIONS.INVOICE_ISSUE,PERMISSIONS.PAYMENT_RECEIVE].every(p=>hasPermission(session.permissions,p)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const data=schema.safeParse(await request.json().catch(()=>null));
  if(!data.success)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  try {
    const note=await correctInvoicePrice({...data.data,invoiceId:(await params).id,branchId:session.branchId,actorId:session.userId});
    return NextResponse.json({id:note.id,invoiceNo:note.invoiceNo},{status:201});
  } catch(error) {
    const code=error instanceof Error?error.message:"";
    const allowed=["INVOICE_NOT_FOUND","CORRECTION_EXISTS","CORRECTION_NOT_ALLOWED","RECEIPT_MISMATCH","INVALID_PRICES","PRICE_DECREASE_NOT_SUPPORTED","INVALID_CORRECTION_TOTAL","OPEN_SHIFT_REQUIRED","FINANCIAL_ACCOUNT_REQUIRED"];
    if (allowed.includes(code)) return NextResponse.json({error:code},{status:409});
    const dbCode = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
    if (dbCode === "P2034" || dbCode === "P2002") return NextResponse.json({error:"CONCURRENT_CHANGE"},{status:409});
    console.error("INVOICE_PRICE_CORRECTION_FAILED", {code:dbCode});
    return NextResponse.json({error:"CORRECTION_FAILED"},{status:500});
  }
}
