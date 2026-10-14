const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');
function load(file, stubs = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), Response, Date, console }, { filename: file });
  return module.exports;
}
const helper = load('lib/oil-service-interval.ts');
const inputs = load('lib/oil-service-interval-input.ts');
const oil = km => ({ product: { category: 'OIL', serviceIntervalKm: km } });
assert.equal(helper.oilServiceReminder(50000, [oil(5000)]).nextKm, 55000);
assert.equal(helper.oilServiceReminder(50000, [oil(10000)]).nextKm, 60000);
assert.equal(helper.oilServiceReminder(0, [oil(5000)]).nextKm, 5000);
assert.equal(helper.oilServiceReminder(50000, [oil(5000), oil(5000), {product:{category:'FILTER'}}]).nextKm, 55000);
assert.equal(helper.oilServiceReminder(50000, [oil(5000), oil(10000)]).reason, 'CONFLICT');
assert.equal(helper.oilServiceReminder(50000, [oil(null)]).reason, 'UNCONFIGURED');
assert.equal(helper.oilServiceReminder(null, [oil(5000)]).reason, 'NO_ODOMETER');
assert.equal(helper.oilServiceReminder(50000, [{product:{category:'SERVICE'}}]).reason, 'NO_OIL');
for (const value of [5000, '5000', 10000, '10000', null, '', undefined]) assert.ok(inputs.serviceIntervalInput.safeParse(value).success);
for (const value of [0, -5000, 7000, '5w30', true]) assert.equal(inputs.serviceIntervalInput.safeParse(value).success, false);
let history;
let invoice;
let order;
const tx = {
  payment: {findUnique: async()=>null, findMany: async()=>[]},
  serviceOrder: {findUnique: async()=>order, update: async()=>({})},
  shift: {findFirst: async()=>({id:'shift'})},
  stockMovement: {aggregate: async()=>({_sum:{quantity:new Prisma.Decimal(10)}}),create:async()=>({})},
  invoice: {create: async({data})=>invoice={...data,id:'invoice'},findUniqueOrThrow:async()=>invoice},
  washAgreement: {findUnique:async()=>null},
  vehicleHistory: {create:async({data})=>{history=data;}},
  vehicle: {update:async()=>({})}, auditLog:{create:async()=>({})},
};
const complete = load('services/service-order.ts', {
  '@/lib/oil-service-interval':helper,
  '@/lib/product-pricing':load('lib/product-pricing.ts'),
  '@/services/cash-drawer':{receiptAccount:async()=>null},
  '@/lib/document-number':{nextDocumentNumber:async()=>'TEST-1'},
  '@/services/medad/outbox':{captureMedad:async()=>{}},
  '@/services/loyalty':{earnLoyalty:async()=>{}}, '@/lib/db':{db:{}},
  '@/lib/config':{companyConfig:{vatRate:0.15}},
}).completeServiceOrderInTransaction;
let session;
let writes;
const product = {id:'oil',category:'OIL',serviceIntervalKm:5000};
const api = load('app/api/secure/inventory/products/route.ts', {
  '@/lib/oil-service-interval-input':inputs,
  '@/lib/rbac':load('lib/rbac.ts'),
  '@/lib/auth':{getSession:async()=>session},
  'next/server':{NextResponse:{json:(v,o)=>Response.json(v,o)}},
  '@/lib/db':{db:{$transaction:async fn=>fn({product:{findUnique:async()=>product,update:async({data})=>writes.push(data)},auditLog:{create:async()=>{}}})}},
});
async function main(){
  for(const km of [5000,10000,null]){
    order={id:'order',branchId:'branch',vehicleId:'car',customerId:'customer',shiftId:'shift',status:'OPEN',channel:'OIL',odometer:50000,vehicle:{currentOdometer:50000},customer:{},items:[{productId:'oil',...oil(km),quantity:new Prisma.Decimal(1),unitPrice:new Prisma.Decimal(0),discount:new Prisma.Decimal(0)}]};
    await complete(tx,{serviceOrderId:'order',branchId:'branch',actorId:'user',paymentMethod:'CASH',nextServiceKm:99999,idempotencyReference:'test'});
    assert.equal(history.nextServiceKm,km?50000+km:undefined); // Server derives from product, not browser input.
    assert.equal(history.nextServiceAt,undefined);
  }
  order.items[0].product = { category: 'OIL', serviceIntervalKm: 5000, active: true, costBasedPricing: true, costPrice: new Prisma.Decimal(20) };
  order.items[0].unitPrice = new Prisma.Decimal(24.99);
  await assert.rejects(complete(tx,{serviceOrderId:'order',branchId:'branch',actorId:'user',paymentMethod:'CASH',idempotencyReference:'pricing'}), /PRICE_OUT_OF_RANGE/);
  const call=body=>api.PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify(body)}));
  writes=[];session=null;assert.equal((await call({productId:'oil',serviceIntervalKm:10000})).status,401);
  session={userId:'cashier',permissions:['invoice.issue']};assert.equal((await call({productId:'oil',serviceIntervalKm:10000})).status,403);assert.equal(writes.length,0);
  session={userId:'admin',permissions:['inventory.manage']};assert.equal((await call({productId:'oil',serviceIntervalKm:7000})).status,400);
  assert.equal((await call({productId:'oil',serviceIntervalKm:10000})).status,200);assert.equal(writes[0].serviceIntervalKm,10000);
  product.category='FILTER';assert.equal((await call({productId:'oil',serviceIntervalKm:5000})).status,404);
  console.log('Passed: 5k/10k calculations, missing/conflicting configuration, server-side persisted reminder, blank date, validation and inventory permissions.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
