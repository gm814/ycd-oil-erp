import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { assertPermission,PERMISSIONS as P } from "@/lib/rbac";
import { medadKinds,mappingKinds } from "@/lib/medad/contract";
import { riyadhDateRange } from "@/lib/time";
import { buildMedadDraft,medadSource } from "./drafts";
import { captureMedad } from "./outbox";
const id=z.string().trim().min(1).max(120);
const text=(max:number)=>z.string().trim().max(max);
export const medadActionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("configure"),captureEnabled:z.enum(["true","false"]),subscriptionId:text(255).refine(v=>!v||/^[A-Za-z0-9]+$/.test(v)),medadBranch:z.union([z.literal(""),z.coerce.number().int().min(0).max(2147483647)]),fiscalYear:text(4).refine(v=>!v||/^20\d{2}$/.test(v)),warehouseNo:text(10),costCenterNo:text(50),salesmanId:text(30),invoiceAuthority:z.enum(["UNCONFIRMED","MEDAD","YCD"])}),
 z.object({action:z.literal("map"),kind:z.enum(mappingKinds),localId:id,remoteId:z.string().trim().min(1).max(50),note:z.string().trim().min(3).max(200)}),
 z.object({action:z.literal("unmap"),id}),
 z.object({action:z.literal("prepare"),id}),
 z.object({action:z.literal("capture"),kind:z.enum(medadKinds),sourceId:id}),
 z.object({action:z.literal("scan"),from:z.string(),to:z.string()}),
 z.object({action:z.literal("check")}),
]);
export type MedadAction=z.infer<typeof medadActionSchema>;
export function requireMedad(session:SessionPayload,permission:string){assertPermission(session.permissions,permission);if(!session.branchId)throw Error("FORBIDDEN");return session.branchId;}
export async function medadActionInTransaction(tx:Prisma.TransactionClient,session:SessionPayload,input:Exclude<MedadAction,{action:"check"}>) {
 const branchId=requireMedad(session,P.INTEGRATION_MANAGE);
 const audit=async(action:string,entityId:string,afterJson:Prisma.InputJsonObject)=>tx.auditLog.create({data:{actorId:session.userId,action,entityType:"MedadIntegration",entityId,afterJson}});
 const invalidate=()=>tx.medadOutbox.updateMany({where:{branchId},data:{status:"CAPTURED",payload:Prisma.DbNull,issues:Prisma.DbNull,revision:null,sourceHash:null,preparedAt:null}});
 if(input.action==="configure"){
  const before=await tx.medadConnection.findUnique({where:{branchId}});
  const fields={subscriptionId:input.subscriptionId||null,medadBranch:input.medadBranch===""?null:input.medadBranch,fiscalYear:input.fiscalYear,warehouseNo:input.warehouseNo||null,costCenterNo:input.costCenterNo||null,salesmanId:input.salesmanId||null,invoiceAuthority:input.invoiceAuthority,captureEnabled:input.captureEnabled==="true"};
  if(before?.subscriptionId && before.medadBranch !== null && (before.subscriptionId!==fields.subscriptionId||before.medadBranch!==fields.medadBranch||before.fiscalYear!==fields.fiscalYear)&&((await tx.medadMapping.count({where:{branchId}}))+(await tx.medadOutbox.count({where:{branchId}}))>0))throw Error("CONFIG_LOCKED");
  const config=await tx.medadConnection.upsert({where:{branchId},create:{branchId,...fields},update:{...fields,revision:{increment:1}}});await invalidate();
  await audit("MEDAD_CONFIGURED",config.id,{...fields,revision:config.revision});return {ok:true};
 }
 const config=await tx.medadConnection.findUnique({where:{branchId}});if(!config)throw Error("CONNECTION_REQUIRED");
 if(input.action==="map"||input.action==="unmap"){
  if(input.action==="unmap"){
   const m=await tx.medadMapping.findFirst({where:{id:input.id,branchId}});if(!m)throw Error("LOCAL_ENTITY_NOT_FOUND");
   await tx.medadMapping.delete({where:{id:m.id}});await audit("MEDAD_MAPPING_REMOVED",m.id,{kind:m.kind,localId:m.localId,remoteId:m.remoteId});
  }else{
   let exists=false;
   if(input.kind==="CUSTOMER")exists=!!await tx.customer.findFirst({where:{id:input.localId,serviceOrders:{some:{branchId}}}});
   if(input.kind==="PRODUCT")exists=!!await tx.product.findUnique({where:{id:input.localId}});
   if(input.kind==="ACCOUNT")exists=!!await tx.financialAccount.findFirst({where:{id:input.localId,branchId}});
   if(input.kind==="UNIT")exists=!!await tx.product.findFirst({where:{unit:input.localId}});
   if(input.kind==="PAYMENT_METHOD")exists=["CASH","CARD","TRANSFER","CREDIT"].includes(input.localId)&&/^(?:[0-9]|1[0-4])$/.test(input.remoteId);
   if(input.kind==="VAT")exists=/^(?:100|\d{1,2})(?:\.\d{1,2})?$/.test(input.localId)&&Number(input.localId)<=100&&/^(?:[0-9]|[12][0-9]|30)$/.test(input.remoteId);
   if(!exists)throw Error("LOCAL_ENTITY_NOT_FOUND");
   if(input.kind === "VAT") input = { ...input, localId: new Prisma.Decimal(input.localId).toString() };
   if(["CUSTOMER","PRODUCT"].includes(input.kind)&&await tx.medadMapping.findFirst({where:{branchId,kind:input.kind,remoteId:input.remoteId,localId:{not:input.localId}}}))throw Error("REMOTE_MAPPING_CONFLICT");
   const before=await tx.medadMapping.findUnique({where:{branchId_kind_localId:{branchId,kind:input.kind,localId:input.localId}}});
   const mapped=await tx.medadMapping.upsert({where:{branchId_kind_localId:{branchId,kind:input.kind,localId:input.localId}},create:{branchId,kind:input.kind,localId:input.localId,remoteId:input.remoteId,note:input.note},update:{remoteId:input.remoteId,note:input.note}});
   await audit("MEDAD_MAPPING_SAVED",mapped.id,{kind:input.kind,localId:input.localId,remoteId:input.remoteId,previousRemoteId:before?.remoteId??null,note:input.note});
  }
  await tx.medadConnection.update({where:{branchId},data:{revision:{increment:1}}});await invalidate();return {ok:true};
 }
 if(input.action==="capture"){
  await medadSource(tx,branchId,input.kind,input.sourceId);
  const entry=await captureMedad(tx,branchId,input.kind,input.sourceId,input.sourceId,true);await audit("MEDAD_CAPTURED",entry!.id,{kind:input.kind,sourceId:input.sourceId});return {ok:true};
 }
 if(input.action==="prepare"){
  const entry=await tx.medadOutbox.findFirst({where:{id:input.id,branchId}});if(!entry)throw Error("ENTRY_NOT_FOUND");
  const kind=z.enum(medadKinds).parse(entry.kind);
  const draft=await buildMedadDraft(tx,branchId,kind,entry.sourceId);
  await tx.medadOutbox.update({where:{id:entry.id},data:{...draft,preparedAt:new Date()}});
  await audit("MEDAD_DRAFT_PREPARED",entry.id,{revision:draft.revision,sourceHash:draft.sourceHash,status:draft.status,issues:draft.issues});return {ok:true};
 }
 const range=riyadhDateRange(input.from,input.to);if(!range||range.end.getTime()-range.start.getTime()>31*86400000)throw Error("EXPORT_LIMIT");
 const dates={gte:range.start,lt:range.end};
 const [invoices,payments,returns,claims,settlements]=await Promise.all([
  tx.invoice.findMany({where:{serviceOrder:{branchId},createdAt:dates,status:{in:["ISSUED","PARTIALLY_PAID","PAID"]}},select:{id:true,invoiceNo:true},take:501}),
  tx.payment.findMany({where:{invoice:{serviceOrder:{branchId}},paidAt:dates},select:{id:true,invoice:{select:{invoiceNo:true}}},take:501}),
  tx.salesReturn.findMany({where:{branchId,status:"COMPLETED",createdAt:dates},select:{id:true,returnNo:true},take:501}),
  tx.washBatch.findMany({where:{agreement:{sourceBranchId:branchId},status:"POSTED",postedAt:dates},select:{id:true,batchNo:true},take:501}),
  tx.washSettlement.findMany({where:{batch:{agreement:{sourceBranchId:branchId}},paidAt:dates},select:{id:true,settlementNo:true},take:501}),
 ]);
 if([invoices,payments,returns,claims,settlements].some(rows=>rows.length>500))throw Error("EXPORT_LIMIT");
 for(const row of invoices)await captureMedad(tx,branchId,"INVOICE",row.id,row.invoiceNo,true);
 for(const row of payments)await captureMedad(tx,branchId,"PAYMENT",row.id,`${row.invoice.invoiceNo} / ${row.id}`,true);
 for(const row of returns)await captureMedad(tx,branchId,"RETURN",row.id,row.returnNo,true);
 for(const row of claims)await captureMedad(tx,branchId,"WASH_CLAIM",row.id,row.batchNo,true);
 for(const row of settlements)await captureMedad(tx,branchId,"WASH_SETTLEMENT",row.id,row.settlementNo,true);
 const count=invoices.length+payments.length+returns.length+claims.length+settlements.length;
 await audit("MEDAD_SOURCES_SCANNED",config.id,{from:input.from,to:input.to,count});return {ok:true,count};
}
export async function performMedadAction(session:SessionPayload,input:Exclude<MedadAction,{action:"check"}>) {
 return db.$transaction(tx=>medadActionInTransaction(tx,session,input),{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
