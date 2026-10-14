const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
let session, order = {id:'order',branchId:'branch',vehicleId:'vehicle',status:'OPEN',odometer:0,invoice:null};
let previous = null, vehicle = 0, audits = [], failAudit = false;
const db = {$transaction: async fn => {
 const nextOrder = {...order}; let nextVehicle = vehicle; const logs = [];
 const result = await fn({
  serviceOrder: {findUnique:async()=>order, findFirst:async()=>previous, update:async({data})=>Object.assign(nextOrder,data)},
  vehicle: {updateMany:async({data})=>{if(nextVehicle===null || nextVehicle<data.currentOdometer) nextVehicle=data.currentOdometer;}},
  auditLog: {create:async({data})=>{if(failAudit) throw Error('audit');logs.push(data);}},
 });
 order=nextOrder;vehicle=nextVehicle;audits.push(...logs);return result;
}};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/secure/service-orders/[id]/odometer/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>({
 '@/lib/db':{db},'@/lib/auth':{getSession:async()=>session},'@/lib/rbac':{PERMISSIONS:{SERVICE_ORDER_CREATE:'create'},hasPermission:(p,v)=>p.includes(v)}
}[n]||require(n))});
const call=(odometer=160000)=>m.exports.PATCH(new Request('https://test',{method:'PATCH',body:JSON.stringify({odometer})}),{params:Promise.resolve({id:'order'})});
(async()=>{
 assert.equal((await call()).status,401);
 session={userId:'user',branchId:'branch',permissions:[]};assert.equal((await call()).status,403);
 session.permissions=['create'];
 for(const invalid of [-1,1.5,2000001,null,'', '160000']) assert.equal((await call(invalid)).status,400);
 session.branchId='other';assert.equal((await call()).status,404);session.branchId='branch';
 for(const status of ['COMPLETED','CANCELLED']) {order.status=status;assert.equal((await call()).status,409);}order.status='OPEN';
 order.invoice={id:'invoice'};assert.equal((await call()).status,409);order.invoice=null;
 previous={id:'previous'};assert.equal((await call()).status,409);previous=null;
 failAudit=true;assert.equal((await call()).status,409);assert.equal(order.odometer,0);assert.equal(vehicle,0);failAudit=false;
 assert.equal((await call()).status,200);assert.equal(order.odometer,160000);assert.equal(vehicle,160000);
 assert.equal(audits[0].beforeJson.odometer,0);assert.equal(audits[0].afterJson.odometer,160000);
 vehicle=180000;assert.equal((await call(170000)).status,200);assert.equal(vehicle,180000);
 console.log('Passed odometer validation, permissions, branch isolation, locked orders, previous readings, audit rollback and vehicle preservation.');
})().catch(e=>{console.error(e);process.exitCode=1});
