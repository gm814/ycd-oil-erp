import { notFound, redirect } from "next/navigation";
import qrcode from "qrcode-generator";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PERMISSIONS as P, hasPermission } from "@/lib/rbac";
import PrintDocumentButton from "@/components/print-document-button";
export default async function LoyaltyCard({ params }: { params: Promise<{id:string}> }) {
 const session=await getSession();
 if(!session?.branchId || ![P.CUSTOMER_VIEW,P.SERVICE_ORDER_CREATE,P.USER_MANAGE].some(p=>hasPermission(session.permissions,p))) redirect("/dashboard");
 const {id}=await params;
 const customer=await db.customer.findFirst({where:{id,serviceOrders:{some:{branchId:session.branchId}}},include:{loyaltyEntries:{where:{branchId:session.branchId},orderBy:{createdAt:"desc"}},}});
 if(!customer) notFound();
 const branch=await db.branch.findUniqueOrThrow({where:{id:session.branchId},include:{loyaltyProgram:true}});
 const balance=customer.loyaltyEntries.filter(e=>!e.revoked).reduce((n,e)=>n+e.points,0);
 const qr=qrcode(0,"M");qr.addData(customer.loyaltyCode,"Byte");qr.make();
 return <main className="workspace"><a href="/dashboard/loyalty">← برنامج الولاء</a><PrintDocumentButton label="طباعة بطاقة الولاء"/><section className="panel"><h1>YCD OIL — بطاقة الولاء</h1><h2>{customer.name}</h2><p>{customer.customerNo} · {branch.nameAr}</p><div style={{width:180}} dangerouslySetInnerHTML={{__html:qr.createSvgTag({cellSize:4,margin:4,scalable:true})}}/><p dir="ltr">{customer.loyaltyCode}</p><p>رصيد الغسلات المدفوعة المتاح: {balance}</p><p>{branch.loyaltyProgram?.active ? `الغسلة المجانية بعد كل ${branch.loyaltyProgram.paidWashesRequired} غسلات مدفوعة مؤهلة.` : "البرنامج غير مفعّل حاليًا."}</p><p>أبرز البطاقة عند الاستقبال. البطاقة للتعريف بالعميل؛ الاستبدال يتم لدى الموظف من أمر غسيل مباشر.</p></section><section className="panel"><h2>سجل الولاء</h2>{customer.loyaltyEntries.map(e=><p key={e.id}>{e.createdAt.toLocaleDateString("ar-SA")} · {e.points>0?"غسلة مدفوعة":"استبدال غسلة مجانية"} · {e.points} {e.revoked?"— ملغى بسبب مرتجع":""}</p>)}</section></main>;
}
