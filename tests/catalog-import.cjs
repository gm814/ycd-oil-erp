const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let session, writes = [], failAudit = false;
const existing = new Set(['EXISTING']);
const db = { $transaction: async fn => {
  const pending = [];
  const result = await fn({ product: { createMany: async ({data, skipDuplicates}) => {
    assert.equal(skipDuplicates, true);
    for (const p of data) {
      assert.equal(p.active, false); assert.equal(p.salePrice, 0);
      assert.equal(p.serviceIntervalKm, null); assert.equal(p.grantsWashCoupon, false);
      assert.equal('quantity' in p, false);
      if (!existing.has(p.sku)) pending.push(p);
    }
    return {count: pending.length};
  } }, auditLog: { create: async () => { if (failAudit) throw Error('audit'); } } });
  for (const p of pending) existing.add(p.sku);
  writes.push(...pending); return result;
} };
const moduleStub = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/secure/inventory/import/route.ts','utf8'), {
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
}).outputText, {module:moduleStub,exports:moduleStub.exports,require:n=>({
 '@/lib/db':{db}, '@/lib/auth':{getSession:async()=>session},
 '@/lib/rbac':{PERMISSIONS:{INVENTORY_MANAGE:'manage'},hasPermission:(p,v)=>p.includes(v)}
}[n] || require(n))});
const product = {sku:'new',nameAr:'صنف اختبار',category:'OIL',unit:'حبة',costPrice:15};
const payload = products => ({format:'ycd-product-catalog-v1',products});
const call = data => moduleStub.exports.POST(new Request('https://example.test/api',{method:'POST',body:JSON.stringify(data)}));
(async()=>{
 assert.equal((await call(payload([product]))).status,401);
 session={userId:'u',permissions:[]};
 assert.equal((await call(payload([product]))).status,403);
 session.permissions=['manage'];
 assert.equal((await call(payload([product,{...product,sku:'NEW'}]))).status,400);
 assert.equal((await call(payload([{...product,quantity:20}]))).status,400);
 assert.equal((await call(payload([{...product,active:true,salePrice:20}]))).status,400);
 assert.equal(writes.length,0);
 let r=await call(payload([product,{...product,sku:'EXISTING'}]));
 assert.deepEqual(await r.json(),{created:1,skipped:1});
 r=await call(payload([product])); assert.deepEqual(await r.json(),{created:0,skipped:1});
 assert.equal(writes.length,1);
 failAudit=true;
 assert.equal((await call(payload([{...product,sku:'ROLLBACK'}]))).status,409);
 assert.equal(existing.has('ROLLBACK'),false);
 console.log('Catalog import: permissions, validation, safe drafts, retry deduplication and transaction rollback passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
