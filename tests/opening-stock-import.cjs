const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {Prisma}=require('@prisma/client');
let session, movements=[], audits=[], failAudit=false, products=[{id:'p',sku:'TEST',active:true,category:'OIL'}];
const db={$transaction:async fn=>{
 const pending=[],logs=[];
 const result=await fn({product:{findMany:async()=>products},stockMovement:{findMany:async({where})=>movements.filter(m=>m.branchId===where.branchId),createMany:async({data})=>{pending.push(...data.map(m=>({...m,quantity:new Prisma.Decimal(m.quantity)})));return {count:data.length}}},auditLog:{create:async({data})=>{if(failAudit)throw Error('audit failed');logs.push(data)}}});
 movements.push(...pending);audits.push(...logs);return result;
}};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/secure/inventory/opening-stock/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>({
 '@/lib/db':{db},'@/lib/auth':{getSession:async()=>session},'@/lib/rbac':{PERMISSIONS:{INVENTORY_MANAGE:'manage'},hasPermission:(p,v)=>p.includes(v)}
}[n]||require(n))});
const payload={format:'ycd-opening-stock-v1',sourceDate:'2026-10-09',rows:[{sku:'TEST',quantity:7}]};
const call=(p=payload)=>m.exports.POST(new Request('https://test',{method:'POST',body:JSON.stringify(p)}));
(async()=>{
 assert.equal((await call()).status,401);
 session={userId:'u',branchId:'b',permissions:[]};assert.equal((await call()).status,403);
 session.permissions=['manage'];
 assert.equal((await call({...payload,rows:[...payload.rows,...payload.rows]})).status,400);
 assert.equal((await call({...payload,rows:[{sku:'TEST',quantity:-1}]})).status,400);
 assert.equal((await call({...payload,rows:[{sku:'TEST',quantity:1.0001}]})).status,400);
 assert.equal((await call({...payload,rows:[{sku:'TEST',quantity:1,costPrice:12}]})).status,400);
 failAudit=true;assert.equal((await call()).status,409);assert.equal(movements.length,0);failAudit=false;
 let result=await call();assert.deepEqual(await result.json(),{created:1,skipped:0,quantity:'7'});
 result=await call();assert.deepEqual(await result.json(),{created:0,skipped:1,quantity:'0'});
 assert.equal(movements.length,1);assert.equal(audits.length,1);
 assert.equal((await call({...payload,rows:[{sku:'TEST',quantity:9}]})).status,409);
 assert.equal((await call({...payload,sourceDate:'2026-10-10'})).status,409);
 assert.equal(movements[0].quantity.toNumber(),7);
 session.branchId='other';assert.equal((await call()).status,200);assert.notEqual(movements[0].id,movements[1].id);
 session.branchId='missing';products=[];assert.equal((await call()).status,409);
 assert.equal(audits[0].afterJson.mode,'PROVISIONAL_PENDING_SALES_RECONCILIATION');
 console.log('Passed: permissions, positive quantities, duplicate rows, atomic rollback, retry deduplication, conflicting reimports, branch isolation and provisional audit.');
})().catch(e=>{console.error(e);process.exitCode=1});
