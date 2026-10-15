import { notFound,redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS as P,hasPermission } from "@/lib/rbac";
import { kindLabels,statusLabels,issueLabels,medadKinds } from "@/lib/medad/contract";
import { medadSource,sourceHash } from "@/services/medad/drafts";
import { MedadForm } from "../medad-form";
import { z } from "zod";
export default async function MedadEntry({params}:{params:Promise<{id:string}>}){
 const session=await getSession();if(!session?.branchId||![P.INTEGRATION_VIEW,P.INTEGRATION_MANAGE].some(p=>hasPermission(session.permissions,p)))redirect("/dashboard");
 const entry=await db.medadOutbox.findFirst({where:{id:(await params).id,branchId:session.branchId}});if(!entry)notFound();
 const config=await db.medadConnection.findUnique({where:{branchId:session.branchId}});
 const raw=await medadSource(db,session.branchId,z.enum(medadKinds).parse(entry.kind),entry.sourceId);
 const stale=entry.revision!==config?.revision||entry.sourceHash!==sourceHash(raw);
 const draft=entry.payload as {medadCandidate?:unknown;warnings?:string[]}|null;
 const issues=Array.isArray(entry.issues)?entry.issues.filter((i):i is string=>typeof i==="string"):[];
 return <main className="workspace"><a href="/dashboard/integrations/medad">← ربط مداد</a><h1>{kindLabels[entry.kind]} — {entry.sourceNo}</h1><section className="panel"><h2>{statusLabels[entry.status]}</h2><p>لم تُرسل هذه العملية إلى مداد.</p>{stale&&<p>المصدر أو الإعداد تغيّر، أو لم تُجهز المسودة بعد. يلزم تحديثها قبل تنزيلها.</p>}{issues.map(code=><p key={code}>{issueLabels[code]??code}</p>)}{draft?.warnings?.map(code=><p key={code}>{issueLabels[code]??code}</p>)}{hasPermission(session.permissions,P.INTEGRATION_MANAGE)&&<MedadForm action="prepare" values={{id:entry.id}} label="تجهيز / تحديث مسودة المراجعة"/>}{entry.payload&&!stale&&<a className="secondaryLink" href={`/api/secure/integrations/medad/${entry.id}`}>تنزيل ملف المراجعة — ليس ملف استيراد معتمدًا</a>}</section><details className="panel"><summary>بيانات العملية المحلية للمراجعة</summary><pre dir="ltr" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(raw,null,2)}</pre></details>{draft?.medadCandidate!=null&&<details className="panel"><summary>المطابقة المقترحة لحقول مداد</summary><pre dir="ltr" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(draft.medadCandidate,null,2)}</pre></details>}</main>;
}
