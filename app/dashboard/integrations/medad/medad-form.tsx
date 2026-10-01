"use client";
import { useState,type FormEvent,type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { issueLabels,mappingLabels,mappingKinds } from "@/lib/medad/contract";
export function MedadForm({action,values={},label,children}:{action:string;values?:Record<string,string>;label:string;children?:ReactNode}){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const router=useRouter();
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setMessage("");
  try{const r=await fetch("/api/secure/integrations/medad",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...Object.fromEntries(new FormData(event.currentTarget)),...values,action})});const body=await r.json();if(!r.ok){setMessage(issueLabels[body.error]??"تعذر تنفيذ العملية.");return;}setMessage(action==="check"?"نجح اختبار قراءة المخازن. لم تُرسل مستندات محاسبية.":action==="scan"?`تمت مراجعة ${body.count} عملية وحفظها دون تكرار.`:"تم الحفظ محليًا. لم تُرسل بيانات محاسبية إلى مداد.");router.refresh();}catch{setMessage("تعذر تأكيد الحفظ؛ حدّث الصفحة لمراجعة الحالة.");}finally{setBusy(false);}
 }
 return <form className="intakeForm" onSubmit={submit}>{children}<button disabled={busy}>{busy?"جارٍ التنفيذ…":label}</button>{message&&<p role="status">{message}</p>}</form>;
}
export function MappingForm({choices}:{choices:Record<string,{id:string;label:string}[]>}){
 const [kind,setKind]=useState<string>("CUSTOMER");
 return <MedadForm action="map" label="حفظ المطابقة" values={{kind}}><label>نوع المطابقة<select value={kind} onChange={e=>setKind(e.target.value)}>{mappingKinds.map(k=><option key={k} value={k}>{mappingLabels[k]}</option>)}</select></label><label>البيان في YCD OIL{kind==="VAT"?<input name="localId" type="number" min="0" max="100" step="0.01" placeholder="مثل 15 لنسبة 15٪" required/>:<select name="localId" key={kind} required><option value="">اختر البيان المحلي</option>{(choices[kind]??[]).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>}</label><label>الرمز المقابل في مداد<input name="remoteId" required maxLength={50}/></label><p>أكواد السداد من ٠ إلى ١٤، وأنواع الضريبة من ٠ إلى ٣٠ وفق إعداد مداد. لا تُستخدم هذه الأرقام كنسب ضريبة. مطابقة الحساب المالي تُحفظ للمراجعة ولا تنشئ قيدًا.</p><label>مرجع المطابقة أو ملاحظة المحاسب<input name="note" required minLength={3} maxLength={200}/></label></MedadForm>;
}
