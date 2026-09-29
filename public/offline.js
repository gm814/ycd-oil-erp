import { profile, setProfile, operations, save, update, scope } from './offline-store.js';
const $ = id => document.getElementById(id);
let owner = null, lines = [], saving = false, running = false, timer, failures = 0;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ycd-offline') : null;
const messages = {
  SCOPE_CHANGED: 'سجّل الدخول بالحساب الأصلي لإرسال هذه العملية.',
  SESSION_CHANGED: 'تغيرت الجلسة أو الصلاحيات؛ تحتاج العملية مراجعة.',
  SHIFT_CHANGED: 'الوردية الأصلية مغلقة؛ تحتاج العملية مراجعة.',
  FORBIDDEN: 'الصلاحيات الحالية لا تسمح بتنفيذ العملية.',
  CUSTOMER_CONFLICT: 'بيانات العميل تختلف عن البيانات المركزية.',
  VEHICLE_CONFLICT: 'السيارة مرتبطة بعميل آخر أو بقراءة عداد أحدث.',
  PRODUCT_CHANGED: 'تغير سعر أحد الأصناف أو أوقف استخدامه.',
  INSUFFICIENT_STOCK: 'الرصيد المركزي لا يكفي. العملية محفوظة للمراجعة.',
  IDEMPOTENCY_CONFLICT: 'تغير محتوى عملية سبق إرسالها؛ يلزم مراجعتها.',
  INVALID_INPUT: 'راجع بيانات العملية المحفوظة.',
  CREDIT_NOT_ALLOWED: 'البيع الآجل غير مفعل لهذا العميل.',
  CREDIT_LIMIT_EXCEEDED: 'تجاوزت العملية الحد الائتماني.',
  FINANCIAL_ACCOUNT_REQUIRED: 'الحساب المالي غير مهيأ.',
};
function notice(text) { $('notice').textContent = text; }
function validOwner() { return owner && owner.shiftId && Date.parse(owner.expiresAt) > Date.now(); }
async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } finally { clearTimeout(timeout); }
}
function fillProducts() {
  const selected = $('product').value;
  const term = $('search').value.trim().toLocaleLowerCase();
  const products = (owner?.products || []).filter(p => `${p.nameAr} ${p.sku}`.toLocaleLowerCase().includes(term));
  $('product').replaceChildren();
  for (const p of products) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = `${p.sku} — ${p.nameAr} — ${p.salePrice.toFixed(2)} ر.س${p.category === 'SERVICE' ? '' : ` — آخر رصيد: ${p.stock}`}`;
    $('product').append(option);
  }
  if (products.some(p => p.id === selected)) $('product').value = selected;
}
function renderLines() {
  $('items').replaceChildren();
  lines.forEach((line, index) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${line.name} × ${line.quantity} = ${(line.quantity * line.unitPrice).toFixed(2)} ر.س`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'حذف البند';
    button.onclick = () => { if (saving) return; lines.splice(index, 1); renderLines(); };
    li.append(label, button); $('items').append(li);
  });
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  $('total').textContent = `الإجمالي التقديري شامل الضريبة: ${(subtotal + Math.round(subtotal * (owner?.vatRate || 0) * 100) / 100).toFixed(2)} ر.س`;
}
async function render() {
  const latest = await profile();
  if (!latest || !owner || scope(latest) !== scope(owner)) {
    owner = latest || null; lines = []; $('order').reset(); renderLines(); fillProducts();
  } else owner = latest;
  $('identity').textContent = owner ? `الحساب: ${owner.name}` : 'يلزم تسجيل الدخول وتجهيز الجهاز بالإنترنت أولًا.';
  $('prepared').textContent = owner ? `آخر تحديث: ${new Date(owner.preparedAt).toLocaleString('ar-SA')}` : '';
  $('fields').disabled = !validOwner() || saving;
  if (owner && !validOwner()) notice(owner.shiftId ? 'انتهت مدة العمل المحلي؛ اتصل وسجّل الدخول لتجديدها. عملياتك المحفوظة باقية.' : 'افتح وردية تشغيلية ثم جهّز الجهاز مجددًا.');
  $('operations').replaceChildren();
  const rows = owner ? await operations(owner) : [];
  $('counts').textContent = `بانتظار المزامنة: ${rows.filter(r => r.state === 'pending').length} | تحتاج مراجعة: ${rows.filter(r => r.state === 'review').length} | تمت المزامنة: ${rows.filter(r => r.state === 'synced').length}`;
  for (const row of rows.slice().reverse()) {
    const card = document.createElement('article'); card.className = 'operation'; card.dataset.state = row.state;
    const title = document.createElement('strong'); title.textContent = `${row.command.payload.customerName} — ${row.command.payload.plate}`;
    const status = document.createElement('p'); status.textContent = row.state === 'synced' ? 'تمت المزامنة' : row.state === 'review' ? 'محفوظة — تحتاج مراجعة' : 'محفوظة على الجهاز — بانتظار المزامنة';
    const id = document.createElement('p'); id.textContent = `مرجع محلي: ${row.id}`;
    card.append(title, status, id);
    if (row.error) { const error = document.createElement('p'); error.textContent = messages[row.error] || 'تعذر الاعتماد؛ العملية محفوظة للمراجعة.'; card.append(error); }
    if (row.result?.orderId) {
      const link = document.createElement('a'); link.href = `/dashboard/service-orders/${encodeURIComponent(row.result.orderId)}`;
      link.textContent = row.result.invoiceNo ? `عرض الفاتورة ${row.result.invoiceNo}` : `عرض الأمر ${row.result.orderNo}`; card.append(link);
    }
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'تفاصيل العملية';
    const description = document.createElement('pre'); description.style.whiteSpace = 'pre-wrap'; description.textContent = JSON.stringify(row.command.payload, null, 2);
    details.append(summary, description); card.append(details);
    if (row.state === 'review') {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'إعادة الفحص بعد معالجة السبب';
      retry.onclick = async () => { await update(row.id, { state: 'pending', error: null }); await render(); void synchronize(); };
      card.append(retry);
    }
    $('operations').append(card);
  }
}
async function prepare() {
  const { response, data } = await request('/api/secure/offline/bootstrap');
  if (!response.ok) {
    if ([401, 403, 404, 428].includes(response.status)) {
      await setProfile(null); owner = null; channel?.postMessage('changed');
      notice(response.status === 404 ? 'النسخة التجريبية غير مفعلة على هذا الخادم.' : 'سجّل الدخول بحساب مخول لتجهيز الجهاز. العمليات السابقة محفوظة لحسابها الأصلي.');
    }
    throw new Error(`BOOTSTRAP_${response.status}`);
  }
  if (data.version !== 1 || !Array.isArray(data.products) || !data.userId || !data.branchId) throw new Error('BOOTSTRAP_INVALID');
  const previous = owner;
  if (previous && scope(previous) !== scope(data)) { lines = []; $('order').reset(); }
  await setProfile(data); owner = data; fillProducts(); renderLines(); channel?.postMessage('changed');
}
async function synchronize() {
  if (running || !navigator.onLine) { if (!navigator.onLine) $('connection').textContent = 'دون اتصال — الحفظ على الجهاز'; return; }
  running = true; clearTimeout(timer); $('sync').disabled = true;
  $('connection').textContent = 'جارٍ التحقق والمزامنة…';
  let failed = false;
  try {
    await prepare();
    const rows = await operations(owner);
    for (const row of rows.filter(row => row.state === 'pending')) {
      const active = await profile();
      if (!active || scope(active) !== row.scope) throw new Error('ACCOUNT_CHANGED');
      const { response, data } = await request('/api/secure/offline/sync', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(row.command),
      });
      if (response.status === 401 || response.status === 428) {
        await setProfile(null); owner = null; channel?.postMessage('changed'); throw new Error('LOGIN_REQUIRED');
      }
      if (response.status >= 500 || response.status === 429) throw new Error('SERVER_RETRY');
      if (response.ok && data.id === row.id && data.result?.orderId) {
        await update(row.id, { state: 'synced', result: data.result, error: null });
      } else if (!response.ok) {
        await update(row.id, { state: 'review', error: data.error || 'SYNC_REVIEW' });
      } else throw new Error('INVALID_ACK');
      await render(); channel?.postMessage('changed');
    }
    // Fetch new stock only after sending the outbox. Never overwrite pending operations.
    await prepare(); failures = 0;
    $('connection').textContent = 'متصل — اكتمل فحص المزامنة';
  } catch {
    failed = true; failures = Math.min(failures + 1, 5);
    $('connection').textContent = 'تعذر الاتصال أو التحقق — العمليات المحلية محفوظة';
  } finally {
    running = false; $('sync').disabled = false;
    await render().catch(() => notice('تعذر قراءة التخزين المحلي. لا تمسح بيانات المتصفح.'));
    timer = setTimeout(() => void synchronize(), failed ? Math.min(60000, 2000 * 2 ** failures) : 60000);
  }
}
$('search').addEventListener('input', fillProducts);
$('add').onclick = () => {
  if (saving || !validOwner()) return;
  const product = owner.products.find(p => p.id === $('product').value);
  const quantity = Number($('quantity').value);
  if (!product || !Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || lines.length >= 100) return notice('اختر صنفًا وكمية صحيحة.');
  lines.push({ productId: product.id, name: product.nameAr, quantity, unitPrice: product.salePrice }); renderLines();
};
$('order').onsubmit = async event => {
  event.preventDefault();
  if (saving || !validOwner()) return;
  saving = true;
  const form = new FormData(event.currentTarget);
  const complete = form.get('complete') === 'on';
  const paymentMethod = String(form.get('paymentMethod'));
  const permission = paymentMethod === 'CREDIT' ? 'credit.sale' : 'payment.receive';
  if (complete && (!lines.length || !['inventory.issue', 'invoice.issue', permission].every(p => owner.permissions.includes(p)))) {
    saving = false; return notice('طلب الإقفال يحتاج بندًا واحدًا على الأقل وصلاحيات إصدار الفاتورة والتحصيل/الآجل.');
  }
  if (complete && ['CARD', 'TRANSFER'].includes(paymentMethod) && !String(form.get('paymentReference')).trim()) {
    saving = false; return notice('أدخل مرجع عملية الدفع المؤكدة.');
  }
  const command = {
    version: 1, id: crypto.randomUUID(), userId: owner.userId, branchId: owner.branchId,
    sessionVersion: owner.sessionVersion, shiftId: owner.shiftId, recordedAt: new Date().toISOString(), kind: 'SERVICE_ORDER',
    payload: { ...Object.fromEntries(form.entries()), complete, paymentMethod,
      items: lines.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })) },
  };
  $('save').textContent = 'جارٍ الحفظ على الجهاز…'; $('fields').disabled = true;
  try {
    const active = await profile();
    if (!active || scope(active) !== scope(owner)) throw new Error('ACCOUNT_CHANGED');
    await save(command);
    $('order').reset(); lines = []; renderLines();
    notice('تم الحفظ على الجهاز. ستتم المزامنة عند عودة الاتصال؛ لا حاجة لإدخال العملية مرة أخرى.');
    channel?.postMessage('changed');
  } catch { notice('لم يتم الحفظ. البيانات ما زالت في النموذج؛ راجع مساحة الجهاز وصلاحية التخزين ثم أعد المحاولة.'); }
  finally { saving = false; $('save').textContent = 'حفظ على الجهاز'; await render(); }
  void synchronize();
};
$('sync').onclick = () => void synchronize();
window.addEventListener('online', () => void synchronize());
window.addEventListener('offline', () => { $('connection').textContent = 'دون اتصال — الحفظ على الجهاز'; });
window.addEventListener('pageshow', () => { void render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { void render(); void synchronize(); } });
channel?.addEventListener('message', () => void render());
try {
  if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js').catch(() => null);
  owner = await profile(); fillProducts(); renderLines(); await render();
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  void synchronize();
} catch { notice('تعذر تجهيز التخزين المحلي. لا تستخدم وضع التصفح الخاص؛ استخدم الجهاز والمتصفح المعتمدين.'); $('fields').disabled = true; }
