import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { riyadhDateKey } from "@/lib/time";
import type { MedadKind } from "@/lib/medad/contract";
export const sourceHash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function medadSource(tx:Prisma.TransactionClient,branchId:string,kind:MedadKind,sourceId:string) {
 if(kind==="INVOICE"){
  const row = await tx.invoice.findFirst({
    where: { id: sourceId, serviceOrder: { branchId } },
    include: {
      customer: { select: { id: true, customerNo: true, name: true } },
      serviceOrder: { select: { orderNo: true, status: true, items: {
        orderBy: { id: "asc" }, include: { product: { select: { sku: true, unit: true } } }
      } } },
      payments: { orderBy: { id: "asc" }, select: { id: true, method: true, amount: true } },
      returns: { where: { status: "COMPLETED" }, orderBy: { id: "asc" }, select: { id: true, total: true } },
    },
  });
  if(!row)throw Error("ENTRY_NOT_FOUND");return row;
 }
 if(kind==="PAYMENT"){
  const row=await tx.payment.findFirst({where:{id:sourceId,invoice:{serviceOrder:{branchId}}},include:{invoice:{select:{id:true,invoiceNo:true,customerId:true,total:true,status:true}}}});
  if(!row)throw Error("ENTRY_NOT_FOUND");return row;
 }
 if(kind==="RETURN"){
  const row=await tx.salesReturn.findFirst({where:{id:sourceId,branchId},include:{items:{orderBy:{id:"asc"}},invoice:{select:{id:true,invoiceNo:true,customerId:true}}}});
  if(!row)throw Error("ENTRY_NOT_FOUND");return row;
 }
 if(kind==="WASH_CLAIM"){
  const row=await tx.washBatch.findFirst({where:{id:sourceId,agreement:{sourceBranchId:branchId}},include:{agreement:{select:{sourceBranchId:true,washBranchId:true,nameAr:true}},services:{orderBy:{id:"asc"},select:{id:true,serviceNo:true,amount:true}}}});
  if(!row)throw Error("ENTRY_NOT_FOUND");return row;
 }
 const row=await tx.washSettlement.findFirst({where:{id:sourceId,batch:{agreement:{sourceBranchId:branchId}}},include:{sourceTransaction:{select:{accountId:true,amount:true}},receiptTransaction:{select:{accountId:true,amount:true}},batch:{select:{batchNo:true}}}});
 if(!row)throw Error("ENTRY_NOT_FOUND");return row;
}
export async function buildMedadDraft(tx:Prisma.TransactionClient,branchId:string,kind:MedadKind,sourceId:string) {
 const config=await tx.medadConnection.findUnique({where:{branchId}});
 if(!config)throw Error("CONNECTION_REQUIRED");
 const mappings=await tx.medadMapping.findMany({where:{branchId}});
 const map=(kind:string,id:string)=>mappings.find(m=>m.kind===kind&&m.localId===id)?.remoteId;
 const raw=await medadSource(tx,branchId,kind,sourceId);
 const hash=sourceHash(raw);
 const issues:string[]=[];
 if(!config.subscriptionId||config.medadBranch===null)issues.push("CONNECTION_REQUIRED");
 const warnings=["DRAFT_ONLY"];
 let candidate:Prisma.InputJsonObject|null=null;
 let unsupported=false;
 if(kind==="INVOICE"){
  // Narrow by reusing the shape query rather than casting untrusted HTTP data.
  const invoice=await tx.invoice.findFirstOrThrow({where:{id:sourceId,serviceOrder:{branchId}},include:{serviceOrder:{include:{items:{orderBy:{id:"asc"},include:{product:true}}}},payments:{orderBy:{paidAt:"asc"}},returns:{where:{status:"COMPLETED"}}}});
  if(!["ISSUED","PARTIALLY_PAID","PAID"].includes(invoice.status)||invoice.serviceOrder.status!=="COMPLETED")issues.push("INVALID_SOURCE");
  if((config.fiscalYear || riyadhDateKey(new Date()).slice(0,4))!==riyadhDateKey(invoice.createdAt).slice(0,4))issues.push("FISCAL_YEAR_MISMATCH");
  if(config.invoiceAuthority==="UNCONFIRMED")issues.push("INVOICE_AUTHORITY_REQUIRED");
  if(!config.warehouseNo)issues.push("WAREHOUSE_REQUIRED");
  const customerId=map("CUSTOMER",invoice.customerId);if(!customerId)issues.push("CUSTOMER_MAPPING_REQUIRED");
  const methods=[...new Set(invoice.payments.map(p=>p.method))];
  if(methods.length>1)issues.push("MIXED_PAYMENT_REVIEW");
  // A credit balance uses the configured credit code, never a guessed cash index.
  const method=invoice.dueAt?"CREDIT":methods[0];
  const paymentType=method?map("PAYMENT_METHOD",method):undefined;if(paymentType===undefined)issues.push("PAYMENT_MAPPING_REQUIRED");
  const vatKey=invoice.vatRate.mul(100).toString();const vatType=map("VAT",vatKey);if(vatType===undefined)issues.push("VAT_MAPPING_REQUIRED");
  if(invoice.returns.length)issues.push("RETURNED_INVOICE_REVIEW");
  if(invoice.total.isZero())issues.push("ZERO_INVOICE_REVIEW");
  const lines=invoice.serviceOrder.items.map((item,index)=>{
   const productNo=item.productId?map("PRODUCT",item.productId):undefined;
   if(!item.productId)issues.push("MANUAL_ITEM_UNMAPPED");else if(!productNo)issues.push("PRODUCT_MAPPING_REQUIRED");
   const unitId=item.product?map("UNIT",item.product.unit):undefined;if(!unitId)issues.push("UNIT_MAPPING_REQUIRED");
   const gross=item.quantity.mul(item.unitPrice);const net=gross.minus(item.discount);
   if(net.lt(0)||item.quantity.lte(0))issues.push("INVALID_TOTALS");
   return {lineNo:index+1,productNo:productNo??null,unitId:unitId??null,productDesc:item.descriptionAr,quantity:Number(item.quantity),price:Number(item.unitPrice),subTotal:Number(gross),lineDiscount:Number(item.discount),discountedSubTotal:Number(net),taxPercent:Number(invoice.vatRate.mul(100))};
  });
  const subtotal=invoice.serviceOrder.items.reduce((sum,i)=>sum.plus(i.quantity.mul(i.unitPrice).minus(i.discount)),new Prisma.Decimal(0));
  if(!subtotal.toDecimalPlaces(2).eq(invoice.subtotal)||!invoice.subtotal.plus(invoice.vatAmount).eq(invoice.total)||!invoice.subtotal.mul(invoice.vatRate).toDecimalPlaces(2).eq(invoice.vatAmount))issues.push("INVALID_TOTALS");
  candidate={referenceNo:`YCD:${invoice.id}`,orderDate:riyadhDateKey(invoice.createdAt),customerId:customerId??null,warehouseNo:config.warehouseNo,ccNo:config.costCenterNo,salesmanId:config.salesmanId,paymentType:paymentType===undefined?null:Number(paymentType),vatType:vatType===undefined?null:Number(vatType),orderTaxInPrice:"N",total:Number(invoice.subtotal),totalTax:Number(invoice.vatAmount),net:Number(invoice.total),Order_Detail:lines};
  // No orderNo is invented: Medad numbering and response semantics need tenant validation.
  warnings.push("NUMBERING_ACK_REQUIRED","PAYMENT_POLICY_REQUIRED");
 }else if(kind==="PAYMENT"){
  const p=await tx.payment.findFirstOrThrow({where:{id:sourceId,invoice:{serviceOrder:{branchId}}},include:{invoice:true}});
  const customerId=map("CUSTOMER",p.invoice.customerId);const paymentType=map("PAYMENT_METHOD",p.method);
  if(!customerId)issues.push("CUSTOMER_MAPPING_REQUIRED");if(paymentType===undefined)issues.push("PAYMENT_MAPPING_REQUIRED");
  candidate={customerId:customerId??null,paymentType:paymentType===undefined?null:Number(paymentType),paymentAmount:Number(p.amount)};
  warnings.push("PAYMENT_IDEMPOTENCY_UNDOCUMENTED","PAYMENT_POLICY_REQUIRED");unsupported=true;
 }else if(kind==="RETURN"){
  warnings.push("RETURN_NUMBERING_UNCONFIRMED");unsupported=true;
 }else{warnings.push("JOURNAL_ENDPOINT_UNDOCUMENTED");unsupported=true;}
 return {revision:config.revision,sourceHash:hash,issues:[...new Set(issues)],status:unsupported?"NOT_SUPPORTED":issues.length?"NEEDS_DATA":"PREPARED",payload:{mode:"REVIEW_ONLY",contractVersion:"Medad OpenAPI 1.0.0 / observed 2026-10-01",kind,source:JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue,medadCandidate:candidate,warnings,invoiceAuthorityProposal:config.invoiceAuthority} satisfies Prisma.InputJsonObject};
}
