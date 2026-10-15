import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { PERMISSIONS as P,hasPermission } from "@/lib/rbac";
import { medadKinds } from "@/lib/medad/contract";
import { z } from "zod";
import { medadSource,sourceHash } from "./drafts";
export async function exportMedadDraft(session:SessionPayload,id:string) {
 if(!session.branchId||![P.INTEGRATION_VIEW,P.INTEGRATION_MANAGE].some(p=>hasPermission(session.permissions,p)))throw Error("FORBIDDEN");
 return db.$transaction(async tx=>{
  const entry=await tx.medadOutbox.findFirst({where:{id,branchId:session.branchId}});if(!entry)throw Error("ENTRY_NOT_FOUND");
  const config=await tx.medadConnection.findUnique({where:{branchId:session.branchId!}});
  if(!entry.payload||entry.revision!==config?.revision)throw Error("STALE_DRAFT");
  const hash=sourceHash(await medadSource(tx,session.branchId!,z.enum(medadKinds).parse(entry.kind),entry.sourceId));
  if(hash!==entry.sourceHash)throw Error("STALE_DRAFT");
  await tx.auditLog.create({data:{actorId:session.userId,action:"MEDAD_REVIEW_EXPORTED",entityType:"MedadOutbox",entityId:entry.id,afterJson:{sourceHash:hash,revision:entry.revision,status:entry.status}}});
  return {mode:"REVIEW_ONLY_NOT_SENT",id:entry.id,sourceNo:entry.sourceNo,status:entry.status,issues:entry.issues,sourceHash:hash,configurationRevision:entry.revision,preparedAt:entry.preparedAt,draft:entry.payload};
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
