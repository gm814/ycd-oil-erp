const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let permitted,order,shifts,failAudit,writes;
function reset(){permitted=true;failAudit=false;writes=[];order={id:'o',branchId:'b',shiftId:'old',status:'OPEN',channel:'OIL',invoice:null,shift:{id:'old',branchId:'b',closedAt:new Date()}};shifts=[{id:'new'}];}
const db={$transaction:async fn=>{const pending=[];const result=await fn({serviceOrder:{findFirst:async({where})=>where.id==='o'&&where.branchId==='b'?order:null,updateMany:async({where,data})=>{assert.equal(where.branchId,'b');assert.deepEqual(JSON.parse(JSON.stringify(where.invoice)),{is:null});pending.push(data);return{count:1}}},shift:{findMany:async({where})=>{assert.equal(where.branchId,'b');assert.equal(where.closedAt,null);return shifts}},auditLog:{create:async({data})=>{if(failAudit)throw Error('audit fail');pending.push(data)}}});writes.push(...pending);return result}};
const m={exports:{}};
const stubs={'@/lib/db':{db},'@/lib/auth':{getSession:async()=>({userId:'admin',branchId:'b',permissions:[]})},'@/lib/rbac':{PERMISSIONS:{FINANCE_MANAGE:'finance',SERVICE_ORDER_APPROVE:'approve'},hasPermission:()=>permitted}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/secure/service-orders/[id]/shift/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>stubs[n]||require(n)});
const post=(extra={})=>m.exports.POST(new Request('https://test',{method:'POST',body:JSON.stringify({previousShiftId:'old',targetShiftId:'new',confirmed:true,...extra})}),{params:Promise.resolve({id:'o'})});
(async()=>{
 reset();assert.equal((await post()).status,200);assert.equal(writes.length,2);assert.equal(writes[0].shiftId,'new');assert.equal(writes[1].beforeJson.shiftId,'old');
 for(const change of [()=>permitted=false,()=>order.invoice={},()=>order.status='COMPLETED',()=>order.status='CANCELLED',()=>order.shift.closedAt=null,()=>order.shift.branchId='other',()=>shifts=[],()=>shifts=[{id:'new'},{id:'second'}],()=>order.shiftId='changed',()=>failAudit=true]){reset();change();assert.ok((await post()).status>=400);assert.equal(writes.length,0)}
 reset();assert.equal((await post({confirmed:false})).status,400);assert.equal(writes.length,0);
 reset();order.shiftId='new';assert.equal((await post()).status,200);assert.equal(writes.length,0);
 console.log('PASS: authorized transfer, branch scope, locked orders, stale/open shifts, atomic audit and repeat safety');
})().catch(e=>{console.error(e);process.exit(1)});
