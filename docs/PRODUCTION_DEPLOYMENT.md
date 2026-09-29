# YCD OIL ERP - Production deployment

The application can run as a protected PREOPENING deployment before commercial launch.

## Required environment variables

Configure these values in the hosting platform or server secret store:

- DATABASE_URL: PostgreSQL connection string.
- AUTH_SECRET: random value of at least 48 characters.
- ALLOW_PREOPENING_OPERATIONS: keep set to false in production.
- NEXT_PUBLIC_APP_NAME: YCD OIL ERP.
- VAT_RATE: 0.15.
- WASH_COUPON_VALIDITY_DAYS: 30.

For Docker Compose, also configure POSTGRES_DB, POSTGRES_USER and a strong POSTGRES_PASSWORD.

For the first administrator bootstrap only, ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD may be supplied. Remove the bootstrap password from the host environment after the account has been created.

## Docker production start

1. Copy the repository to the production host.
2. Configure the environment values in the host secret store or a local untracked environment file.
3. Run: docker compose -f docker-compose.production.yml up -d --build
4. Verify: GET /api/health must return HTTP 200 with status=ok and database=reachable.
5. Open /dashboard/readiness/deployment and confirm all production checks.
6. Keep the branch in PREOPENING until catalog, stock, suppliers, HR, user accounts and UAT are complete.
7. GO LIVE must be authorized from the readiness workflow; never enable ALLOW_PREOPENING_OPERATIONS in production.

## Data protection

- Never commit database passwords, AUTH_SECRET or temporary employee passwords.
- Back up the PostgreSQL volume before upgrades and before GO LIVE.
- Use HTTPS at the reverse proxy or hosting platform.
- Restrict direct PostgreSQL network access to the application host.
