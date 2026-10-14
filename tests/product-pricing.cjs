const assert = require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file, stubs={}) {
 const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:n=>stubs[n]||require(n)});return m.exports;
}
const helper=load('lib/product-pricing.ts');
const p={costPrice:20,costBasedPricing:true,active:true};
assert.equal(helper.productPriceRange(p).min.toFixed(2),'25.00');
assert.equal(helper.productPriceRange(p).max.toFixed(2),'120.00');
assert.equal(helper.productPriceRange({...p,costPrice:1.01}).min.toFixed(2),'1.27');
for(const [q,price,discount] of [[1,25,0],[1,120,0],[2,30,10]]) helper.validateProductPrice(p,q,price,discount);
for(const [q,price,discount] of [[1,24.99,0],[1,120.01,0],[2,30,10.01],[1,25,0.01],[1,121,100]]) assert.throws(()=>helper.validateProductPrice(p,q,price,discount),/PRICE_OUT_OF_RANGE/);
assert.throws(()=>helper.validateProductPrice({...p,active:false},1,25),/PRODUCT_INACTIVE/);
helper.validateProductPrice({...p,costBasedPricing:false},1,1);
let writes=0, session={userId:'u',branchId:'b',permissions:['service_order.create']};
const api=load('app/api/secure/service-orders/[id]/items/route.ts',{
 '@/lib/product-pricing':helper,'@/lib/auth':{getSession:async()=>session},
 '@/lib/rbac':{PERMISSIONS:{SERVICE_ORDER_CREATE:'service_order.create'},hasPermission:(p,v)=>p.includes(v)},
 '@/lib/db':{db:{$transaction:async fn=>fn({serviceOrder:{findUnique:async()=>({id:'o',branchId:'b',status:'OPEN'})},product:{findUnique:async()=>p},serviceOrderItem:{create:async({data})=>{writes++;return {...data,id:'i'}}},auditLog:{create:async()=>{}}})}}
});
(async()=>{
 const call=(price,discount=0)=>api.POST(new Request('https://test/items',{method:'POST',body:JSON.stringify({productId:'p',descriptionAr:'اختبار',quantity:2,unitPrice:price,discount})}),{params:Promise.resolve({id:'o'})});
 assert.equal((await call(30,10.01)).status,409);assert.equal(writes,0);
 assert.equal((await call(30,10)).status,201);assert.equal(writes,1);
 session=null;assert.equal((await call(30)).status,401);
 console.log('Passed: price bounds, upward minimum rounding, discounts, inactive products, server-side enforcement and authentication.');
})().catch(e=>{console.error(e);process.exitCode=1});
