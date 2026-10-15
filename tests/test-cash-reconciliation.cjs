const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {Prisma}=require('@prisma/client');
let permitted=true,open=false,fail=false,rows=[],posted=[];
const account={id:'cash',branchId:'branch',code:'TEST-DEMO',type:'CASH',nameAr:'صندوق تجريبي',active:true};
function reset(){permitted=true;open=false;fail=false;posted=[];rows=[{id:'a',amount:new Prisma.Decimal(23),descriptionAr:'test',reference:'demo',createdAt:new Date('2026-01-01')}];}
const db={$transaction:async fn=>{const pending=[];const r=await fn({financialAccount:{findFirst:async({where})=>{assert.equal(where.type,'CASH');assert.equal(where.code.startsWith,'TEST-');assert.equal(where.nameAr.contains,'تجريبي');return where.id==='cash'&&where.branchId==='branch'?account:null;}},financialTransaction:{findMany:async()=>rows,create:async({data})=>{pending.push(data);return{id:'adjustment',documentNo:'DEMO',...data};}},shift:{findFirst:async()=>open?{id:'open'}:null},auditLog:{create:async({data})=>{if(fail)throw Error('audit failed');pending.push(data);}}});posted.push(...pending);return r;}};
const m={exports:{}};
const stubs={'@/lib/db':{db},'@/lib/auth':{getSession:async()=>({userId:'admin',branchId:'branch',permissions:[]})},'@/lib/rbac':{PERMISSIONS:{FINANCE_MANAGE:'manage'},hasPermission:()=>permitted}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/secure/finance/test-balance/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,URL,require:n=>stubs[n]||require(n)});
const get=()=>m.exports.GET(new Request('https://test/api?accountId=cash'));
const post=p=>m.exports.POST(new Request('https://test/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)}));
(async()=>{
reset();const p=await(await get()).json();assert.equal(p.balance,'23.00');assert.equal(posted.length,0);
const input={accountId:'cash',snapshot:p.snapshot,confirmed:true,reason:'Confirmed test movements only'};
assert.equal((await post(input)).status,201);assert.equal(posted.length,2);assert.equal(posted[0].amount.toFixed(2),'-23.00');assert.equal(posted[0].type,'ADJUSTMENT');assert.equal(posted[1].afterJson.invoicesChanged,false);
for(const [change,expected] of [[()=>{permitted=false},403],[()=>{open=true},409],[()=>{fail=true},409],[()=>{rows[0].amount=new Prisma.Decimal(24)},409],[()=>{rows[0].relatedEntityType='TestCashReconciliation'},409]]){reset();change();assert.equal((await post(input)).status,expected);assert.equal(posted.length,0);}
reset();assert.equal((await post({...input,confirmed:false})).status,400);assert.equal((await post({...input,accountId:'other-branch'})).status,409);assert.equal(posted.length,0);
console.log('PASS: preview read-only, adjustment/audit atomic, permission and account scope, stale preview, open shift and duplicate guards');
})().catch(e=>{console.error(e);process.exit(1)});
