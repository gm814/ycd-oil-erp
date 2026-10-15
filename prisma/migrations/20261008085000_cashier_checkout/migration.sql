-- Authorized cashier checkout permissions; do not grant inventory management or credit sales.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code = 'CASHIER' AND p.code IN ('inventory.issue', 'invoice.issue')
ON CONFLICT DO NOTHING;
