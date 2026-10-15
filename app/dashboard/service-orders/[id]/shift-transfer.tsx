"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function ShiftTransfer({orderId,orderNo,previousShiftId,targetShiftId,targetOpenedAt}:{orderId:string;orderNo:string;previousShiftId:string|null;targetShiftId:string;targetOpenedAt:string}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const router=useRouter();
 async function transfer() {
  if(!confirm(`نقل أمر الخدمة ${orderNo} إلى الوردية المفتوحة بتاريخ ${targetOpenedAt}؟ سيُوثق النقل دون إصدار فاتورة أو تسجيل سداد.`))return;
  setBusy(true);setMessage("");
  try {
   const response=await fetch(`/api/secure/service-orders/${orderId}/shift`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({previousShiftId,targetShiftId,confirmed:true})});
   const result=await response.json();
   if(!response.ok){setMessage(result.error==="FORBIDDEN"?"يلزم حساب مخوّل بإدارة المالية واعتماد أوامر الخدمة.":"تعذر النقل؛ حدّث الصفحة للتحقق من حالة الأمر والوردية قبل المحاولة.");return;}
   setMessage("تم نقل الأمر إلى الوردية الحالية. أكمل بيانات السداد ثم أصدر الفاتورة.");router.refresh();
  } catch {setMessage("تعذر التحقق من النتيجة؛ حدّث الصفحة قبل إعادة المحاولة.");} finally {setBusy(false);}
 }
 return <section className="panel"><h2>استكمال الخدمة في الوردية الحالية</h2><p>أمر الخدمة {orderNo} غير مرتبط بالوردية المفتوحة. الوردية المستقبلة بدأت: {targetOpenedAt}.</p><button type="button" disabled={busy} onClick={transfer}>{busy?"جارٍ النقل…":"نقل هذا الأمر إلى الوردية الحالية"}</button>{message&&<p role="status">{message}</p>}</section>;
}
