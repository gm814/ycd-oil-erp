import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { YcdDocumentFooter, YcdDocumentHeader } from "@/components/ycd-document-brand";
import PrintDocumentButton from "@/components/print-document-button";

export default async function ServiceReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id } = await params;

  const order = await db.serviceOrder.findFirst({
    where: { id, branchId: session.branchId },
    include: {
      vehicle: true,
      customer: true,
      items: { include: { product: true } },
      histories: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!order || order.status !== "COMPLETED") notFound();
  const history = order.histories[0];
  const oilItem = order.items.find((item) => item.product?.category === "OIL");

  return (
    <main className="workspace reminderWorkspace">
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/service-orders/${order.id}`} className="backLink">← أمر الخدمة</a>
        <PrintDocumentButton label="طباعة تذكير الخدمة" />
      </div>
      <article className="serviceReminderCard">
        <YcdDocumentHeader title="تذكير الخدمة القادمة" titleEn="SERVICE REMINDER" number={order.orderNo} />
        <section className="reminderGrid">
          <div><span>رقم العميل</span><b>{order.customer.customerNo}</b></div>
          <div><span>رقم الزيارة / الخدمة</span><b>{order.orderNo}</b></div>
          <div><span>التاريخ</span><b>{order.createdAt.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</b></div>
          <div><span>نوع السيارة</span><b>{order.vehicle.make || "—"}</b></div>
          <div><span>الموديل</span><b>{[order.vehicle.model, order.vehicle.year].filter(Boolean).join(" · ") || "—"}</b></div>
          <div><span>رقم اللوحة</span><b>{order.vehicle.plate}</b></div>
          <div><span>العداد عند الخدمة</span><b>{order.odometer?.toLocaleString("ar-SA-u-nu-latn") ?? "—"} كم</b></div>
          <div><span>نوع الزيت المستخدم</span><b>{oilItem?.descriptionAr || "—"}</b></div>
        </section>
        <section className="nextServiceBand">
          <b>موعد الخدمة / الغيار القادم</b>
          <div><span>التاريخ</span><strong>{history?.nextServiceAt?.toLocaleDateString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" }) ?? "—"}</strong></div>
          <div><span>أو عند الوصول إلى</span><strong>{history?.nextServiceKm?.toLocaleString("ar-SA-u-nu-latn") ?? "—"} كم</strong></div>
        </section>
        <section className="serviceChecks">
          {["OIL", "FILTER", "BATTERY", "PART", "SERVICE"].map((category) => (
            <span key={category} className={order.items.some((item) => item.product?.category === category) ? "checkedService" : ""}>
              {category === "OIL" ? "زيت المحرك" : category === "FILTER" ? "الفلاتر" : category === "BATTERY" ? "البطارية" : category === "PART" ? "قطع / فحص" : "خدمة عامة"}
            </span>
          ))}
        </section>
        <p className="reminderCustomer">العميل: <b>{order.customer.name}</b> · الجوال: <b>{order.customer.phone || "—"}</b></p>
        <YcdDocumentFooter />
      </article>
    </main>
  );
}
