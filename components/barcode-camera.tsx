"use client";
import { useEffect, useRef, useState } from "react";
export default function BarcodeCamera({onRead,disabled=false}:{onRead:(value:string)=>void;disabled?:boolean}) {
  const video=useRef<HTMLVideoElement>(null), stream=useRef<MediaStream|null>(null);
  const controls=useRef<{stop:()=>void}|null>(null), generation=useRef(0);
  const [active,setActive]=useState(false),[error,setError]=useState("");
  function release(){generation.current++;controls.current?.stop();controls.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(video.current)video.current.srcObject=null;}
  function stop(){release();setActive(false);}
  useEffect(()=>{const hide=()=>{if(document.hidden)stop();};document.addEventListener("visibilitychange",hide);return()=>{document.removeEventListener("visibilitychange",hide);release();};},[]);
  useEffect(()=>{if(disabled)stop();},[disabled]);
  async function start(){
    if(active||disabled)return;
    release();const ticket=generation.current;setError("");setActive(true);
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("CAMERA_UNAVAILABLE");
      const {BrowserMultiFormatReader}=await import("@zxing/browser");
      if(ticket!==generation.current)return;
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
      if(ticket!==generation.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;
      const reader=new BrowserMultiFormatReader();
      const controller=await reader.decodeFromStream(media,video.current!,result=>{
        if(result&&ticket===generation.current){const value=result.getText();stop();onRead(value);}
      });
      if(ticket!==generation.current)controller.stop();else controls.current=controller;
    }catch(e){
      if(ticket!==generation.current)return;
      stop();const name=e instanceof Error?e.name:"";
      setError(name==="NotAllowedError"?"اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح، ثم أعد المحاولة.":name==="NotFoundError"?"لم يتم العثور على كاميرا. يمكنك إدخال رقم الكوبون يدويًا.":"تعذر تشغيل الكاميرا. أغلق التطبيقات التي تستخدمها وأعد المحاولة، أو أدخل الرقم يدويًا.");
    }
  }
  return <div>
    <button type="button" onClick={active?stop:start} disabled={disabled}>{active?"إغلاق الكاميرا":"مسح الكوبون بالكاميرا"}</button>
    <div hidden={!active} style={{marginTop:12}}><video ref={video} autoPlay playsInline muted aria-label="كاميرا قراءة الكوبون" style={{width:"100%",maxWidth:520,borderRadius:12,background:"#111"}}/><p>وجّه الكاميرا نحو QR أو باركود الكوبون. القراءة وحدها لا تستخدم الكوبون.</p></div>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
