import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { nextDocumentNumber } from "@/lib/document-number";
export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await getSession();
 if(!session||session.mustChangePassword)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
 if(!session.branchId||!hasPermission(session.permissions,PERMISSIONS.USER_MANAGE))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const {id}=await params;
 const result=await db.$transaction(async tx=>{
  const branch=await tx.branch.findUnique({where:{id:session.branchId!}});
  if(branch?.operationalStatus!=="PREOPENING")return false;
  const old=await tx.invoice.findFirst({where:{id,serviceOrder:{branchId:session.branchId!}}});if(!old)return false;
  if(old.invoiceNo.startsWith("YCD-"))return true;
  const invoiceNo=await nextDocumentNumber(tx);
  const changed=await tx.invoice.updateMany({where:{id,invoiceNo:old.invoiceNo},data:{invoiceNo}});
  if(changed.count===0)return true;
  await tx.auditLog.create({data:{actorId:session.userId,action:"TRIAL_INVOICE_RENUMBERED",entityType:"Invoice",entityId:id,beforeJson:{invoiceNo:old.invoiceNo},afterJson:{invoiceNo}}});return true;
 });
 return NextResponse.json(result?{success:true}:{error:"TRIAL_ONLY"},{status:result?200:403});
}
