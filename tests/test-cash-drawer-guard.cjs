// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite package.
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
 const db = new PGlite();
 await db.exec(`
 CREATE TABLE "FinancialAccount" (id text PRIMARY KEY, "branchId" text, type text, code text, "nameAr" text, active boolean);
 CREATE TABLE "Shift" (id text PRIMARY KEY, "branchId" text, "closedAt" timestamp);
 CREATE TABLE "FinancialTransaction" (id text PRIMARY KEY, "accountId" text, "branchId" text, type text, amount numeric(12,2), "relatedEntityType" text, "relatedEntityId" text, reference text, "idempotencyKey" text UNIQUE);
 `);
 const migration = name => fs.readFileSync(path.join(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8');
 await db.exec(migration('20261008060000_cash_separation'));
 await db.exec(`INSERT INTO "FinancialAccount" VALUES ('test','b','CASH','TEST-CASH','صندوق تجريبي',true,'DRAWER');
 INSERT INTO "FinancialAccount" VALUES ('real','r','CASH','CASH','صندوق فعلي',true,'DRAWER');
 INSERT INTO "FinancialTransaction" (id,"accountId","branchId",type,amount,"relatedEntityType") VALUES ('receipt','test','b','CUSTOMER_RECEIPT',46,'Invoice'),('real-receipt','real','r','CUSTOMER_RECEIPT',46,'Invoice');`);
 const insert = (id, account='test', branch='b', amount=-46, entity='TestCashReconciliation') => db.query(`INSERT INTO "FinancialTransaction" VALUES ($1,$2,$3,'ADJUSTMENT',$4,$5,$2,'TEST-CASH-RECONCILIATION',$6)`,[id,account,branch,amount,entity,`test-cash-reconciliation:${account}`]);
 const blocked = fn => assert.rejects(fn, /CASH_DRAWER_RESTRICTED/);
 // Reproduce the production failure with the original guard.
 await blocked(() => insert('before'));
 await db.exec(migration('20261015180000_test_cash_reconciliation_guard'));
 await blocked(() => insert('real-adjust','real','r'));
 await blocked(() => insert('wrong-branch','test','other'));
 await blocked(() => insert('partial','test','b',-10));
 await blocked(() => insert('positive','test','b',46));
 await blocked(() => insert('generic','test','b',-46,'Other'));
 await db.exec(`INSERT INTO "Shift" VALUES ('open','b',NULL)`);
 await blocked(() => insert('open-shift'));
 await db.exec(`UPDATE "Shift" SET "closedAt"=CURRENT_TIMESTAMP`);
 // Rollback leaves the balance intact, as required if audit recording fails.
 await db.exec('BEGIN');
 await insert('rollback');
 await db.exec('ROLLBACK');
 assert.equal((await db.query(`SELECT SUM(amount)::text AS n FROM "FinancialTransaction" WHERE "accountId"='test'`)).rows[0].n,'46.00');
 await insert('approved');
 assert.equal((await db.query(`SELECT SUM(amount)::text AS n FROM "FinancialTransaction" WHERE "accountId"='test'`)).rows[0].n,'0.00');
 await blocked(() => insert('repeat'));
 await blocked(() => db.exec(`UPDATE "FinancialTransaction" SET amount=-45 WHERE id='approved'`));
 await db.exec(`INSERT INTO "FinancialTransaction" (id,"accountId","branchId",type,amount,"relatedEntityType") VALUES ('sale','test','b','CUSTOMER_RECEIPT',125,'Invoice')`);
 await blocked(() => insert('repeat-after-sale','test','b',-125));
 await blocked(() => db.exec(`INSERT INTO "FinancialTransaction" (id,"accountId","branchId",type,amount,"relatedEntityType") VALUES ('expense','test','b','EXPENSE',-1,'Expense')`));
 await db.close();
 console.log('PostgreSQL drawer guard: reproduction, restricted exception, rollback and repeat protection passed');
})().catch(e => { console.error(e); process.exitCode=1; });
