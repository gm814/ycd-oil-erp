"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BarcodeCamera from "@/components/barcode-camera";
type Preview={serial:string;customer:string;plate:string;vehicle:string;amount:string;agreement:string;expiresAt:string|null};
const messages:Record<string,string>={FORBIDDEN:"لا تملك صلاحية اعتماد كوبونات هذه المغسلة.",UNAUTHENTICATED:"انتهت الجلسة. سجل الدخول مجددًا.",INVALID_INPUT:"الرمز غير صالح. امسح كوبون YCD OIL أو أدخل رقمه.",COUPON_NOT_FOUND:"الكوبون غير موجود.",COUPON_NOT_ACTIVE:"الكوبون مستخدم أو ملغى؛ لا يمكن استخدامه مرة أخرى.",COUPON_EXPIRED:"انتهت صلاحية الكوبون.",WASH_AGREEMENT_REQUIRED:"الكوبون غير مرتبط باتفاق فعال لهذه المغسلة.",WASH_PRICE_REQUIRED:"لم تُحدد قيمة الغسلة في الاتفاق. اطلب من الإدارة تحديدها؛ لم يُستخدم الكوبون.",WASH_PRICE_CHANGED:"تغيّر سعر الاتفاق. افحص الكوبون مجددًا قبل الاعتماد.",INVOICE_REVIEW_REQUIRED:"الفاتورة ملغاة أو عليها مرتجع؛ راجع الإدارة.",CONCURRENT_CHANGE:"تمت معالجة الكوبون بالتزامن. افحص حالته مجددًا قبل أي محاولة أخرى.",BRANCH_NOT_LIVE:"التشغيل التجاري للفرع غير مفعّل."};
export default function CouponRedeem(){
 const router=useRouter(),lock=useRef(false);
 const [serial,setSerial]=useState(""),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[matched,setMatched]=useState(false);
 async function request(action:"inspect"|"redeem",value:string){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage("");setMatched(false);
  const amount=preview?.amount;setPreview(null);
  try{
   const response=await fetch("/api/secure/wash",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,serial:value,...(action==="redeem"?{expectedAmount:amount}:{})})});
   const result=await response.json();
   if(!response.ok){setMessage(messages[result.error]||"تعذر تنفيذ الإجراء. راجع البيانات والصلاحيات.");return;}
   if(action==="inspect"){setPreview(result);setSerial(result.serial);}
   else{setMessage(`تم اعتماد الغسلة ${result.serviceNo}. الكوبون مستخدم، وسُجل مستحق المغسلة ${result.amount} ر.س بكشف الحساب.`);setSerial("");router.refresh();}
  }catch{setMessage("تعذر التأكد من النتيجة بسبب الاتصال. افحص حالة الكوبون مجددًا؛ لا تُكرر الاعتماد دون التحقق.");}
  finally{lock.current=false;setBusy(false);}
 }
 return <div id="coupon-scanner">
  <BarcodeCamera disabled={busy} onRead={value=>{setSerial(value);void request("inspect",value);}}/>
  <form className="intakeForm" onSubmit={e=>{e.preventDefault();void request("inspect",serial);}}>
   <label>رقم الكوبون أو الرابط<input value={serial} onChange={e=>{setSerial(e.target.value);setPreview(null);setMatched(false);setMessage("");}} disabled={busy} required maxLength={2048} placeholder="YCD-0010 أو رابط QR" dir="ltr"/></label>
   <button disabled={busy}>{busy?"جارٍ التحقق…":"فحص الكوبون"}</button>
  </form>
  {preview&&<section className="panel" aria-label="نتيجة فحص الكوبون"><h3>كوبون صالح للاستخدام: {preview.serial}</h3><p>العميل: {preview.customer}</p><p>السيارة: {preview.vehicle||"غير مسجلة"} — اللوحة: <b>{preview.plate}</b></p><p>المغسلة: {preview.agreement}</p><p>صالح حتى: {preview.expiresAt?new Date(preview.expiresAt).toLocaleDateString("en-GB",{timeZone:"Asia/Riyadh"}):"حسب سياسة المركز"}</p><p>المستحق للغسلة: <b>{preview.amount} ر.س</b></p>
   <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={matched} onChange={e=>setMatched(e.target.checked)} style={{width:"auto"}}/>أؤكد مطابقة السيارة وإتمام الغسلة.</label>
   <button type="button" disabled={busy||!matched} onClick={()=>request("redeem",preview.serial)}>اعتماد الغسلة واستخدام الكوبون وتسجيل المستحق</button>
  </section>}
  {message&&<p className="formNotice" role="status">{message}</p>}
 </div>;
}
