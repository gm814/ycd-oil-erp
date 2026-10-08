"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function BuyerForm({invoiceId, companyName, vatNumber, canRenumber}: {invoiceId:string; companyName:string|null; vatNumber:string|null; canRenumber:boolean}) {
 const router=useRouter(); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault(); const data=new FormData(event.currentTarget); setBusy(true); setMessage("");
  try {
   const res=await fetch(`/api/secure/invoices/${encodeURIComponent(invoiceId)}/buyer`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({companyName:data.get("companyName"),vatNumber:data.get("vatNumber")})});
   if(!res.ok)throw Error(); setMessage("تم حفظ بيانات الشركة على الفاتورة.");router.refresh();
  } catch {setMessage("تعذر الحفظ. راجع البيانات وصلاحية الدخول؛ الرقم الضريبي يجب أن يكون 15 رقمًا أو يُترك فارغًا.");} finally {setBusy(false);}
 }
 async function renumber() {
  if (!window.confirm("تأكيد منح هذه الفاتورة التجريبية رقم YCD جديد؟ سيُحفظ الرقم السابق في سجل العمليات.")) return;
  setBusy(true);setMessage("");
  try {const res=await fetch(`/api/secure/invoices/${encodeURIComponent(invoiceId)}/renumber`,{method:"POST"});if(!res.ok)throw Error();setMessage("تم تحديث رقم الفاتورة.");router.refresh();} catch {setMessage("تعذر تحديث الرقم. يلزم مدير النظام وفرع في مرحلة التشغيل التجريبي.");} finally {setBusy(false);}
 }
 return <form className="noPrint" onSubmit={submit}><label>اسم الشركة أو المؤسسة<input name="companyName" defaultValue={companyName??""} maxLength={200}/></label><label>الرقم الضريبي للعميل<input name="vatNumber" defaultValue={vatNumber??""} inputMode="numeric" dir="ltr" maxLength={15}/></label><button disabled={busy}>{busy?"جارٍ الحفظ…":"حفظ بيانات الشركة"}</button>{canRenumber&&<button type="button" disabled={busy} onClick={renumber}>تحديث رقم الفاتورة التجريبية</button>}{message&&<p role="status">{message}</p>}</form>;
}
