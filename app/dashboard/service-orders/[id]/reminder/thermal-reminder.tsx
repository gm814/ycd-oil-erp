"use client";
import { useRef, useState } from "react";

export type ThermalReminderData = {
  serviceDate: string; vehicle: string; plate: string; odometer: string;
  service: string; nextKm: string; nextDate: string; phone: string; website: string;
};

// Millimetres are physical dimensions, independent of the printer's DPI.
export const thermalReminderCss = `
.ycdThermalLabel,.ycdThermalLabel *{box-sizing:border-box}
.ycdThermalLabel{direction:rtl;width:100mm;height:150mm;padding:5mm;margin:0;background:white;color:black;font-family:Arial,"Noto Sans Arabic",sans-serif;font-size:12pt;line-height:1.3;display:grid;grid-template-rows:22mm 10mm 34mm 20mm 12mm 22mm 8mm;row-gap:2mm;border:0;box-shadow:none;text-align:right}
.ycdThermalLabel h1,.ycdThermalLabel p{margin:0}
.ycdThermalLabel .labelHeader{display:flex;justify-content:space-between;align-items:center;border-bottom:.25mm solid black;gap:2mm}
.ycdThermalLabel .labelHeader img{width:32mm;height:18mm;object-fit:contain;filter:grayscale(1) contrast(3)}
.ycdThermalLabel h1{font-size:16pt;font-weight:700}
.ycdThermalLabel small{font-size:9pt}
.ycdThermalLabel .labelMeta{display:flex;justify-content:space-between;align-items:center}
.ycdThermalLabel .labelNext{border:.25mm solid black;border-radius:1mm;display:grid;grid-template-columns:1fr 1fr;gap:3mm;padding:4mm 2mm;text-align:center}
.ycdThermalLabel .labelNext>div+div{border-right:.25mm solid black}
.ycdThermalLabel .labelNext span{display:block;font-size:11pt}
.ycdThermalLabel .labelNext strong{display:block;font-size:20pt;line-height:1.2;margin-top:3mm;white-space:nowrap}
.ycdThermalLabel .labelVehicle{display:grid;grid-template-columns:1.25fr 1fr;gap:2mm;align-items:center}
.ycdThermalLabel .labelVehicle b{display:block;font-size:13pt;overflow-wrap:anywhere}.ycdThermalLabel .labelVehicle small{display:block;margin-bottom:2mm}
.ycdThermalLabel .labelCurrent{display:flex;align-items:center;justify-content:space-between;border-bottom:.2mm solid black}
.ycdThermalLabel .labelService{font-size:7pt;display:block;padding-top:.4mm;overflow-wrap:anywhere}
.ycdThermalLabel .labelFooter{display:flex;justify-content:space-between;align-items:center;border-top:.2mm solid black;font-size:7pt}
.ycdThermalLabel [data-fit]{min-width:0;max-height:100%}
@media print{@page{size:100mm 150mm;margin:0}html,body{margin:0!important;padding:0!important;width:100mm;background:white}body:has(.ycdThermalLabel){height:auto}.workspace:has(.ycdThermalLabel){padding:0!important;margin:0!important;width:100mm!important;max-width:none!important}.labelPreview{border:0!important;overflow:visible!important}.ycdThermalLabel{break-inside:avoid;break-after:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;

export function ThermalLabel({ data }: { data: ThermalReminderData }) {
  return <article className="ycdThermalLabel" aria-label="ملصق تذكير الخدمة 100 × 150 ملم">
    <header className="labelHeader"><img src="/brand/ycd-logo-source.svg" alt="YCD OIL" /><div><h1>تذكير الخدمة</h1><small>SERVICE REMINDER</small></div></header>
    <div className="labelMeta"><span>تاريخ الخدمة</span><b dir="ltr">{data.serviceDate}</b></div>
    <section className="labelNext"><div><span>العداد القادم · كم</span><strong data-fit>{data.nextKm}</strong></div><div><span>التاريخ القادم</span><strong data-fit>{data.nextDate}</strong></div></section>
    <div className="labelVehicle"><div><small>السيارة / الموديل</small><b data-fit>{data.vehicle}</b></div><div><small>رقم اللوحة</small><b data-fit>{data.plate}</b></div></div>
    <div className="labelCurrent"><span>العداد الحالي · كم</span><b dir="ltr">{data.odometer}</b></div>
    <p className="labelService" data-fit><b>الخدمة / الزيت: </b>{data.service}</p>
    <footer className="labelFooter"><b dir="ltr">{data.phone}</b><span dir="ltr">{data.website}</span></footer>
  </article>;
}

export default function ThermalReminder({ data }: { data: ThermalReminderData }) {
  const preview = useRef<HTMLDivElement>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function printLabel() {
    if (busy || !preview.current) return;
    setBusy(true);setError("");
    const frame=document.createElement("iframe");
    frame.title="طباعة ملصق تذكير الخدمة";
    frame.style.cssText="position:fixed;left:-10000px;top:0;width:100mm;height:150mm;border:0";
    document.body.appendChild(frame);
    try {
      const doc=frame.contentDocument,win=frame.contentWindow;
      if(!doc||!win) throw new Error("تعذر فتح معاينة الطباعة.");
      doc.open();
      doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>YCD OIL — 100 × 150 mm</title><style>'+thermalReminderCss+'</style></head><body></body></html>');
      doc.close();
      const label=preview.current.querySelector(".ycdThermalLabel")!.cloneNode(true) as HTMLElement;
      label.querySelectorAll("img").forEach(img=>{img.src=new URL(img.getAttribute("src")!,window.location.origin).href});
      doc.body.appendChild(label);
      await doc.fonts.ready;
      await Promise.all(Array.from(doc.images).map(img=>img.decode()));
      // Never silently crop long vehicle/oil descriptions.
      for(const el of Array.from(label.querySelectorAll<HTMLElement>("[data-fit]"))){
        let size=parseFloat(win.getComputedStyle(el).fontSize);
        while((el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)&&size>8){size-=.25;el.style.fontSize=size+"px";}
        if(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1) throw new Error("وصف السيارة أو الخدمة طويل على الملصق. اختصره قبل الطباعة.");
      }
      if(label.scrollHeight>label.clientHeight+1) throw new Error("المحتوى يتجاوز مقاس الملصق؛ راجع البيانات قبل الطباعة.");
      win.addEventListener("afterprint",()=>frame.remove(),{once:true});
      win.focus();win.print();
      // Fallback for browsers that do not dispatch afterprint from a frame.
      window.setTimeout(()=>frame.remove(),120000);
    } catch(e) {frame.remove();setError(e instanceof Error?e.message:"تعذرت الطباعة.");}
    finally {setBusy(false);}
  }
  return <section>
    <div className="noPrint" style={{marginBottom:16}}>
      <button type="button" onClick={printLabel} disabled={busy}>{busy?"تجهيز الملصق…":"طباعة ملصق 100 × 150 ملم"}</button>
      <p>اختر Zebra ZD421T ومقاس الورق 100 × 150 ملم بالاتجاه الرأسي. المقياس 100%، الهوامش «بدون»، وأوقف رؤوس وتذييلات المتصفح.</p>
      <p>يجب أن تكون اللفة المركّبة بالمقاس نفسه. المعاينة أحادية اللون للطباعة بشريط أسود.</p>
      {error&&<p role="alert">{error}</p>}
    </div>
    <style>{thermalReminderCss}</style>
    <div ref={preview} className="labelPreview" style={{width:"fit-content",maxWidth:"100%",overflowX:"auto",border:"1px solid #ddd",background:"white"}}><ThermalLabel data={data} /></div>
  </section>;
}

