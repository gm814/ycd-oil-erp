# YCD OIL ERP - Production & Go-Live Runbook

This runbook is for the first YCD OIL branch in Riyadh - Tuwaiq.

## 1. Release gate

Do not switch the branch to LIVE until all items in the in-app **Readiness** page are complete.

Required master data:
- Employee HR data: hire date, salary, allowances and available employee IBANs.
- Named user accounts with the approved RBAC roles.
- Oil/filter/parts catalog with cost, selling price, unit, minimum stock and opening quantity.
- Service catalog and wash-coupon eligibility.
- Opening inventory count.
- Active suppliers.
- All UAT cases passed with traceable evidence.

The Al Rajhi account and YCD identity are already treated as approved source data by the application.

## 2. Production environment

1. Provision a managed PostgreSQL database with TLS, automated backups and point-in-time recovery when available.
2. Create production secrets from `.env.production.example`.
3. Keep `ALLOW_PREOPENING_OPERATIONS=false`.
4. Use a unique `AUTH_SECRET` of at least 48 random characters.
5. Never reuse CI, local or temporary passwords in production.
6. Restrict database network access to the application/runtime and approved administration paths only.

Before deployment:

```bash
npm ci
npm run db:generate
npm run verify:production-env
npm run build
```

## 3. Database deployment

Take a fresh backup before every migration.

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Do not use `prisma db push` on production.

## 4. Backup policy

Minimum operating policy:
- Automated database backup every day.
- Point-in-time recovery enabled when supported by the provider.
- Retain daily backups for at least 30 days.
- Keep at least one monthly recovery point outside the normal short retention window.
- Test restoration to an isolated database at least once per quarter.
- Record every restore test in the operational evidence log.

A backup is not considered valid until a restore test succeeds.

## 5. User access

Provision accounts from **Users & Permissions** using the approved operational team. Temporary passwords must be changed on first login.

Required separation:
- The requester cannot approve their own sensitive request.
- The preparer of a bank reconciliation cannot review it themselves.
- Financial close preparation and final review remain separated.
- Cashier, warehouse, technician and wash-supervisor roles must not receive management approval permissions.

Disable accounts immediately when access is no longer required.

## 6. UAT

Run all cases from **Readiness > UAT** in a controlled environment. Every PASSED result requires an evidence reference.

The UAT pack covers shifts, service intake, inventory issue, cash/card/transfer sales, tax invoice, vehicle history, wash coupon, credit collection, returns, procurement, expenses, custody, payroll, shift variance, bank reconciliation, financial close and audit log.

## 7. Go-live

Immediately before GO LIVE:
1. Confirm no UAT/test shift remains open.
2. Confirm the opening inventory and prices are approved.
3. Confirm bank/cash/POS accounts and balances.
4. Confirm named employee accounts and roles.
5. Confirm the database backup completed successfully.
6. Run `npm run verify:go-live` against the intended production database.
7. The General Manager executes the final GO LIVE action in the Readiness screen.

## 8. First-day controls

At the end of the first commercial day:
- Close the shift.
- Review cash, card/POS and transfer variances.
- Reconcile POS settlements.
- Reconcile the bank when the statement/transactions are available.
- Review low-stock and negative-stock alerts.
- Review audit events for sensitive operations.
- Prepare and review the daily financial close.

## 9. Incident / rollback

If a release introduces a serious operational problem:
1. Stop new operational entry if data integrity is at risk.
2. Preserve logs and the current database.
3. Do not delete or rewrite financial history to “fix” a problem.
4. Roll back the application release only if the database schema remains compatible.
5. If database restoration is required, restore into an isolated database first and verify the recovery point before any production replacement.
6. Document the incident, affected transactions and corrective action.

## 10. Source controls

- Company identity uses the supplied YCD OIL source identity.
- Main bank: Al Rajhi Bank, company account registered in the system from the supplied IBAN certificate.
- Branch: Riyadh - Tuwaiq.
- Production secrets and employee passwords must never be committed to GitHub.
