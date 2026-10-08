const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const esbuild=require('esbuild');
const {Prisma}=require('@prisma/client');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ycd-wash-scanner-'));
globalThis.__washPrisma=Prisma;
process.env.AUTH_SECRET='isolated-test-secret-not-a-production-key';
process.env.APP_ORIGIN='https://example.test';
const stubs={
 '@prisma/client':'export const Prisma=globalThis.__washPrisma;',
 '@/lib/db':'export const db={$transaction:async(fn,options)=>{if(options.isolationLevel!=="Serializable")throw Error("ISOLATION_REQUIRED");const s=globalThis.__washTest,before={...s.state,services:[...s.state.services],batches:[...s.state.batches],audits:[...s.state.audits],outbox:[...s.state.outbox]};try{return await fn(s.tx)}catch(e){s.state=before;throw e}}};',
 '@/lib/document-number':'export const nextDocumentNumber=async()=>`TEST-${++globalThis.__washTest.number}`;',
 '@/services/medad/outbox':'export const captureMedad=async(tx,branch,type,id)=>{const s=globalThis.__washTest;if(s.failOutbox)throw Error("OUTBOX_FAILED");s.state.outbox.push({branch,type,id})};',
};
async function main(){
 await esbuild.build({entryPoints:[path.join(root,'services/wash-settlement.ts'),path.join(root,'lib/coupon-link.ts')],outdir:temp,outbase:root,bundle:true,platform:'node',format:'cjs',outExtension:{'.js':'.cjs'},logLevel:'silent',plugins:[{name:'test-adapters',setup(build){build.onResolve({filter:/.*/},args=>Object.hasOwn(stubs,args.path)?{path:args.path,namespace:'test'}:undefined);build.onLoad({filter:/.*/,namespace:'test'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
 const {performWashAction:act}=require(path.join(temp,'services/wash-settlement.cjs'));
 const {couponViewUrl}=require(path.join(temp,'lib/coupon-link.cjs'));
 const user={branchId:'wash',userId:'supervisor',permissions:['coupon.redeem']};
 const scan={action:'inspect',serial:'YCD-0010'},redeem={action:'redeem',serial:'YCD-0010',expectedAmount:'25.00'};
 function reset(){
  const s={number:0,state:{status:'ACTIVE',services:[],batches:[],audits:[],outbox:[]},price:new Prisma.Decimal(25),agreement:true,operationalStatus:'LIVE'};
  s.tx={
   coupon:{findUnique:async({where})=>where.serial!=='YCD-0010'||s.missing?null:{id:'coupon-1',serial:where.serial,status:s.state.status,expiresAt:s.expiresAt??null,invoice:{status:s.void?'VOID':'PAID',customer:{name:'Test customer'},returns:s.returned?[{status:'COMPLETED'}]:[],serviceOrder:{branchId:'oil',vehicle:{plate:'1234',make:'Toyota',model:'Camry',year:2020}}}},updateMany:async({where,data})=>{if(s.loseRace||s.state.status!==where.status)return{count:0};s.state.status=data.status;return{count:1}}},
   washAgreement:{findFirst:async({where})=>{assert.equal(where.sourceBranchId,'oil');assert.equal(where.washBranchId,'wash');assert.equal(where.active,true);return s.agreement?{id:'agreement-1',sourceBranchId:'oil',nameAr:'Wash',unitAmount:s.price}:null}},
   branch:{findUniqueOrThrow:async()=>({operationalStatus:s.operationalStatus})},
   washService:{create:async({data})=>{const value={id:'service-1',...data};s.state.services.push(value);return value}},
   washBatch:{create:async({data})=>{const value={id:'batch-1',...data};s.state.batches.push(value);return value}},
   auditLog:{create:async({data})=>s.state.audits.push(data)},
  };globalThis.__washTest=s;return s;
 }
 let s=reset();let result=await act(user,scan);assert.equal(result.amount,'25.00');assert.equal(result.plate,'1234');assert.equal(s.state.status,'ACTIVE');assert.equal(s.state.services.length,0);assert.equal(s.state.batches.length,0);
 result=await act(user,{...scan,serial:couponViewUrl('YCD-0010')});assert.equal(result.serial,'YCD-0010');
 await assert.rejects(()=>act(user,{...scan,serial:couponViewUrl('YCD-0010').slice(0,-1)+'!'}),/INVALID_INPUT/);
 await assert.rejects(()=>act({...user,permissions:[]},redeem),/FORBIDDEN/);
 for(const [change,error] of [[{missing:true},'COUPON_NOT_FOUND'],[{agreement:false},'WASH_AGREEMENT_REQUIRED'],[{price:null},'WASH_PRICE_REQUIRED'],[{expiresAt:new Date('2000-01-01')},'COUPON_EXPIRED'],[{void:true},'INVOICE_REVIEW_REQUIRED'],[{returned:true},'INVOICE_REVIEW_REQUIRED']]){
  s=reset();Object.assign(s,change);await assert.rejects(()=>act(user,redeem),new RegExp(error));assert.equal(s.state.status,'ACTIVE');assert.equal(s.state.batches.length,0);
 }
 s=reset();await assert.rejects(()=>act(user,{...redeem,expectedAmount:'24'}),/WASH_PRICE_CHANGED/);assert.equal(s.state.status,'ACTIVE');
 s=reset();s.loseRace=true;await assert.rejects(()=>act(user,redeem),/COUPON_NOT_ACTIVE/);assert.equal(s.state.services.length,0);assert.equal(s.state.batches.length,0);
 s=reset();s.failOutbox=true;await assert.rejects(()=>act(user,redeem),/OUTBOX_FAILED/);assert.equal(s.state.status,'ACTIVE');assert.equal(s.state.services.length,0);assert.equal(s.state.batches.length,0);
 s=reset();result=await act(user,redeem);assert.equal(result.status,'USED');assert.equal(result.amount,'25.00');assert.equal(s.state.status,'USED');assert.equal(s.state.services[0].status,'COMPLETED');assert.equal(s.state.services[0].completedBy,user.userId);assert.equal(s.state.batches[0].status,'POSTED');assert.equal(s.state.batches[0].total.toFixed(2),'25.00');assert.equal(s.state.batches[0].idempotencyKey,'coupon-accrual:coupon-1');assert.equal(s.state.batches[0].services.connect.id,'service-1');assert.equal(s.state.outbox[0].type,'WASH_CLAIM');assert.equal(s.state.audits.length,1);
 await assert.rejects(()=>act(user,redeem),/COUPON_NOT_ACTIVE/);await assert.rejects(()=>act(user,scan),/COUPON_NOT_ACTIVE/);assert.equal(s.state.services.length,1);assert.equal(s.state.batches.length,1);
 console.log('PASS: scanner serial/signed URL, read-only preview, authorization, agreement scope, expiry/returns, agreed price, conditional update, transactional error propagation and one-time accrual (mock transaction).');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true});delete globalThis.__washTest;delete globalThis.__washPrisma;});
