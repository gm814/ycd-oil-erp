import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../lib/db';
import { offlineCommandSchema, type OfflineCommand } from '../lib/offline/contracts';
import { syncOfflineCommand } from '../services/offline-sync';
import { PERMISSIONS } from '../lib/rbac';
import type { SessionPayload } from '../lib/auth';

async function main() {
  const databaseName = new URL(process.env.DATABASE_URL || 'http://invalid').pathname;
  assert(process.env.ALLOW_UAT_FIXTURES === 'true' && databaseName.includes('uat') && process.env.NODE_ENV !== 'production', 'Isolated UAT database required');
  const branch = await db.branch.findUniqueOrThrow({where:{id:'riyadh-tuwaiq'}});
  const user = await db.user.findFirstOrThrow({where:{branchId:branch.id}});
  const session: SessionPayload = {userId:user.id,branchId:branch.id,sessionVersion:user.sessionVersion,name:user.name,username:user.username,mustChangePassword:false,roles:[],permissions:Object.values(PERMISSIONS)};
  const shift = await db.shift.create({data:{branchId:branch.id,openedBy:user.id}});
  const suffix=randomUUID();
  const product=await db.product.create({data:{sku:`OFF-${suffix}`,nameAr:'Offline test oil',category:'OIL',unit:'bottle',salePrice:100,costPrice:60,minStock:0}});
  await db.stockMovement.create({data:{branchId:branch.id,productId:product.id,type:'RECEIPT',quantity:5,performedBy:user.id,reference:'offline-uat'}});
  function command(quantity=1): OfflineCommand {
    const id=randomUUID();
    return offlineCommandSchema.parse({version:1,id,userId:user.id,branchId:branch.id,sessionVersion:user.sessionVersion,shiftId:shift.id,recordedAt:new Date().toISOString(),kind:'SERVICE_ORDER',payload:{customerName:'Offline UAT',phone:'050'+id.replace(/\D/g,'').padEnd(7,'0').slice(0,7),plate:id.slice(0,20),year:'',odometer:'',items:[{productId:product.id,quantity,unitPrice:100}],complete:true,paymentMethod:'CASH',paymentReference:''}});
  }
  const first=command();
  const results=await Promise.all([1,2,3].map(()=>syncOfflineCommand(first,session)));
  assert.deepEqual(results[0],results[1]); assert.deepEqual(results[1],results[2]);
  assert.equal(await db.offlineReceipt.count({where:{id:first.id}}),1);
  assert.equal(await db.serviceOrder.count({where:{orderNo:`SO-OFF-${first.id.toUpperCase()}`}}),1);
  assert.equal(await db.payment.count({where:{idempotencyKey:`offline:${first.id}`}}),1);
  assert.equal(await db.financialTransaction.count({where:{idempotencyKey:`customer-receipt:offline:${first.id}`}}),1);
  await assert.rejects(()=>syncOfflineCommand({...first,payload:{...first.payload,customerName:'Changed'}},session),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(()=>syncOfflineCommand({...first,userId:'another-user'},session),/SCOPE_CHANGED/);
  await assert.rejects(()=>syncOfflineCommand({...first,sessionVersion:first.sessionVersion+1},session),/SESSION_CHANGED/);
  await assert.rejects(()=>syncOfflineCommand(command(),{...session,permissions:[]}),/FORBIDDEN/);
  const repeated=command(3); repeated.payload.items.push({...repeated.payload.items[0]});
  await assert.rejects(()=>syncOfflineCommand(repeated,session),/INSUFFICIENT_STOCK/);
  assert.equal(await db.offlineReceipt.count({where:{id:repeated.id}}),0);
  assert.equal(await db.vehicle.count({where:{plate:repeated.payload.plate.toUpperCase()}}),0,'transaction rolls back vehicle and customer');
  const contenders=[command(3),command(3)];
  const concurrent=await Promise.allSettled(contenders.map(c=>syncOfflineCommand(c,session)));
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1,'only one of two competing stock operations can commit');
  const remaining=await db.stockMovement.aggregate({where:{branchId:branch.id,productId:product.id},_sum:{quantity:true}});
  assert.equal(Number(remaining._sum.quantity),1);
  const changed=command();changed.payload.items[0].unitPrice=99;
  await assert.rejects(()=>syncOfflineCommand(changed,session),/PRODUCT_CHANGED/);
  await db.shift.update({where:{id:shift.id},data:{closedAt:new Date()}});
  await assert.rejects(()=>syncOfflineCommand(command(),session),/SHIFT_CHANGED/);
  // An already accepted operation remains replayable after its shift has closed.
  assert.deepEqual(await syncOfflineCommand(first,session),results[0]);
  console.log('Offline UAT passed: atomic writes, concurrent deduplication, lost-ACK replay, permissions, scope, version, aggregate stock, competing devices, price conflicts, closed shift.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
