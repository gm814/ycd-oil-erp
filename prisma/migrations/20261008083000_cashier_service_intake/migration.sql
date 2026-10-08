-- Add intake access only; retain existing branch and open-shift guards.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.code = 'CASHIER' AND p.code = 'service_order.create'
ON CONFLICT DO NOTHING;
