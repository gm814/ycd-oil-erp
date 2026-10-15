"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
type Preview={name:string;balance:string;snapshot:string;rows:{id:string;amount:string;description:string;reference:string|null;date:string}[]};
export default function TestBalanceForm({accounts}:{accounts:{id:string;nameAr:string}[]}){
 const router=useRouter(); const [id,setId]=useState(""); const [p,setP]=useState<Preview|null>(null); const [reason,setReason]=useState("");const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const errors:Record<string,string>={OPEN_SHIFT_EXISTS:"توجد وردية مفتوحة؛ راجعها قبل التسوية. لا تغلقها بأرقام غير فعلية.",STALE_PREVIEW:"تغيرت الحركات؛ أعد المعاينة.",ALREADY_RECONCILED:"سُجلت تسوية سابقة لهذا الحساب؛ لا يمكن تكرارها.",NO_POSITIVE_BALANCE:"لا يوجد رصيد موجب لتسويته.",ACCOUNT_NOT_ELIGIBLE:"الحساب غير مؤهل لهذه التسوية.",FORBIDDEN:"يلزم صلاحية إدارة المالية."};
 async function run(post=false){
  if(post&&(!p||!confirmed||reason.trim().length<10))return;
  if(post&&!confirm(`تأكيد استبعاد رصيد تجريبي ${p!.balance} ريال من ${p!.name}؟ لن تتغير الفواتير أو المخزون.`))return;
  setBusy(true);setMessage("");
  try{const r=await fetch(`/api/secure/finance/test-balance${post?"":`?accountId=${encodeURIComponent(id)}`}`,post?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({accountId:id,snapshot:p!.snapshot,reason,confirmed})}:{cache:"no-store"});const data=await r.json();if(!r.ok){setMessage(errors[data.error]??"تعذر التنفيذ؛ حدّث الصفحة وراجع الحساب قبل إعادة المحاولة.");return;}if(post){setP(null);setConfirmed(false);setMessage(`تمت التسوية ${data.documentNo??""}، رصيد الحساب الآن 0.00 ريال. لم تُفتح وردية ولم تُصدر فاتورة.`);router.refresh();}else{setP(data);setConfirmed(false);}}catch{setMessage("تعذر الاتصال؛ حدّث الصفحة وتحقق من رصيد الحساب قبل إعادة المحاولة.");}finally{setBusy(false);}
 }
 return <section className="panel"><h2>تسوية الرصيد النقدي التجريبي</h2><p>للحسابات النقدية التجريبية فقط، مرة واحدة لكل حساب. قيد تسوية موثّق دون حذف الحركات أو تعديل الفواتير والضريبة والمخزون. لا تستخدمه لحساب يحتوي عمليات حقيقية. المبيعات غير المسجلة تُدخل بفواتيرها، وليست رصيدًا افتتاحيًا.</p>
 <label>الحساب<select disabled={busy} value={id} onChange={e=>{setId(e.target.value);setP(null);setConfirmed(false);setMessage("");}}><option value="">اختر الحساب التجريبي</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.nameAr}</option>)}</select></label>
 <button disabled={busy||!id} onClick={()=>run()}>معاينة الحركات والتسوية</button>
 {p&&<div><p>الرصيد المسجل: {p.balance} ريال — قيد التسوية: -{p.balance} — الرصيد بعد التسوية: 0.00</p><table><thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>المبلغ</th></tr></thead><tbody>{p.rows.map(r=><tr key={r.id}><td>{new Date(r.date).toLocaleString("en-GB",{timeZone:"Asia/Riyadh"})}</td><td>{r.description}</td><td>{r.reference}</td><td>{r.amount}</td></tr>)}</tbody></table><label>سبب التسوية<textarea disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>راجعت جميع الحركات المعروضة وأؤكد أنها تجريبية ولا تمثل نقدًا حقيقيًا، ولا تشمل مبيعات الدفتر أو الخدمة الحالية.</label><button disabled={busy||!confirmed||reason.trim().length<10} onClick={()=>run(true)}>اعتماد تسوية الرصيد التجريبي إلى صفر</button></div>}
 {message&&<p role="status">{message}</p>}</section>;
}
