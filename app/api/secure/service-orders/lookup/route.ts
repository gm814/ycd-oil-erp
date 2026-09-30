import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (!session.branchId || !hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const q=new URL(request.url).searchParams.get("q")?.trim().slice(0,80);
  if(!q || q.length<2) return NextResponse.json({ vehicles: [] });
  const vehicles=await db.vehicle.findMany({where:{serviceOrders:{some:{branchId:session.branchId}},OR:[{plate:{contains:q,mode:"insensitive"}},{customer:{customerNo:{equals:q,mode:"insensitive"}}},{customer:{phone:q}},{customer:{loyaltyCode:q}}]},include:{customer:true,history:{where:{serviceOrder:{branchId:session.branchId}},orderBy:{createdAt:"desc"},take:1}},take:20,orderBy:{plate:"asc"}});
  return NextResponse.json({vehicles:vehicles.map(v=>({id:v.id,plate:v.plate,make:v.make,model:v.model,year:v.year,odometer:v.currentOdometer,customerId:v.customerId,customerNo:v.customer.customerNo,customerName:v.customer.name,phone:v.customer.phone,lastVisit:v.history[0]?.createdAt??null,nextServiceKm:v.history[0]?.nextServiceKm??null,nextServiceAt:v.history[0]?.nextServiceAt??null}))},{headers:{"cache-control":"no-store"}});
}
