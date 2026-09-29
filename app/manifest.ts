import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
 return { name:"YCD OIL — وجهتك الإبداعية",short_name:"YCD OIL",description:"نظام الإدارة والتشغيل",start_url:"/",scope:"/",id:"/",display:"standalone",background_color:"#f3f4f6",theme_color:"#111111",lang:"ar",dir:"rtl",icons:[{src:"/brand/app-icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/brand/app-icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"}] };
}
