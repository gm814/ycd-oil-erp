const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), ts = require('typescript');
const root = process.cwd();
function load(file, mocks = {}) {
  const m = { exports: {} };
  const req = name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? load(name.slice(2)+'.ts', mocks) : name.startsWith('.') ? load(path.normalize(path.join(path.dirname(file),name))+'.ts',mocks) : require(name);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText, {module:m,exports:m.exports,require:req,Buffer,Date,URL,Response,process,setTimeout,clearTimeout,console}, { filename:file });
  return m.exports;
}
const {washEligibility}=load('lib/wash-eligibility.ts');
const oil={quantity:4,product:{category:'OIL',serviceIntervalKm:5000,grantsWashCoupon:false}};
const filter={quantity:1,product:{category:'FILTER',isOilFilter:true}};
const other={quantity:1,product:{category:'FILTER',isOilFilter:false,grantsWashCoupon:true}};
for(const [channel,items,expected] of [['OIL',[oil,filter],true],['OIL',[oil],false],['OIL',[filter],false],['OIL',[oil,other],false],['WASH',[oil,filter],false],['OIL',[oil,{...filter,quantity:0}],false],['OIL',[{...oil,quantity:-1},filter],false],['OIL',[],false]]) assert.equal(washEligibility({channel,items}).eligible,expected);
process.env.AUTH_SECRET='isolated-test-secret-not-production';process.env.APP_ORIGIN='https://example.test';
const tokens=load('lib/customer-package-token.ts');
const now=Date.now(), token=tokens.createPackageToken('invoice_test',now);
assert.equal(tokens.readPackageToken(token,now),'invoice_test');
assert.equal(tokens.readPackageToken(token,now+7*86400000),null);
assert.equal(tokens.readPackageToken(token+'x',now),null);
assert.equal(tokens.readPackageToken(token.replace(/^./,token[0]==='x'?'y':'x'),now),null);
assert.equal(tokens.readPackageToken(token+'.extra',now),null);
assert.equal(load('lib/coupon-link.ts').couponSerialFromToken(token),null); // Purpose separation.
let creates=0,audits=[],lookup,invoice;
const actor={userId:'actor',branchId:'branch',permissions:['invoice.issue','service_order.approve']};
const tx={invoice:{findFirst:async args=>{lookup=args.where;return invoice&&lookup.serviceOrder.branchId==='branch'?invoice:null;}},coupon:{create:async({data})=>{creates++;const c={id:'coupon',status:'ACTIVE',...data};invoice.coupons.push(c);return c;}},auditLog:{create:async({data})=>audits.push(data)}};
const mocks={'@/lib/db':{db:{$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(tx);}}},'@/lib/document-number':{nextDocumentNumber:async()=>`TEST-${creates+1}`}};
const service=load('services/customer-package.ts',mocks);
function reset(items=[oil,filter]){creates=0;audits=[];invoice={id:'invoice',invoiceNo:'TEST-1',serviceOrderId:'order',documentType:'INVOICE',status:'PAID',coupons:[],returns:[],customer:{name:'عميل اختبار',phone:'0501234567'},serviceOrder:{channel:'OIL',status:'COMPLETED',items}};}
const prepare=(waive=false,reason='')=>service.prepareCustomerPackage(actor,'invoice',waive,reason);
(async()=>{
 reset(); assert.equal((await prepare()).couponState,'ACTIVE');assert.equal(creates,1);assert.equal(audits[0].afterJson.filterWaived,false);
 await prepare();assert.equal(creates,1); // repeated preparation never creates duplicate rewards
 invoice.coupons[0].status='USED';assert.equal((await prepare()).couponState,'UNAVAILABLE');assert.equal(creates,1);
 reset([oil]);assert.equal((await prepare()).couponState,'FILTER_REQUIRED');assert.equal(creates,0);
 assert.equal((await prepare(true,'Approved filter exception')).couponState,'ACTIVE');assert.equal(audits[0].afterJson.filterWaived,true);assert.equal(audits[0].actorId,'actor');
 reset([filter]);await assert.rejects(()=>prepare(true,'Exception'),/OIL_REQUIRED/);assert.equal(creates,0);
 reset([oil]);await assert.rejects(()=>prepare(true,'x'),/OVERRIDE_FORBIDDEN/);assert.equal(creates,0);
 await assert.rejects(()=>service.prepareCustomerPackage({...actor,permissions:['invoice.issue']},'invoice',true,'Exception'),/OVERRIDE_FORBIDDEN/);
 await assert.rejects(()=>service.prepareCustomerPackage({...actor,permissions:[]},'invoice',false,''),/FORBIDDEN/);
 await assert.rejects(()=>service.prepareCustomerPackage({...actor,branchId:'other'},'invoice',false,''),/INVOICE_NOT_FOUND/);assert.equal(creates,0);
 reset();invoice.status='VOID';await assert.rejects(()=>prepare(),/INVOICE_NOT_ELIGIBLE/);
 reset();invoice.documentType='DEBIT_NOTE';await assert.rejects(()=>prepare(),/INVOICE_NOT_ELIGIBLE/);
 reset();invoice.returns=[{total:1}];assert.equal((await prepare()).couponState,'RETURN_REVIEW');assert.equal(creates,0);await assert.rejects(()=>prepare(true,'Exception'),/RETURN_REVIEW_REQUIRED/);
 // New completion uses the same eligibility policy even if legacy ALL/product flags exist.
 let completeOrder, completedInvoice, completionCoupons=0;
 const {Prisma}=require('@prisma/client'), D=n=>new Prisma.Decimal(n);
 const completeTx={payment:{findUnique:async()=>null,findMany:async()=>[]},serviceOrder:{findUnique:async()=>completeOrder,update:async()=>({})},shift:{findFirst:async()=>({id:'shift'})},stockMovement:{aggregate:async()=>({_sum:{quantity:D(100)}}),create:async()=>({})},invoice:{create:async({data})=>completedInvoice={...data,id:'invoice'},findUniqueOrThrow:async()=>completedInvoice},coupon:{create:async()=>{completionCoupons++;}},vehicleHistory:{create:async()=>({})},vehicle:{update:async()=>({})},auditLog:{create:async()=>({})},washAgreement:{findUnique:async()=>({issueMode:'ALL'})}};
 const complete=load('services/service-order.ts',{...mocks,'@/services/cash-drawer':{receiptAccount:async()=>null},'@/services/medad/outbox':{captureMedad:async()=>{}},'@/services/loyalty':{earnLoyalty:async()=>{}}}).completeServiceOrderInTransaction;
 for(const [items,expected] of [[[oil,filter],1],[[oil],0],[[filter],0],[[oil,other],0]]){
   completionCoupons=0;completeOrder={id:'order',branchId:'branch',shiftId:'shift',channel:'OIL',status:'OPEN',odometer:50000,vehicleId:'vehicle',vehicle:{currentOdometer:50000},customerId:'customer',customer:{},items:items.map(i=>({...i,quantity:D(i.quantity),unitPrice:D(0),discount:D(0)}))};
   await complete(completeTx,{serviceOrderId:'order',branchId:'branch',actorId:'actor',paymentMethod:'CASH',idempotencyReference:'key'});assert.equal(completionCoupons,expected);
 }
 // Actual bundle HTML, including escaping, correct next-service value and active-only coupon.
 const sample={id:'invoice_test',invoiceNo:'TEST-100',documentType:'INVOICE',status:'PAID',createdAt:new Date('2026-10-15T18:51:46Z'),subtotal:108.70,total:125,discount:0,vatAmount:16.30,vatRate:.15,customer:{name:'عميل تجريبي <script>',phone:'0501234567'},serviceOrder:{status:'COMPLETED',channel:'OIL',orderNo:'TEST-99',odometer:159542,vehicle:{plate:'أ ب ج 1234',make:'نيسان',model:'جوك',year:2023},histories:[{nextServiceKm:164542,nextServiceAt:null}],items:[{...oil,descriptionAr:'زيت محرك تخليقي 10/30',unitPrice:21.73913,discount:0},{...filter,descriptionAr:'فلتر زيت كامري',unitPrice:21.73913,discount:0}]},payments:[{amount:125,method:'CASH',paidAt:new Date()}],returns:[],coupons:[{id:'coupon',serial:'TEST-0001',status:'ACTIVE',issuedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}]};
 const {customerPackageHtml}=load('lib/customer-package-pdf.ts');
 for(const format of ['epson80','a4']){
  const html=customerPackageHtml(sample,format,fs.readFileSync('public/brand/ycd-logo-source.svg').toString('base64'));
  assert(html.includes('164,542'));assert(html.includes('كوبون غسيل سيارة مجاني'));assert(!html.includes('<script>'));assert.equal((html.match(/<section class="package-sheet[^"]*">/g)||[]).length,2);
  if(process.env.PACKAGE_QA_DIR){fs.mkdirSync(process.env.PACKAGE_QA_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PACKAGE_QA_DIR,format+'.html'),html);}
 }
 sample.coupons[0].status='USED';assert(!customerPackageHtml(sample,'a4','').includes('كوبون غسيل سيارة مجاني'));
 sample.coupons[0].status='ACTIVE';sample.coupons[0].expiresAt=new Date('2000-01-01');assert(!customerPackageHtml(sample,'a4','').includes('كوبون غسيل سيارة مجاني'));
 // PDF route: signed access must not grant access to another invoice or standalone invoice.
 const pdfMocks={...mocks,'@/lib/auth':{getSession:async()=>null},'@/lib/customer-package-pdf':{customerPackageHtml:()=>''},'@/lib/invoice-pdf':{invoicePdfInclude:{},invoicePdfHtml:()=>''},'@/lib/db':{db:{invoice:{findFirst:async()=>null}}}};
 const get=load('app/api/invoices/[id]/pdf/route.ts',pdfMocks).GET;
 const call=(id,query)=>get(new Request(`https://example.test/api/invoices/${id}/pdf?${query}`),{params:Promise.resolve({id})});
 assert.equal((await call('invoice_test',`bundle=1&token=${token}`)).status,404); // Valid signature reaches scoped object lookup.
 assert.equal((await call('other',`bundle=1&token=${token}`)).status,401);
 assert.equal((await call('invoice_test',`token=${token}`)).status,401);
 assert.equal((await call('invoice_test','bundle=1&token=invalid')).status,401);
 console.log('PASS: oil/filter eligibility, completion, mandatory oil, authorized/audited override, returns/void guards, idempotency, branch isolation, signed link scope/expiry, escaped three-document PDF');
})().catch(e=>{console.error(e);process.exitCode=1;});
