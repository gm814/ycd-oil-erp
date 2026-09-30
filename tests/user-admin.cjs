const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ycd-user-admin-'));
const stubs = {
  '@/lib/auth': 'export const getSession=async()=>globalThis.__userAdminTest.session;',
  '@/lib/rbac': 'export const PERMISSIONS={USER_MANAGE:"manage"};export const hasPermission=(p)=>p.includes("manage");',
  '@/lib/db': 'export const db={$transaction:async fn=>fn(globalThis.__userAdminTest.tx)};',
  'next/server': 'export const NextResponse={json:(data,init)=>Response.json(data,init)};',
  '@prisma/client': 'export class KnownError extends Error{code="P2002";meta={target:["username"]}};export const Prisma={PrismaClientKnownRequestError:KnownError};',
};
async function main() {
  await esbuild.build({entryPoints:[path.join(root,'app/api/secure/admin/users/[id]/route.ts')],outfile:path.join(temp,'route.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'test-adapters',setup(build){build.onResolve({filter:/.*/},args=>Object.hasOwn(stubs,args.path)?{path:args.path,namespace:'test'}:undefined);build.onLoad({filter:/.*/,namespace:'test'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
  const {POST}=require(path.join(temp,'route.cjs'));
  function reset() {
    const s={session:{userId:'manager',branchId:'branch-1',permissions:['manage']},writes:[],audits:[],current:{id:'employee',branchId:'branch-1',username:'oldname',email:'old@example.com',status:'ACTIVE',mustChangePassword:false,sessionVersion:1,roles:[{role:{code:'CASHIER'}}]},duplicate:null};
    s.tx={user:{findFirst:async({where})=>{assert.equal(where.branchId,'branch-1');return s.current;},findUnique:async()=>s.duplicate,count:async()=>1,update:async({data})=>{s.writes.push(data);return {...s.current,...data};}},role:{findMany:async()=>[]},userRole:{deleteMany:async()=>{},createMany:async()=>{}},auditLog:{create:async({data})=>s.audits.push(data)}};
    globalThis.__userAdminTest=s;return s;
  }
  const call=async(body,id='employee')=>POST(new Request('http://localhost/api/secure/admin/users/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
  let s=reset();s.session=null;assert.equal((await call({username:'newname'})).status,401);assert.equal(s.writes.length,0);
  s=reset();s.session.permissions=[];assert.equal((await call({username:'newname'})).status,403);assert.equal(s.writes.length,0);
  s=reset();assert.equal((await call({username:'a b'})).status,400);assert.equal((await call({email:'invalid'})).status,400);assert.equal(s.writes.length,0);
  s=reset();assert.equal((await call({username:'newname',roleCodes:['GENERAL_MANAGER']},'manager')).status,409);assert.equal(s.writes.length,0);
  s=reset();s.current=null;assert.equal((await call({username:'newname'})).status,404);assert.equal(s.writes.length,0);
  s=reset();s.duplicate={id:'other'};let response=await call({username:'taken'});assert.equal(response.status,409);assert.equal((await response.json()).error,'USERNAME_ALREADY_USED');assert.equal(s.writes.length,0);
  s=reset();s.duplicate={id:'other'};response=await call({email:'taken@example.com'});assert.equal(response.status,409);assert.equal((await response.json()).error,'EMAIL_ALREADY_USED');assert.equal(s.writes.length,0);
  s=reset();response=await call({username:'  New.Name  ',email:''});assert.equal(response.status,200);assert.equal(s.writes[0].username,'new.name');assert.equal(s.writes[0].email,null);assert.equal(s.writes[0].passwordHash,undefined);assert.equal(s.audits[0].beforeJson.username,'oldname');assert.equal(s.audits[0].afterJson.username,'new.name');
  s=reset();response=await call({email:'NAME@EXAMPLE.COM'});assert.equal(response.status,200);assert.equal(s.writes[0].email,'name@example.com');assert.equal(s.writes[0].username,undefined);
  s=reset();s.current.id='manager';response=await call({username:'newmanager'},'manager');assert.equal(response.status,200);
  s=reset();response=await call({password:'Aa123456'});assert.equal(response.status,200);assert.equal(s.writes[0].mustChangePassword,true);assert.equal(s.writes[0].sessionVersion.increment,1);assert.notEqual(s.writes[0].passwordHash,'Aa123456');assert.ok(!JSON.stringify(s.audits).includes('Aa123456'));
  console.log('Passed: authentication, permissions, branch scope, validation, duplicate identities, normalization, email clearing, self protection, audit records, password reset.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true});delete globalThis.__userAdminTest;});
