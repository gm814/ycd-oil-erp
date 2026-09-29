const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.join(__dirname, '..', 'public');
let serverUser = 'user-a', conflict = false, loseAck = false, auth = true;
const applied = new Map();
const permissions = ['service_order.create','inventory.issue','invoice.issue','payment.receive'];
const server = http.createServer(async (req, res) => {
  const respond = (code, data) => { res.writeHead(code, {'content-type':'application/json'}); res.end(JSON.stringify(data)); };
  if (req.url === '/api/secure/offline/bootstrap') {
    return respond(auth ? 200 : 401, auth ? { version:1, userId:serverUser, branchId:'branch', sessionVersion:0, name:serverUser, permissions,
      shiftId:'shift', preparedAt:new Date().toISOString(), expiresAt:new Date(Date.now()+8*3600000).toISOString(), vatRate:.15,
      products:[{id:'oil',sku:'OIL',nameAr:'زيت اختبار',salePrice:100,stock:10,category:'OIL'}] } : {error:'UNAUTHENTICATED'});
  }
  if (req.url === '/api/secure/offline/sync') {
    let body=''; for await (const chunk of req) body+=chunk;
    const command = JSON.parse(body);
    if (!auth) return respond(401,{error:'UNAUTHENTICATED'});
    if (command.userId !== serverUser) return respond(409,{error:'SCOPE_CHANGED'});
    if (conflict) return respond(409,{error:'INSUFFICIENT_STOCK'});
    if (!applied.has(command.id)) applied.set(command.id,{orderId:command.id,orderNo:'SO-'+command.id,invoiceNo:null});
    if (loseAck) { loseAck=false; res.destroy(); return; }
    return respond(200,{id:command.id,result:applied.get(command.id)});
  }
  const requestPath = new URL(req.url,'http://localhost').pathname;
  const filename = path.resolve(root, '.'+requestPath);
  if (!filename.startsWith(root+path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {res.writeHead(404); return res.end();}
  res.setHeader('content-type', {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(filename)]||'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    let page = await context.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base+'/offline.html');
    await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('اكتمل'));
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await page.locator('[name=customerName]').fill('عميل اختبار');
    await page.locator('[name=phone]').fill('0500000000');
    await page.locator('[name=plate]').fill('ABC 123');
    await page.locator('#add').click();
    const start=Date.now(); await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelectorAll('.operation[data-state=pending]').length===1);
    const localSaveMs=Date.now()-start;
    await page.close(); page=await context.newPage(); await page.goto(base+'/offline.html');
    await page.waitForFunction(()=>document.querySelectorAll('.operation[data-state=pending]').length===1);
    const stored=await page.evaluate(async()=>{const m=await import('/offline-store.js');return m.operations(await m.profile());});
    assert.equal(stored[0].command.payload.customerName,'عميل اختبار');
    assert.equal(stored[0].command.payload.items.length,1);
    // Quota errors must leave the form intact and must never show a false saved state.
    await page.locator('[name=customerName]').fill('لم يحفظ'); await page.locator('[name=plate]').fill('FAIL 1');
    await page.evaluate(()=>{ window.originalAdd=IDBObjectStore.prototype.add; IDBObjectStore.prototype.add=function(){throw new DOMException('Quota exceeded','QuotaExceededError');}; });
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('لم يتم الحفظ'));
    assert.equal(await page.locator('[name=customerName]').inputValue(),'لم يحفظ');
    assert.equal(await page.locator('.operation').count(),1);
    await page.evaluate(()=>{IDBObjectStore.prototype.add=window.originalAdd;document.getElementById('order').reset();});
    // Lost acknowledgement: server commits, browser retains the same UUID and retries.
    loseAck=true; await context.setOffline(false); await page.locator('#sync').click().catch(()=>{});
    await page.waitForFunction(()=>document.querySelectorAll('.operation[data-state=synced]').length===1,{},{timeout:25000});
    assert.equal(applied.size,1);
    // Conflict stays visible and durable across restart; no false synced state.
    await context.setOffline(true);
    await page.locator('[name=customerName]').fill('عميل ثان'); await page.locator('[name=plate]').fill('XYZ 456'); await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelectorAll('.operation[data-state=pending]').length===1);
    conflict=true; await context.setOffline(false); await page.locator('#sync').click().catch(()=>{});
    await page.waitForFunction(()=>document.querySelectorAll('.operation[data-state=review]').length===1);
    await page.reload(); await page.waitForFunction(()=>document.querySelectorAll('.operation[data-state=review]').length===1);
    assert.equal(applied.size,1);
    // A different signed-in account cannot see or replay the first account's outbox.
    serverUser='user-b'; await page.locator('#sync').click();
    await page.waitForFunction(()=>document.getElementById('identity').textContent.includes('user-b'));
    assert.equal(await page.locator('.operation').count(),0);
    serverUser='user-a'; await page.locator('#sync').click();
    await page.waitForFunction(()=>document.querySelectorAll('.operation').length===2);
    // A server rejection locks the offline profile without destroying pending data.
    auth=false; await page.locator('#sync').click();
    await page.waitForFunction(()=>document.getElementById('fields').disabled);
    assert.equal(await page.locator('.operation').count(),0);
    auth=true; await page.locator('#sync').click();
    await page.waitForFunction(()=>document.querySelectorAll('.operation').length===2);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    assert.equal(overflow,false,'mobile horizontal overflow');
    await page.screenshot({path:process.env.OFFLINE_SCREENSHOT || '/tmp/ycd-offline-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,localSaveMs,tests:['offline shell reload','durable save and page close','quota failure preserves form','lost acknowledgement replay','conflict retention','account isolation','server auth rejection','mobile layout']}));
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
