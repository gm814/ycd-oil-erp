"use client";
import { useEffect, useState } from "react";

export type ThermalReminderData = {
  serviceDate: string; vehicle: string; plate: string; odometer: string;
  service: string; nextKm: string; nextDate: string; phone: string; website: string;
  customerName: string; customerPhone: string;
};

export function whatsappNumber(value: string): string | null {
  let digits = value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/[\s()+.-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = "966" + digits.slice(1);
  else if (/^5\d{8}$/.test(digits)) digits = "966" + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

// One canvas is both the preview and exported image, preserving Arabic and layout.
async function createCard(data: ThermalReminderData): Promise<Blob> {
  await document.fonts.ready;
  const logo = new Image();
  logo.src = "/brand/ycd-logo-source.svg";
  await logo.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 1800; // Portrait, same 10:15 proportions.
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر تجهيز صورة البطاقة.");
  const gold = "#b8860b", ink = "#252b35", muted = "#656565";
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1200, 1800);
  function box(x: number, y: number, w: number, h: number, fill = "white", stroke = "#d9c797", r = 22) {
    ctx!.beginPath(); ctx!.roundRect(x, y, w, h, r);
    ctx!.fillStyle = fill; ctx!.fill(); ctx!.strokeStyle = stroke; ctx!.lineWidth = 2; ctx!.stroke();
  }
  box(22,22,1156,1756,"white",gold,48);
  ctx.save(); ctx.beginPath(); ctx.roundRect(28,28,1144,1744,42); ctx.clip();
  function ribbon(bottom: boolean) {
    ctx!.save(); if (bottom) { ctx!.translate(1200,1800); ctx!.rotate(Math.PI); }
    const gradient = ctx!.createLinearGradient(0,0,320,220);
    gradient.addColorStop(0,"#986300"); gradient.addColorStop(.5,"#f6cf55"); gradient.addColorStop(1,"#b8860b");
    ctx!.fillStyle=gradient; ctx!.beginPath(); ctx!.moveTo(0,0); ctx!.lineTo(380,0); ctx!.quadraticCurveTo(120,85,0,340); ctx!.closePath(); ctx!.fill();
    ctx!.strokeStyle="white"; ctx!.lineWidth=55; ctx!.beginPath(); ctx!.moveTo(0,260); ctx!.quadraticCurveTo(115,90,320,0); ctx!.stroke();
    ctx!.strokeStyle="#bfc0c3"; ctx!.lineWidth=29; ctx!.stroke(); ctx!.restore();
  }
  ribbon(false); ribbon(true); ctx.restore();
  function text(value: string, x: number, y: number, width: number, size = 34, color = ink, bold = true) {
    ctx!.textAlign="center"; ctx!.textBaseline="middle"; ctx!.direction="rtl";
    let fontSize=size;
    do {ctx!.font=`${bold?700:400} ${fontSize}px Arial, sans-serif`; if(ctx!.measureText(value).width<=width) break; fontSize--;} while(fontSize>20);
    ctx!.fillStyle=color; ctx!.fillText(value,x,y,width);
  }
  ctx.drawImage(logo,390,55,420,242);
  text("وجهتك الإبداعية لزيوت وخدمات السيارات",600,312,930,35,muted);
  text("OIL & AUTO SERVICE",600,357,700,28,muted,false);
  text("تذكير الخدمة القادمة",600,443,950,64,gold);
  text("SERVICE REMINDER",600,504,900,30,muted,false);
  text(`عزيزي العميل: ${data.customerName}`,600,565,1000,29,muted,false);
  box(75,615,1050,285,"#fffaf0");
  text("موعد خدمتك القادمة",600,659,960,32,gold);
  ctx.strokeStyle="#d9c797"; ctx.beginPath(); ctx.moveTo(600,707); ctx.lineTo(600,868); ctx.stroke();
  text("العداد القادم · كم",860,739,460,30,muted,false);
  text(data.nextKm,860,809,450,52);
  text("التاريخ القادم",337,739,460,30,muted,false);
  text(data.nextDate,337,809,450,48);
  function cell(label: string, value: string, x: number, y: number, width: number) {
    box(x,y,width,146); text(label,x+width/2,y+39,width-32,27,muted,false);
    text(value,x+width/2,y+96,width-36,36);
  }
  cell("السيارة / الموديل",data.vehicle,75,930,1050);
  cell("رقم اللوحة",data.plate,613,1095,512);
  cell("العداد الحالي · كم",data.odometer,75,1095,512);
  cell("تاريخ الخدمة",data.serviceDate,75,1260,1050);
  box(75,1425,1050,160,"#fffaf0");
  text("الخدمة / الزيت",600,1465,990,27,muted,false);
  // Wrap long descriptions instead of clipping or silently omitting them.
  const words=data.service.split(/\s+/); const lines:string[]=[]; let line="";
  ctx.font="700 30px Arial, sans-serif";
  for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>980&&line){lines.push(line);line=word;}else line=next;}
  if(line) lines.push(line);
  if(lines.length>3) throw new Error("وصف الخدمة طويل على البطاقة؛ يرجى اختصاره قبل المشاركة.");
  lines.forEach((value,i)=>text(value,600,1505+i*29,990,30));
  ctx.strokeStyle=gold; ctx.beginPath(); ctx.moveTo(115,1630); ctx.lineTo(1085,1630); ctx.stroke();
  text(data.phone,600,1668,800,32);
  text(data.website,600,1711,800,27,muted,false);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("تعذر حفظ صورة البطاقة.")),"image/png"));
}

