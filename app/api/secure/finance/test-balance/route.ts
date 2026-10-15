import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

async function preview(tx: Prisma.TransactionClient, branchId: string, accountId: string) {
  const account = await tx.financialAccount.findFirst({where:{id:accountId,branchId,active:true,type:"CASH",code:{startsWith:"TEST-"},nameAr:{contains:"تجريبي"}}});
  if (!account) throw new Error("ACCOUNT_NOT_ELIGIBLE");
  const rows = await tx.financialTransaction.findMany({where:{accountId,branchId},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  if (rows.some(r=>r.relatedEntityType === "TestCashReconciliation")) throw new Error("ALREADY_RECONCILED");
  const balance = rows.reduce((s,r)=>s.plus(r.amount),new Prisma.Decimal(0));
  if (!balance.gt(0)) throw new Error("NO_POSITIVE_BALANCE");
  const snapshot = createHash("sha256").update(JSON.stringify(rows.map(r=>[r.id,r.amount.toString()]))).digest("hex");
  return {account,rows,balance,snapshot};
}
async function sessionForRequest() {
  const s=await getSession();
  return s?.branchId && hasPermission(s.permissions,PERMISSIONS.FINANCE_MANAGE) ? s : null;
}
export async function GET(request: Request) {
  const s=await sessionForRequest();
  if(!s)return NextResponse.json({error:"FORBIDDEN"},{status:403});
  try {
    const p=await db.$transaction(tx=>preview(tx,s.branchId!,new URL(request.url).searchParams.get("accountId")??""));
    return NextResponse.json({name:p.account.nameAr,balance:p.balance.toFixed(2),snapshot:p.snapshot,rows:p.rows.map(r=>({id:r.id,amount:r.amount.toFixed(2),description:r.descriptionAr,reference:r.reference,date:r.createdAt}))});
  } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"FAILED"},{status:409}); }
}
const schema=z.object({accountId:z.string().min(1),snapshot:z.string().length(64),reason:z.string().trim().min(10).max(500),confirmed:z.literal(true)});
export async function POST(request: Request) {
  const s=await sessionForRequest();
  if(!s)return NextResponse.json({error:"FORBIDDEN"},{status:403});
  const input=schema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  try {
    const result=await db.$transaction(async tx=>{
      const p=await preview(tx,s.branchId!,input.data.accountId);
      if(p.snapshot!==input.data.snapshot)throw new Error("STALE_PREVIEW");
      if(await tx.shift.findFirst({where:{branchId:s.branchId!,closedAt:null}}))throw new Error("OPEN_SHIFT_EXISTS");
      const movement=await tx.financialTransaction.create({data:{branchId:s.branchId!,accountId:p.account.id,type:"ADJUSTMENT",amount:p.balance.negated(),reference:"TEST-CASH-RECONCILIATION",descriptionAr:`استبعاد رصيد نقدي تجريبي غير فعلي — ${input.data.reason}`,relatedEntityType:"TestCashReconciliation",relatedEntityId:p.account.id,performedBy:s.userId,idempotencyKey:`test-cash-reconciliation:${p.account.id}`}});
      await tx.auditLog.create({data:{actorId:s.userId,action:"TEST_CASH_RECONCILED",entityType:"FinancialAccount",entityId:p.account.id,beforeJson:{balance:p.balance.toString(),transactionIds:p.rows.map(r=>r.id),snapshot:p.snapshot},afterJson:{balance:"0.00",adjustmentId:movement.id,reason:input.data.reason,confirmedAllMovementsTest:true,invoicesChanged:false,stockChanged:false}}});
      return {documentNo:movement.documentNo,balance:"0.00"};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result,{status:201});
  } catch(e) {
    const code=e instanceof Error?e.message:"FAILED";
    const allowed=["ACCOUNT_NOT_ELIGIBLE","ALREADY_RECONCILED","NO_POSITIVE_BALANCE","STALE_PREVIEW","OPEN_SHIFT_EXISTS"];
    return NextResponse.json({error:allowed.includes(code)?code:"FAILED"},{status:409});
  }
}
