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

let reminderFonts: Promise<void> | undefined;
function loadReminderFonts() {
  if (!reminderFonts) reminderFonts = Promise.all([
    ["Card", "NotoNaskhArabic-Regular", "400"], ["Card", "NotoNaskhArabic-Bold", "700"],
    ["Latin", "NotoSans-Regular", "400"], ["Latin", "NotoSans-Bold", "700"],
  ].map(async ([family, file, weight]) => {
    const font = new FontFace(family, `url(/brand/fonts/${file}.woff)`, {weight});
    document.fonts.add(await font.load());
  })).then(() => undefined).catch(() => {
    reminderFonts = undefined;
    throw new Error("تعذر تحميل خط البطاقة المعتمد. تحقق من الاتصال ثم حدّث الصفحة.");
  });
  return reminderFonts;
}

async function createCard(data: ThermalReminderData): Promise<Blob> {
  await loadReminderFonts();
  const logo = new Image(); logo.src = "/brand/ycd-logo-source.svg"; await logo.decode();
  const canvas = document.createElement("canvas"); canvas.width=1200; canvas.height=2400;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز صورة البطاقة.");
  const c: CanvasRenderingContext2D = context;
const fontPx=12/(50*72/25.4)*1200;
const gold='#b8860b',ink='#252b35';
c.fillStyle='white';c.fillRect(0,0,1200,2400);
function box(x:number,y:number,w:number,h:number,fill='white',r=20){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();c.strokeStyle='#d9c797';c.lineWidth=2;c.stroke();}
box(22,22,1156,2356,'white',48);
c.save();c.beginPath();c.roundRect(28,28,1144,2344,42);c.clip();
for(const bottom of [false,true]){c.save();if(bottom){c.translate(1200,2400);c.rotate(Math.PI);}const g=c.createLinearGradient(0,0,260,180);g.addColorStop(0,'#986300');g.addColorStop(.5,'#f6cf55');g.addColorStop(1,gold);c.fillStyle=g;c.beginPath();c.moveTo(0,0);c.lineTo(300,0);c.quadraticCurveTo(95,65,0,270);c.fill();c.strokeStyle='white';c.lineWidth=42;c.beginPath();c.moveTo(0,205);c.quadraticCurveTo(90,70,250,0);c.stroke();c.strokeStyle='#bfc0c3';c.lineWidth=22;c.stroke();c.restore();}c.restore();
c.drawImage(logo,450,35,300,173);
function font(bold:boolean,value=""){c.font=`${bold?700:400} ${fontPx}px ${/[\u0600-\u06ff]/.test(value)?"Card":"Latin"}`;c.direction='rtl';c.textAlign='center';c.textBaseline='middle';}
function wrap(s:string,bold:boolean){font(bold,s);const a:string[]=[];let line='';for(const word of s.split(' ')){const next=line?line+' '+word:word;if(c.measureText(next).width>1080&&line){a.push(line);line=word;}else line=next;}if(line)a.push(line);for(const l of a)if(c.measureText(l).width>1080)throw Error('يوجد نص طويل لا يتسع للبطاقة بحجم خط 12. يرجى اختصاره قبل المشاركة.');return a;}
function text(s:string,y:number,bold=true,color=ink){font(bold,s);c.fillStyle=color;c.fillText(s,600,y);}
text('تذكير الخدمة القادمة',267,true,gold);
let y=335;
const rows=[['العداد القادم · كم',data.nextKm],['التاريخ القادم',data.nextDate],['السيارة / الموديل',data.vehicle.replace(/ · /g,' ')],['رقم اللوحة',data.plate],['العداد الحالي · كم',data.odometer],['تاريخ الخدمة',data.serviceDate],['الخدمة / الزيت',data.service]];
for(let i=0;i<rows.length;i++){const [label,value]=rows[i];const labels=wrap(label,false),values=wrap(value,true);const h=(labels.length+values.length)*110+40;box(50,y,1100,h,i<2||i===6?'#fffaf0':'white');let baseline=y+75;for(const l of labels){text(l,baseline,false,'#656565');baseline+=110;}for(const l of values){text(l,baseline,true);baseline+=110;}y+=h+8;}

if(y>2240)throw Error('البيانات طويلة على البطاقة بحجم خط 12. يرجى اختصار وصف الخدمة أو السيارة قبل المشاركة.');
c.strokeStyle=gold;c.beginPath();c.moveTo(150,2250);c.lineTo(1050,2250);c.stroke();text(data.phone,2315,true);
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
    {image?<img src={image} alt={`بطاقة تذكير الخدمة — ${data.vehicle} — العداد القادم ${data.nextKm} — التاريخ القادم ${data.nextDate}`} width={1200} height={2400} style={{display:"block",width:"100%",maxWidth:450,height:"auto"}}/>:!error&&<p role="status">جاري تجهيز البطاقة…</p>}
  </section>;
}
