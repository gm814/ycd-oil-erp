const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {Prisma}=require('@prisma/client');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/service-order-totals.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require});
const calc=m.exports.serviceOrderTotals;
const line=(price,quantity=1,discount=0)=>({unitPrice:price,quantity,discount});
const gross=price=>new Prisma.Decimal(price).div('1.15').toDecimalPlaces(6);
function check(items,expected){const r=calc(items,'0.15');assert.deepEqual([r.subtotal,r.vatAmount,r.total].map(n=>n.toFixed(2)),expected);assert.ok(r.subtotal.plus(r.vatAmount).eq(r.total));}
check([line(gross(25)),line(gross(25),4)],['108.70','16.30','125.00']);
check([line(gross(25)),line(gross(35),4)],['143.48','21.52','165.00']);
check([line('21.25'),line('29.75',4)],['140.25','21.04','161.29']);
// Exact exclusive prices retain half-up rounding; never force the amount paid.
check([line('21.74',5)],['108.70','16.31','125.01']);
check([line('100',2,'10')],['190.00','28.50','218.50']);
check([],['0.00','0.00','0.00']);
for(const file of ['services/service-order.ts','app/dashboard/service-orders/[id]/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/serviceOrderTotals\(order.items,/);
console.log('PASS: inclusive price precision, shared preview/posting, exclusive rounding, discounts, zero and exact reconciliation');
