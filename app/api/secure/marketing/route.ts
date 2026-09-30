import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS as P, hasPermission } from "@/lib/rbac";
import { marketingPhone, marketingRecipient, marketingLink } from "@/services/marketing";
const channel=z.enum(["SMS","WHATSAPP"]);
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("consent"),customerId:z.string().min(1),channel,allowed:z.enum(["true","false"]),evidence:z.string().trim().min(3).max(300)}),
 z.object({action:z.literal("campaign"),title:z.string().trim().min(2).max(120),message:z.string().trim().min(3).max(1000),channel,idempotencyKey:z.string().uuid()}),
 z.object({action:z.literal("handoff"),campaignId:z.string().min(1),customerId:z.string().min(1)}),
]);
export async function POST(request:Request){
 const session=await getSession();
 if(!session?.branchId || !hasPermission(session.permissions,P.MARKETING_MANAGE)) return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
 try {const data=parsed.data;
 const result=await db.$transaction(async tx=>{
  if(data.action==="consent"){
   const customer=await tx.customer.findFirst({where:{id:data.customerId,serviceOrders:{some:{branchId:session.branchId}}}});
   if(!customer)throw new Error("CUSTOMER_NOT_FOUND");
   const phone=marketingPhone(customer.phone);
   if(data.allowed==="true"&&!phone)throw new Error("INTERNATIONAL_PHONE_REQUIRED");
   const fields={allowed:data.allowed==="true",evidence:data.evidence,recordedBy:session.userId,phone:phone??""};
   const consent=await tx.marketingConsent.upsert({where:{branchId_customerId_channel:{branchId:session.branchId!,customerId:customer.id,channel:data.channel}},create:{branchId:session.branchId!,customerId:customer.id,channel:data.channel,...fields},update:fields});
   await tx.auditLog.create({data:{actorId:session.userId,action:"MARKETING_CONSENT_RECORDED",entityType:"MarketingConsent",entityId:consent.id,afterJson:{allowed:consent.allowed,channel:data.channel,evidence:data.evidence}}});return {ok:true};
  }
  if(data.action==="campaign"){
   const existing=await tx.marketingCampaign.findUnique({where:{idempotencyKey:data.idempotencyKey}});
   if(existing){if(existing.branchId!==session.branchId||existing.title!==data.title||existing.message!==data.message||existing.channel!==data.channel)throw new Error("IDEMPOTENCY_CONFLICT");return {ok:true};}
   const campaign=await tx.marketingCampaign.create({data:{branchId:session.branchId!,title:data.title,message:data.message,channel:data.channel,createdBy:session.userId,idempotencyKey:data.idempotencyKey}});
   await tx.auditLog.create({data:{actorId:session.userId,action:"MARKETING_CAMPAIGN_CREATED",entityType:"MarketingCampaign",entityId:campaign.id,afterJson:{channel:data.channel,title:data.title}}});return {ok:true};
  }
  const campaign=await tx.marketingCampaign.findFirst({where:{id:data.campaignId,branchId:session.branchId}});
  if(!campaign)throw new Error("CAMPAIGN_NOT_FOUND");
  const customer=await marketingRecipient(tx,session.branchId!,data.customerId,campaign.channel);
  if(!customer)throw new Error("CONSENT_REQUIRED");
  await tx.auditLog.create({data:{actorId:session.userId,action:"MARKETING_MESSAGE_PREPARED",entityType:"MarketingCampaign",entityId:campaign.id,afterJson:{customerId:customer.id,channel:campaign.channel,status:"PREPARED_NOT_SENT"}}});
  return {url:marketingLink(campaign.channel,marketingPhone(customer.phone)!,campaign.message)};
 });return NextResponse.json(result);
 }catch(e){const code=e instanceof Error?e.message:"FAILED";return NextResponse.json({error:code.includes("\n")?"FAILED":code},{status:400});}
}
