import { z } from "zod";
// Remote hosts and credentials are server-owned. No caller-supplied URL, token or path.
const credentialsSchema=z.object({username:z.string().min(1),password:z.string().min(1)});
export type MedadLogin={subscriptionId:string;branch:number;year:string};
export type MedadRuntime={baseUrl:string;username:string;password:string;tokenField:string};
export function medadRuntime(branchId:string):MedadRuntime {
 if(process.env.MEDAD_READ_CHECK_ENABLED!=="true")throw Error("READ_CHECK_NOT_ENABLED");
 let credentials:unknown;
 try{credentials=JSON.parse(process.env.MEDAD_CREDENTIALS_JSON??"{}")[branchId];}catch{throw Error("CONNECTION_NOT_CONFIGURED");}
 const parsed=credentialsSchema.safeParse(credentials);
 if(!parsed.success || !process.env.MEDAD_API_BASE_URL || !process.env.MEDAD_TOKEN_FIELD)throw Error("CONNECTION_NOT_CONFIGURED");
 return {baseUrl:validatedBaseUrl(process.env.MEDAD_API_BASE_URL),...parsed.data,tokenField:process.env.MEDAD_TOKEN_FIELD};
}
export function validatedBaseUrl(raw:string) {
 let url:URL;try{url=new URL(raw);}catch{throw Error("UNSUPPORTED_REMOTE_HOST");}
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.hostname==="api-docs.medaderp.com"||url.hostname==="localhost"||url.hostname.endsWith(".local")||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(":"))throw Error("UNSUPPORTED_REMOTE_HOST");
 return url.toString().replace(/\/$/,"");
}
const listSchema=z.object({items:z.array(z.object({warehouseNo:z.union([z.string(),z.number()]),warehouseName:z.string().nullable().optional()}).passthrough()).max(100)});
async function jsonResponse(response:Response) {
 if(response.status===401||response.status===403)throw Error("REMOTE_AUTH_FAILED");
 if(!response.ok)throw Error("REMOTE_UNAVAILABLE");
 // Bound response bodies and never expose provider errors, passwords or tokens in UI/audit.
 const reader=response.body?.getReader();if(!reader)throw Error("REMOTE_RESPONSE_INVALID");
 const chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>256_000){await reader.cancel();throw Error("REMOTE_RESPONSE_INVALID");}chunks.push(value);}}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}catch{throw Error("REMOTE_RESPONSE_INVALID");}
}
export async function checkMedadConnection(runtime:MedadRuntime,login:MedadLogin,transport:typeof fetch=fetch) {
 const base=validatedBaseUrl(runtime.baseUrl);
 try{
  const auth=await jsonResponse(await transport(`${base}/getToken`,{method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{"content-type":"application/json"},body:JSON.stringify({...login,username:runtime.username,password:runtime.password})}));
  let token:unknown=auth;
  for(const key of runtime.tokenField.split(".")){if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)||["__proto__","constructor","prototype"].includes(key))throw Error("REMOTE_RESPONSE_INVALID");token=token&&typeof token==="object"?Object.getOwnPropertyDescriptor(token,key)?.value:undefined;}
  if(typeof token!=="string"||token.length<10||token.length>16000||/[\r\n]/.test(token))throw Error("REMOTE_RESPONSE_INVALID");
  const result=listSchema.safeParse(await jsonResponse(await transport(`${base}/warehouses?page=1&limit=20`,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${token}`}})));
  if(!result.success)throw Error("REMOTE_RESPONSE_INVALID");
  return {warehouseCountOnFirstPage:result.data.items.length};
 }catch(e){const code=e instanceof Error?e.message:"";throw Error(["REMOTE_AUTH_FAILED","REMOTE_RESPONSE_INVALID"].includes(code)?code:"REMOTE_UNAVAILABLE");}
}
