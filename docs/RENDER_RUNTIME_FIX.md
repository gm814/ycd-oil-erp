# Render runtime repair — 29 September 2026

- Technical runtime fix from development commit 336f93b2ef391b630bf7e009ee98eb0599a40859.
- CI #556 passed, including PostgreSQL connectivity from the final container.
- Installs OpenSSL and CA certificates in a shared Debian base for Prisma 6.
- Health check follows PORT; default 10000.
- Adds a final-container database smoke test to CI.
- No database migrations, seed execution, business-data updates, or commercial activation are part of this patch.
- Confirm status=ok and database=reachable at /api/health after deployment. CI cannot validate production credentials or networking.
