import type { Prisma, PrismaClient } from "@prisma/client";

type AuditClient = Pick<PrismaClient, "auditLog">;

export async function writeAudit(
  client: AuditClient,
  input: {
    actorId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    beforeJson?: Prisma.InputJsonValue;
    afterJson?: Prisma.InputJsonValue;
    ipAddress?: string;
  },
) {
  return client.auditLog.create({ data: input });
}
