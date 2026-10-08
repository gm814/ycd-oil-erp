import type { Prisma } from "@prisma/client";

// PostgreSQL sequence is atomic across concurrent requests and app instances.
// Numbers are never recycled: failed/rolled-back operations can leave gaps.
export async function nextDocumentNumber(tx: Pick<Prisma.TransactionClient, "$queryRaw">): Promise<string> {
  const [row] = await tx.$queryRaw<{ value: string }[]>`SELECT nextval('"YcdDocumentNumber"')::text AS value`;
  return `YCD-${row.value.padStart(4, "0")}`;
}
