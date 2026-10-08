import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { exportMedadDraft } from "@/services/medad/export";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const session=await getSession();if(!session)return NextResponse.json({error:"UNAUTHENTICATED"},{status:401});
 try{const result=await exportMedadDraft(session,(await params).id);return new NextResponse(JSON.stringify(result,null,2),{headers:{"content-type":"application/json; charset=utf-8","content-disposition":"attachment; filename=medad-review.json","cache-control":"no-store"}});}
 catch(e){const code=e instanceof Error?e.message:"FAILED";return NextResponse.json({error:["FORBIDDEN","ENTRY_NOT_FOUND","STALE_DRAFT"].includes(code)?code:"CONCURRENT_CHANGE"},{status:code==="FORBIDDEN"?403:409});}
}
