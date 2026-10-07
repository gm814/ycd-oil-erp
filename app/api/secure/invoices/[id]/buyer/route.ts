import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
const digits=(s:string)=>s.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const schema=z.object({companyName:z.string().trim().max(200),vatNumber:z.string().trim().transform(digits).refine(s=>!s||/^[0-9]{15}$/.test(s))});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await getSession();
 if(!session||session.mustChangePassword)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
 if(!session.branchId||!hasPermission(session.permissions,PERMISSIONS.INVOICE_ISSUE))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
 const {id}=await params;
 const found=await db.$transaction(async tx=>{
  const old=await tx.invoice.findFirst({where:{id,serviceOrder:{branchId:session.branchId!}}});if(!old)return false;
  const data={buyerCompanyName:parsed.data.companyName||null,buyerVatNumber:parsed.data.vatNumber||null};
  await tx.invoice.update({where:{id},data});
  await tx.auditLog.create({data:{actorId:session.userId,action:"INVOICE_BUYER_UPDATED",entityType:"Invoice",entityId:id,beforeJson:{buyerCompanyName:old.buyerCompanyName,buyerVatNumber:old.buyerVatNumber},afterJson:data}});
  return true;
 });
 return NextResponse.json(found?{success:true}:{error:"NOT_FOUND"},{status:found?200:404});
}
