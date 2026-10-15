const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {Prisma}=require('@prisma/client');const D=v=>new Prisma.Decimal(v);
let original,posted=[],shift=true,account=true,fail=false;
function reset(){
 original={id:'original',invoiceNo:'TEST-ORIGINAL',documentType:'INVOICE',correction:null,status:'PAID',returns:[],customerId:'customer',subtotal:D(140.25),vatRate:D(.15),vatAmount:D(21.04),total:D(161.29),
 payments:[{id:'paid',method:'CARD',amount:D(161.29),reference:'TEST-REFERENCE',paidAt:new Date()}],
 serviceOrder:{vehicleId:'car',odometer:1000,items:[
 {id:'a',descriptionAr:'Item A',quantity:D(4),unitPrice:D(29.75),discount:D(0)},
 {id:'b',descriptionAr:'Item B',quantity:D(1),unitPrice:D(21.25),discount:D(0)}]}};
 posted=[];shift=true;account=true;fail=false;
}
const db={$transaction:async fn=>{
 const pending=[];
 const result=await fn({
 invoice:{findFirst:async({where})=>where.serviceOrder.branchId==='branch'?original:null,create:async({data})=>{pending.push(['invoice',data]);return {id:'note',...data};}},
 shift:{findFirst:async()=>shift?{id:'shift'}:null},
 serviceOrder:{create:async({data})=>{pending.push(['order',data]);return{id:'internal',...data};}},
 financialTransaction:{create:async({data})=>pending.push(['receipt',data])},
 auditLog:{create:async({data})=>{if(fail)throw Error('audit');pending.push(['audit',data]);}},
 });posted.push(...pending);return result;
}};
function load(file,stubs){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:n=>stubs[n]||require(n)});return m.exports;}
const service=load('services/invoice-price-correction.ts',{'@/lib/db':{db},'@/lib/document-number':{nextDocumentNumber:async()=> 'TEST-NOTE'},'@/services/cash-drawer':{receiptAccount:async()=>account?{id:'pos'}:null}});
const input={invoiceId:'original',branchId:'branch',actorId:'admin',reason:'Correct entered prices',receiptTotal:165,paymentReference:'TEST-REFERENCE',prices:[{itemId:'a',unitGross:35},{itemId:'b',unitGross:25}]};
async function rejected(change,code){reset();change();await assert.rejects(service.correctInvoicePrice(input),new RegExp(code));assert.equal(posted.length,0);}
(async()=>{
 reset();const note=await service.correctInvoicePrice(input);
 assert.equal(note.total.toFixed(2),'3.71');assert.equal(note.subtotal.toFixed(2),'3.23');assert.equal(note.vatAmount.toFixed(2),'0.48');
 assert.equal(note.correctionOfId,'original');assert.equal(original.total.toFixed(2),'161.29');
 assert.equal(note.payments.create.amount.toFixed(2),'3.71');assert.equal(posted.find(p=>p[0]==='receipt')[1].amount.toFixed(2),'3.71');
 const container=posted.find(p=>p[0]==='order')[1];assert.equal(container.channel,'PRICE_CORRECTION');
 assert.deepEqual(container.items.create.map(l=>l.unitPrice.toFixed(2)).join(','),'2.74,0.49');
 assert(container.items.create.every(l=>!l.productId)); // No stock methods exist in this mock: any issue attempt fails.
 await rejected(()=>{original.correction={id:'prior'}},'CORRECTION_EXISTS');
 await rejected(()=>{original.documentType='DEBIT_NOTE'},'CORRECTION_NOT_ALLOWED');
 await rejected(()=>{original.status='VOID'},'CORRECTION_NOT_ALLOWED');
 await rejected(()=>{original.returns=[{}]},'CORRECTION_NOT_ALLOWED');
 await rejected(()=>{original.payments[0].reference='other'},'RECEIPT_MISMATCH');
 await rejected(()=>{shift=false},'OPEN_SHIFT_REQUIRED');
 await rejected(()=>{account=false},'FINANCIAL_ACCOUNT_REQUIRED');
 await rejected(()=>{fail=true},'audit');
 reset();await assert.rejects(service.correctInvoicePrice({...input,branchId:'other'}),/INVOICE_NOT_FOUND/);
 reset();await assert.rejects(service.correctInvoicePrice({...input,receiptTotal:166}),/RECEIPT_MISMATCH/);
 reset();await assert.rejects(service.correctInvoicePrice({...input,prices:[{itemId:'a',unitGross:35},{itemId:'a',unitGross:25}]}),/INVALID_PRICES/);
 reset();await assert.rejects(service.correctInvoicePrice({...input,prices:[{itemId:'a',unitGross:30},{itemId:'b',unitGross:25}]}),/PRICE_DECREASE_NOT_SUPPORTED/);
 let session=null,called=0;
 const route=load('app/api/secure/invoices/[id]/price-correction/route.ts',{'@/lib/auth':{getSession:async()=>session},'@/lib/rbac':{PERMISSIONS:{FINANCE_MANAGE:'finance',INVOICE_ISSUE:'invoice',PAYMENT_RECEIVE:'payment'},hasPermission:(p,v)=>p.includes(v)},'@/services/invoice-price-correction':{correctInvoicePrice:async()=>{called++;return{id:'n',invoiceNo:'N'}}}});
 const call=body=>route.POST(new Request('https://test',{method:'POST',body:JSON.stringify(body)}),{params:Promise.resolve({id:'original'})});
 assert.equal((await call(input)).status,401);session={branchId:'branch',userId:'u',permissions:['invoice','payment']};assert.equal((await call(input)).status,403);session.permissions.push('finance');
 assert.equal((await call({...input,receiptTotal:165.001})).status,400);
 assert.equal((await call(input)).status,201);assert.equal(called,1);
 console.log('Passed: exact correction amounts, unchanged original/stock, branch and permissions, atomic rollback, duplicate guard, receipt matching, shift/account checks.');
})().catch(e=>{console.error(e);process.exitCode=1});
