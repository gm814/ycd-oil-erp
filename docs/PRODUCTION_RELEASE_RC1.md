# YCD OIL ERP — Production Release Candidate 1

## Release source

- Production branch: `production/ycd-v1`
- Source candidate: `codex/v1-foundation`
- Source commit frozen for production preparation: `7b40a94db72a1951d12e6b65e154529d745e8759`
- Source CI: run #540 — success
- Commercial status: `PREOPENING`

## Production safety posture

This branch is intended for technical Production deployment while commercial operations remain locked.

Required production environment:
- `DATABASE_URL`: managed PostgreSQL with SSL and backups.
- `AUTH_SECRET`: random secret of at least 48 characters.
- `ALLOW_PREOPENING_OPERATIONS=false`.
- `VAT_RATE=0.15`.
- `WASH_COUPON_VALIDITY_DAYS=30`.
- `NEXT_PUBLIC_APP_NAME=YCD OIL ERP`.

The first deployment must run `npm run db:deploy` and `npm run db:seed` against the Production database before application traffic is accepted.

## Certified business identity

- Legal name: شركة وجهتك الإبداعية لخدمات السيارات
- Branch: الرياض - حي طويق
- Bank: مصرف الراجحي
- Account number: 528000010006080781162
- IBAN: SA7180000528608010781162
- Unified National Number: 7038822883
- Official YCD OIL identity asset: `public/brand/ycd-logo-source.svg`

## Production launch gate

A technical Production deployment does not authorize commercial operation. Keep the branch in `PREOPENING` until:
1. named staff accounts are provisioned and temporary passwords changed;
2. HR operational fields are complete;
3. products, services, opening stock, and suppliers are loaded;
4. Production opening bank balance and funding source are reconciled;
5. all mandatory UAT scenarios pass with evidence;
6. `npm run verify:go-live` succeeds;
7. the launch report is approved by branch management, general accounting, and general management.

## Hosting state

The repository is production-ready and this release branch is isolated from `main`.
A hosting project and managed PostgreSQL database must exist before the first live URL can pass `/api/health`.
