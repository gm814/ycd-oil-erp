// Pure/mock verification only: never connects to an operational database.
import assert from "node:assert/strict";
import { Prisma, Shift } from "@prisma/client";
import { cashTotal, drawerSummary, receiptAccount, configureCashDrawer } from "../services/cash-drawer";
const D = (n: number | string) => new Prisma.Decimal(n);
const openedAt = new Date("2026-10-05T06:27:36Z");
const end = new Date("2026-10-08T06:00:00Z");
const shift = { id: "shift", branchId: "branch", openedAt, openingCash: D(0), closedAt: null, drawerAccountId: "drawer" } as Shift;
const account = { id: "drawer", branchId: "branch", active: true, type: "CASH", cashRole: "DRAWER" };
const movements = [{ id: "receipt", amount: D(23), type: "CUSTOMER_RECEIPT", relatedEntityType: "Invoice", idempotencyKey: "customer-receipt:payment", createdAt: new Date("2026-10-05T07:00:00Z") }, { id: "wash-out", amount: D(-23), type: "EXPENSE", relatedEntityType: "WashBatch", idempotencyKey: "wash-out:uat", createdAt: new Date("2026-10-07T11:00:00Z") }];
async function main() {
  assert.equal(cashTotal(D(0), movements).toString(), "0", "previous wash payment must reduce physical drawer, without a new posting");
  assert.equal(cashTotal(D(10), [{amount:D(100)}, {amount:D(-5)}, {amount:D(-80)}]).toString(), "25", "float + sale - refund - handover, each exactly once");
  assert.equal(cashTotal(D(0), [{amount:D("0.1")}, {amount:D("0.2")}]).toString(), "0.3");
  const tx = { financialAccount: { findFirst: async () => account }, shift: { findFirst: async () => shift }, financialTransaction: { findMany: async (q: any) => { assert.equal(q.where.accountId,"drawer");assert.equal(q.where.branchId,"branch");assert.equal(q.where.createdAt.gte,openedAt);assert.equal(q.where.createdAt.lt,end);return movements; } } } as unknown as Prisma.TransactionClient;
  assert.equal((await drawerSummary(tx, shift, end))!.expectedCash.toString(), "0");
  assert.equal(await drawerSummary(tx, {...shift,drawerAccountId:null},end), null, "unconfigured legacy branch retains behavior");
  assert.equal((await receiptAccount(tx,"branch","CASH"))!.id,"drawer");
  const closedTx = {...tx,shift:{findFirst:async()=>null}} as unknown as Prisma.TransactionClient;
  await assert.rejects(()=>receiptAccount(closedTx,"branch","CASH"),/OPEN_SHIFT_REQUIRED/);
  let writes: string[] = [];
  let existing: any[] = [];
  const setup: any = {
    financialAccount:{findMany:async()=>existing, findFirst:async(q:any)=>q.where.id==="drawer"?{...account,cashRole:null}:null,create:async({data}:any)=>{assert.equal(data.code,"ADMIN-TREASURY");assert.equal(data.openingBalance,undefined);writes.push("create-treasury");return {id:"treasury"};},update:async({where,data}:any)=>{writes.push(data.cashRole);existing.push({id:where.id,...data});}},
    shift:{findMany:async()=>[{...shift,drawerAccountId:null}],update:async({data}:any)=>{assert.deepEqual(data,{drawerAccountId:"drawer"});writes.push("bind-shift");}},
    payment:{findMany:async()=>[{idempotencyKey:"payment",amount:D(23)}]}, salesReturn:{findMany:async()=>[]},
    financialTransaction:{findFirst:async()=>null,findUnique:async()=>({...movements[0],accountId:"drawer"}),aggregate:async()=>({_sum:{amount:null}}),findMany:async()=>movements,create:async()=>{throw Error("must not manufacture cash");},update:async()=>{throw Error("must preserve original payment");}},
    auditLog:{create:async({data}:any)=>{assert.equal(data.action,"CASH_DRAWER_SEPARATED");assert.equal(data.afterJson.correctedExpectedCash,"0");assert.equal(data.afterJson.financialPostingsChanged,false);assert.equal(data.afterJson.recognizedMovements.length,2);writes.push("audit");}},
  };
  await configureCashDrawer(setup,"branch","accountant","drawer");
  assert.deepEqual(writes,["bind-shift","create-treasury","DRAWER","TREASURY","audit"]);
  const priorWrites = writes.length;
  await configureCashDrawer(setup,"branch","accountant","drawer");
  assert.equal(writes.length,priorWrites,"configuration retry must be a no-op");
  await assert.rejects(()=>configureCashDrawer(setup,"branch","accountant","another"),/CASH_POLICY_LOCKED/);
  existing=[]; writes=[];
  setup.financialTransaction.findUnique=async()=>({...movements[0],accountId:"wash-account"});
  await assert.rejects(()=>configureCashDrawer(setup,"branch","accountant","drawer"),/LEGACY_REVIEW_REQUIRED/);
  assert.equal(writes.length,0,"wrong receipt account must fail before any writes");
  setup.financialAccount.findFirst=async()=>null;
  await assert.rejects(()=>configureCashDrawer(setup,"other-branch","accountant","drawer"),/INVALID_DRAWER/);
  console.log("PASS: historical 23 receipt/23 disbursement, exact decimal totals, refunds/handovers, shift/account boundaries, no cash fabrication, configuration idempotency, conflicting configuration and legacy account mismatch.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
