import type { Prisma } from "@prisma/client";
import type { MedadKind } from "@/lib/medad/contract";
// Kept inside the accounting transaction: no network, immutable unique source identity.
export async function captureMedad(tx:Prisma.TransactionClient,branchId:string,kind:MedadKind,sourceId:string,sourceNo:string,manual=false) {
 const config=await tx.medadConnection.findUnique({where:{branchId}});
 if(!config || (!manual&&!config.captureEnabled))return null;
 return tx.medadOutbox.upsert({where:{branchId_kind_sourceId:{branchId,kind,sourceId}},update:{},create:{branchId,kind,sourceId,sourceNo}});
}
