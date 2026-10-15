const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(path, mocks = {}) {
  const m = {exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {module:m,exports:m.exports,require:n=>mocks[n]??require(n)});
  return m.exports;
}
const phone = load('lib/customer-phone.ts');
for (const value of ['0501234567','٠٥٠١٢٣٤٥٦٧','۰۵۰۱۲۳۴۵۶۷']) assert.equal(phone.isCustomerPhone(value),true);
for (const value of ['', '050123456', '05012345678','050123456x','050 1234567','+966501234567',' 0501234567']) assert.equal(phone.isCustomerPhone(value),false);
assert.equal(phone.normalizeCustomerPhone('٠٥٠١٢٣٤٥٦٧'),'0501234567');
const {offlineOrderSchema} = load('lib/offline/contracts.ts', {'@/lib/customer-phone':phone});
const payload={customerName:'Test customer',phone:'0501234567',plate:'ABC123',items:[],complete:false,paymentMethod:'CASH'};
assert.equal(offlineOrderSchema.safeParse(payload).success,true);
for(const value of ['', '050123456','05012345678']) assert.equal(offlineOrderSchema.safeParse({...payload,phone:value}).success,false);
let session={userId:'actor',branchId:'branch',permissions:['customer.view','service_order.create']};
let writes=0,audits=0,visible=true,count=1;
const tx={customer:{findFirst:async()=>visible?{id:'customer',name:'Old',phone:'05012345678'}:null,updateMany:async()=>{writes++;return {count};}},auditLog:{create:async()=>{audits++;}}};
const {PATCH}=load('app/api/secure/customers/[id]/route.ts',{
  '@/lib/customer-phone':phone,'@/lib/db':{db:{$transaction:async fn=>fn(tx)}},'@/lib/auth':{getSession:async()=>session},
  '@/lib/rbac':{PERMISSIONS:{CUSTOMER_VIEW:'customer.view',SERVICE_ORDER_CREATE:'service_order.create'},hasPermission:(p,v)=>p.includes(v)},
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}}
});
const body={name:'New name',phone:'0501234567',previousName:'Old',previousPhone:'05012345678'};
const call=b=>PATCH({json:async()=>b},{params:Promise.resolve({id:'customer'})});
(async()=>{
  assert.equal((await call({...body,phone:'05012345678'})).status,400);assert.equal(writes,0);
  session.permissions=[];assert.equal((await call(body)).status,403);assert.equal(writes,0);
  session.permissions=['customer.view','service_order.create'];visible=false;assert.equal((await call(body)).status,404);assert.equal(writes,0);
  visible=true;count=0;assert.equal((await call(body)).status,409);assert.equal(audits,0);
  count=1;assert.equal((await call(body)).status,200);assert.equal(audits,1);
  console.log('PASS: exact length, Arabic digits, offline validation, permission/scope, stale-write guard and audit');
})().catch(e=>{console.error(e);process.exitCode=1;});
