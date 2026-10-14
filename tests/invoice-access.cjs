const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let session;
let queries;
const invoice = {
  id: 'invoice-1', customerId: 'customer-1', serviceOrderId: 'order-1',
  invoiceNo: 'YCD-0012', createdAt: new Date(), total: 23, subtotal: 20,
  discount: 0, vatAmount: 3, vatRate: 0.15, status: 'PAID',
  customer: { name: 'Test customer' },
  serviceOrder: { branchId: 'branch-1', orderNo: 'YCD-0011', vehicle: { plate: 'TEST' }, items: [] },
  payments: [{ amount: 23, method: 'CASH', paidAt: new Date() }], returns: [], coupons: [],
};
function load(file, stubs = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: name => Object.hasOwn(stubs, name) ? stubs[name] : require(name),
    Response, URL, Buffer, process, setTimeout, clearTimeout,
  }, { filename: file });
  return module.exports;
}
const rbac = load('lib/rbac.ts');
const shared = {
  '@/lib/rbac': rbac,
  '@/lib/auth': { getSession: async () => session },
  '@/lib/db': { db: { invoice: { findFirst: async ({ where }) => {
    queries.push(where);
    return where.id === invoice.id && where.serviceOrder?.branchId === invoice.serviceOrder.branchId ? invoice : null;
  } } } },
};
const page = load('app/dashboard/invoices/[id]/page.tsx', {
  ...shared,
  'next/navigation': {
    redirect: to => { throw new Error('REDIRECT:' + to); },
    notFound: () => { throw new Error('NOT_FOUND'); },
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  '@/lib/config': { companyConfig: { bank: {} } },
  '@/lib/zatca': { buildZatcaPhase1QrPayload: () => '', buildZatcaPhase1QrSvg: () => '' },
  './buyer-form': { default: 'BuyerForm' }, './print-button': { default: 'PrintButton' },
  './collection-form': { default: 'CollectionForm' }, './sales-return-form': { default: 'SalesReturnForm' },
}).default;
const pdf = load('app/api/invoices/[id]/pdf/route.ts', {
  ...shared, '@/lib/invoice-pdf': { invoicePdfInclude: {} },
}).GET;
function reset(permissions, branchId = 'branch-1') {
  queries = [];
  session = { permissions, branchId };
}
const params = id => ({ params: Promise.resolve({ id }) });
const callPdf = (id = 'missing', format = 'a4') => pdf(new Request('http://localhost/api/invoices/' + id + '/pdf?format=' + format), params(id));
async function main() {
  // Cashier permissions deliberately exclude customer.view.
  reset(['dashboard.view', 'invoice.issue', 'payment.receive']);
  const rendered = JSON.stringify(await page(params(invoice.id)));
  assert.ok(rendered.includes('YCD-0012'));
  assert.ok(rendered.includes('/dashboard/service-orders/order-1'));
  assert.ok(!rendered.includes('/dashboard/customers/customer-1'));
  assert.equal(rbac.hasPermission(session.permissions, rbac.PERMISSIONS.CUSTOMER_VIEW), false);
  assert.equal(queries[0].serviceOrder.branchId, 'branch-1');
  assert.equal((await callPdf()).status, 404); // Permission passed; invoice missing.
  assert.equal(queries[1].serviceOrder.branchId, 'branch-1');
  assert.equal((await callPdf(invoice.id, 'invalid')).status, 400);

  reset(['customer.view']);
  assert.ok(JSON.stringify(await page(params(invoice.id))).includes('/dashboard/customers/customer-1'));
  assert.equal((await callPdf()).status, 404);

  for (const permissions of [[], ['coupon.redeem'], ['payment.receive']]) {
    reset(permissions);
    await assert.rejects(page(params(invoice.id)), /REDIRECT:\/dashboard/);
    assert.equal((await callPdf()).status, 403);
    assert.equal(queries.length, 0);
  }
  reset(['invoice.issue'], null);
  await assert.rejects(page(params(invoice.id)), /REDIRECT:\/dashboard/);
  assert.equal((await callPdf()).status, 403);
  assert.equal(queries.length, 0);

  reset(['invoice.issue'], 'branch-2');
  await assert.rejects(page(params(invoice.id)), /NOT_FOUND/);
  assert.equal((await callPdf(invoice.id)).status, 404);
  assert.ok(queries.every(q => q.serviceOrder.branchId === 'branch-2'));

  queries = []; session = null;
  await assert.rejects(page(params(invoice.id)), /REDIRECT:\/$/);
  assert.equal((await callPdf()).status, 401);
  assert.equal(queries.length, 0);
  reset(['invoice.issue']); session.mustChangePassword = true;
  assert.equal((await callPdf()).status, 401);
  assert.equal(queries.length, 0);
  console.log('Passed: cashier invoice access, customer-view compatibility, safe back link, page/PDF denial, branch isolation, and PDF authentication.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
