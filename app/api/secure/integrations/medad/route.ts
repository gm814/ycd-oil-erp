import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS as P } from "@/lib/rbac";
import { medadActionSchema,performMedadAction,requireMedad } from "@/services/medad/actions";
import { checkMedadConnection,medadRuntime } from "@/lib/medad/client";
import { issueLabels } from "@/lib/medad/contract";
export async function POST(request:Request) {
 const session=await getSession();if(!session)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
 try{
  const branchId=requireMedad(session,P.INTEGRATION_MANAGE);
  const parsed=medadActionSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
  if(parsed.data.action!=="check")return NextResponse.json(await performMedadAction(session,parsed.data));
  const config=await db.medadConnection.findUnique({where:{branchId}});
  if(!config?.subscriptionId||config.medadBranch===null)throw Error("CONNECTION_REQUIRED");
  const runtime=medadRuntime(branchId);
  // This is authentication plus a read-only warehouse query, never an accounting write.
  const result=await checkMedadConnection(runtime,{subscriptionId:config.subscriptionId,branch:config.medadBranch,year:config.fiscalYear});
  await db.auditLog.create({data:{actorId:session.userId,action:"MEDAD_READ_CHECK_OK",entityType:"MedadConnection",entityId:config.id,afterJson:{revision:config.revision,...result}}});
  return NextResponse.json({ok:true,...result});
 }catch(e){const code=e instanceof Error?e.message:"CONCURRENT_CHANGE";return NextResponse.json({error:Object.hasOwn(issueLabels,code)?code:"CONCURRENT_CHANGE"},{status:code==="FORBIDDEN"?403:409});}
}
