"use client";
import { useState } from "react";
export default function MessageButton({ campaignId, customerId }: { campaignId:string; customerId:string }) {
 const [busy,setBusy]=useState(false);const [url,setUrl]=useState("");const [error,setError]=useState("");
 async function prepare(){setBusy(true);setError("");setUrl("");try{const r=await fetch("/api/secure/marketing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"handoff",campaignId,customerId})});const data=await r.json();if(!r.ok){setError("تعذر تجهيز الرسالة؛ تحقق من موافقة العميل ورقم الجوال.");return;}setUrl(data.url);}catch{setError("تعذر الاتصال.");}finally{setBusy(false);}}
 return <span><button onClick={prepare} disabled={busy}>{busy?"جارٍ التجهيز…":"تجهيز رسالة العميل"}</button>{url&&<a href={url} target="_blank" rel="noreferrer">فتح تطبيق الرسائل ومراجعة الإرسال</a>}{error&&<span role="status">{error}</span>}</span>;
}
