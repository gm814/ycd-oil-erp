"use client";
import { useEffect, useState } from "react";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function InstallApp() {
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null); const [help,setHelp]=useState(false); const [installed,setInstalled]=useState(false); const [offline,setOffline]=useState(false);
 useEffect(()=>{
  const check=()=>{setInstalled(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone));setOffline(!navigator.onLine);};check();
  const receive=(e:Event)=>{e.preventDefault();setPrompt(e as InstallPrompt);};
  const done=()=>{setInstalled(true);setPrompt(null);};
  window.addEventListener("beforeinstallprompt",receive);window.addEventListener("appinstalled",done);window.addEventListener("online",check);window.addEventListener("offline",check);
  if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
  return ()=>{window.removeEventListener("beforeinstallprompt",receive);window.removeEventListener("appinstalled",done);window.removeEventListener("online",check);window.removeEventListener("offline",check);};
 },[]);
 useEffect(()=>{if(!help)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setHelp(false);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[help]);
 async function install(){if(prompt){await prompt.prompt();await prompt.userChoice;setPrompt(null);}else setHelp(true);}
 return <>{offline&&<div className="connectionNotice" role="status">لا يوجد اتصال بالإنترنت. اتصل بالشبكة لعرض البيانات وحفظ العمليات.</div>}{!installed&&<button className="installAppButton" onClick={install}>＋ تثبيت التطبيق</button>}{help&&<div className="installOverlay" onClick={()=>setHelp(false)}><section role="dialog" aria-modal="true" aria-label="تثبيت التطبيق" className="installDialog" onClick={e=>e.stopPropagation()}><button autoFocus onClick={()=>setHelp(false)} aria-label="إغلاق تعليمات التثبيت">×</button><h2>تثبيت YCD OIL</h2><p><b>iPhone وiPad:</b> افتح الموقع في Safari، واضغط مشاركة، ثم «إضافة إلى الشاشة الرئيسية».</p><p><b>Android:</b> افتح الموقع في Chrome، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» من القائمة.</p><p><b>الكمبيوتر:</b> من Chrome أو Edge اضغط علامة التثبيت بجوار شريط العنوان، أو استخدم الموقع مباشرة في متصفحك.</p><small>يتطلب تسجيل الدخول وتنفيذ العمليات اتصالًا بالإنترنت.</small></section></div>}</>;
}
