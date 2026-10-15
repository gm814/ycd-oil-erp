"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
const normalize=(s:string)=>s.replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/[٫،,]/g,".");
export default function PriceCorrectionForm({invoiceId,total,reference,items}:{invoiceId:string;total:number;reference:string;items:{id:string;name:string;quantity:number}[]}) {
 const router=useRouter();
 const [prices,setPrices]=useState<Record<string,string>>({});
 const [receipt,setReceipt]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const ready=items.every(i=>/^[0-9]+(?:\.[0-9]{1,2})?$/.test(prices[i.id]??""));
 const gross=ready?items.reduce((s,i)=>s+Math.round(Number(prices[i.id])*i.quantity*100),0)/100:0;
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!ready || !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(receipt)||Math.round(Number(receipt)*100)!==Math.round(gross*100)||gross<=total){setMessage("راجع الأسعار ومبلغ الإيصال؛ يجب أن يتطابقا وأن تكون الزيادة موجبة.");return;}
  const data=new FormData(e.currentTarget);
  if(!confirm(`إصدار إشعار مدين بفرق ${(gross-total).toFixed(2)} ريال، وتسجيل هذا الفرق من الإيصال السابق؟ لا توجد عملية دفع جديدة أو حركة مخزون.`))return;
  setBusy(true);setMessage("");
  try{
   const response=await fetch(`/api/secure/invoices/${invoiceId}/price-correction`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    reason:data.get("reason"),paymentReference:data.get("paymentReference"),receiptTotal:Number(receipt),
    prices:items.map(i=>({itemId:i.id,unitGross:Number(prices[i.id])})),
   })});
   const result=await response.json();
   if(!response.ok){
    const errors:Record<string,string>={CORRECTION_FAILED:"تعذر تسجيل التصحيح بسبب خطأ في النظام. تواصل مع مسؤول النظام قبل إعادة المحاولة.",RECEIPT_MISMATCH:"الأسعار أو مرجع الإيصال لا يطابقان السداد المسجل.",CORRECTION_EXISTS:"صدر إشعار سابق لهذه الفاتورة؛ حدّث الصفحة.",PRICE_DECREASE_NOT_SUPPORTED:"هذه المعالجة لزيادة السعر فقط؛ يوجد صنف انخفض سعره.",CORRECTION_NOT_ALLOWED:"تتطلب هذه المعالجة فاتورة مسددة بدفعة واحدة ودون مرتجعات.",OPEN_SHIFT_REQUIRED:"افتح وردية للفرع قبل تسجيل التصحيح.",FINANCIAL_ACCOUNT_REQUIRED:"الحساب المالي لطريقة السداد غير مهيأ.",FORBIDDEN:"يلزم حساب مخوّل بإدارة المالية وإصدار الفواتير والتحصيل.",CONCURRENT_CHANGE:"تغيرت البيانات؛ حدّث الصفحة قبل إعادة المحاولة."};
    setMessage(errors[result.error]??"تعذر إصدار الإشعار؛ راجع البيانات.");return;
   }
   router.push(`/dashboard/invoices/${result.id}`);router.refresh();
  }catch{setMessage("تعذر الاتصال. حدّث الصفحة للتحقق من وجود الإشعار قبل إعادة المحاولة.");}
  finally{setBusy(false);}
 }
 return <details className="noPrint" open><summary>تصحيح زيادة السعر — إشعار مدين</summary>
  <form className="intakeForm" onSubmit={submit}>
   <p>يسجل فرق سعر سبق تحصيله بإيصال واحد. تبقى الفاتورة الأصلية والمخزون والكوبونات دون تغيير.</p>
   {items.map(i=><label key={i.id}>{i.name} — الكمية {i.quantity} — سعر الوحدة الصحيح شامل الضريبة
    <input type="text" inputMode="decimal" dir="ltr" required value={prices[i.id]??""} onChange={e=>setPrices({...prices,[i.id]:normalize(e.target.value)})}/>
   </label>)}
   <label>إجمالي الإيصال المدفوع فعليًا<input type="text" inputMode="decimal" dir="ltr" required value={receipt} onChange={e=>setReceipt(normalize(e.target.value))}/></label>
   <label>مرجع الإيصال السابق<input name="paymentReference" defaultValue={reference} required maxLength={120}/></label>
   <label>سبب التصحيح<textarea name="reason" required minLength={5} maxLength={500} defaultValue="تصحيح أسعار البيع وإثبات فرق التحصيل من الإيصال الأصلي"/></label>
   <p>الفاتورة الأصلية: {total.toFixed(2)} ر.س</p>
   {ready&&<p>الإجمالي الصحيح: {gross.toFixed(2)} ر.س — الفرق: {(gross-total).toFixed(2)} ر.س</p>}
   <button disabled={busy||!ready}>إصدار الإشعار وتسجيل فرق التحصيل</button>
   {message&&<p role="alert">{message}</p>}
  </form>
 </details>;
}