export default function ServiceReminder({ data }: { data: ThermalReminderData }) {
  const [image,setImage]=useState("");
  const [blob,setBlob]=useState<Blob|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    let cancelled=false; let url="";
    createCard(data).then(result=>{if(cancelled)return;url=URL.createObjectURL(result);setBlob(result);setImage(url);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"تعذر تجهيز البطاقة.");});
    return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[data]);
  const number=whatsappNumber(data.customerPhone);
  const message=[`مرحبًا ${data.customerName}، بطاقة تذكير الخدمة من YCD OIL.`,`السيارة: ${data.vehicle}`,`اللوحة: ${data.plate}`,`تاريخ الخدمة: ${data.serviceDate}`,`العداد الحالي: ${data.odometer} كم`,`الخدمة: ${data.service}`,`العداد القادم: ${data.nextKm}`,`التاريخ القادم: ${data.nextDate}`,`للتواصل: ${data.phone}`].join("\n");
  const whatsapp=number?`https://wa.me/${number}?text=${encodeURIComponent(message)}`:null;
  function download(){const a=document.createElement("a");a.href=image;a.download="YCD-OIL-service-reminder.png";a.click();}
  async function share(){
    if(!blob)return;
    const file=new File([blob],"YCD-OIL-service-reminder.png",{type:"image/png"});
    if(navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:"YCD OIL — تذكير الخدمة",text:message});setNotice("تمت المشاركة عبر الجهاز. راجع واتساب للتأكد من إرسالها للعميل.");}
      catch(e){if(!(e instanceof Error&&e.name==="AbortError"))setError("تعذرت المشاركة؛ نزّل الصورة وأرفقها في واتساب.");}
    }else{download();setNotice("تم طلب تنزيل الصورة. افتح واتساب العميل وأرفق الصورة في المحادثة.");}
  }
  return <section>
    <div className="noPrint" style={{marginBottom:20}}>
      <h1>بطاقة تذكير الخدمة عبر واتساب</h1>
      <p>جوال العميل: <b dir="ltr">{data.customerPhone||"غير مسجل"}</b></p>
      {!number&&<p role="alert">رقم جوال العميل غير مسجل أو غير صالح. حدّثه من بيانات العميل قبل فتح محادثة واتساب.</p>}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
        <button type="button" disabled={!blob} onClick={share}>مشاركة صورة البطاقة</button>
        <button type="button" disabled={!image} onClick={download}>تنزيل صورة البطاقة</button>
        {whatsapp&&<a className="secondaryLink" href={whatsapp} target="_blank" rel="noopener noreferrer">فتح واتساب العميل</a>}
      </div>
      <p>على الجوال: اختر واتساب من المشاركة ثم العميل. على الكمبيوتر: نزّل الصورة، وافتح واتساب العميل ثم أرفقها وأرسلها.</p>
      <p>فتح واتساب يجهز نص التذكير؛ الصورة تُرفق من جهازك. لا يتم الإرسال تلقائيًا.</p>
      {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    </div>
    {image?<img src={image} alt={`بطاقة تذكير الخدمة — ${data.vehicle} — العداد القادم ${data.nextKm} — التاريخ القادم ${data.nextDate}`} width={1200} height={1800} style={{display:"block",width:"100%",maxWidth:600,height:"auto"}}/>:!error&&<p role="status">جاري تجهيز البطاقة…</p>}
  </section>;
}
