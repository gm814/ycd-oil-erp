import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";

const schema = z.object({ previousShiftId: z.string().nullable(), targetShiftId: z.string().min(1), confirmed: z.literal(true) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const session = await getSession();
 if (!session?.branchId || !hasPermission(session.permissions, PERMISSIONS.FINANCE_MANAGE) || !hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_APPROVE)) return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const parsed = schema.safeParse(await request.json().catch(()=>null));
 if (!parsed.success) return NextResponse.json({error:"INVALID_INPUT"},{status:400});
 const { id } = await params;
 try {
  await db.$transaction(async tx => {
   const order = await tx.serviceOrder.findFirst({where:{id,branchId:session.branchId!},include:{invoice:true,shift:true}});
   if (!order) throw new Error("NOT_FOUND");
   if (order.invoice || !["DRAFT","OPEN","IN_PROGRESS"].includes(order.status) || order.channel === "PRICE_CORRECTION") throw new Error("ORDER_LOCKED");
   const shifts = await tx.shift.findMany({where:{branchId:session.branchId!,closedAt:null}});
   if (shifts.length !== 1 || shifts[0].id !== parsed.data.targetShiftId) throw new Error("TARGET_SHIFT_CHANGED");
   if (order.shiftId === shifts[0].id) return; // Safe repeated request; no duplicate audit.
   if (order.shiftId !== parsed.data.previousShiftId) throw new Error("STALE_ORDER");
   if (order.shift && (order.shift.branchId !== session.branchId || !order.shift.closedAt)) throw new Error("SOURCE_SHIFT_OPEN");
   const changed = await tx.serviceOrder.updateMany({where:{id,branchId:session.branchId!,shiftId:order.shiftId,status:order.status,invoice:{is:null}},data:{shiftId:shifts[0].id}});
   if (changed.count !== 1) throw new Error("STALE_ORDER");
   await tx.auditLog.create({data:{actorId:session.userId,action:"SERVICE_ORDER_SHIFT_TRANSFERRED",entityType:"ServiceOrder",entityId:id,beforeJson:{shiftId:order.shiftId},afterJson:{shiftId:shifts[0].id,reason:"نقل أمر غير مفوتر إلى الوردية المفتوحة لاستكمال الخدمة باعتماد المسؤول",invoiceCreated:false,paymentCreated:false}}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return NextResponse.json({ok:true});
 } catch(e) {
  const code=e instanceof Error?e.message:"FAILED";
  return NextResponse.json({error:["NOT_FOUND","ORDER_LOCKED","TARGET_SHIFT_CHANGED","STALE_ORDER","SOURCE_SHIFT_OPEN"].includes(code)?code:"FAILED"},{status:409});
 }
}
