import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { companyConfig } from "@/lib/config";
import PrintDocumentButton from "@/components/print-document-button";
import styles from "./reminder.module.css";

export default async function ServiceReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id } = await params;
  const order = await db.serviceOrder.findFirst({
    where: { id, branchId: session.branchId },
    include: { vehicle: true, customer: true, items: { include: { product: true } }, histories: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order || order.status !== "COMPLETED") notFound();
  async function saveMake(form: FormData) {
    "use server";
    const actor = await getSession();
    if (!actor?.branchId || !hasPermission(actor.permissions, PERMISSIONS.SERVICE_ORDER_CREATE)) throw new Error("FORBIDDEN");
    const make = String(form.get("make") || "").trim();
    if (!make || make.length > 60) throw new Error("INVALID_MAKE");
    await db.$transaction(async tx => {
      const current = await tx.serviceOrder.findFirst({ where: { id, branchId: actor.branchId }, include: { vehicle: true } });
      if (!current) throw new Error("ORDER_NOT_FOUND");
      if (current.vehicle.make) return;
      await tx.vehicle.update({ where: { id: current.vehicleId }, data: { make } });
      await tx.auditLog.create({ data: { actorId: actor.userId, action: "VEHICLE_MAKE_COMPLETED", entityType: "Vehicle", entityId: current.vehicleId, beforeJson: { make: current.vehicle.make }, afterJson: { make, serviceOrderId: id } } });
    });
    revalidatePath(`/dashboard/service-orders/${id}/reminder`);
  }
  const history = order.histories[0];
  const oilItem = order.items.find(item => item.product?.category === "OIL");
  const date = (value: Date) => value.toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh" });
  const categories = [["OIL","زيت المحرك"],["FILTER","الفلاتر"],["BATTERY","البطارية"],["PART","قطع / فحص"],["SERVICE","خدمة عامة"]];
  return (
    <main className={`workspace ${styles.workspace}`}>
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/service-orders/${id}`} className="backLink">← أمر الخدمة</a>
        <PrintDocumentButton label="طباعة بطاقة التذكير" />
      </div>
      {!order.vehicle.make && hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE) && <aside className={`${styles.correction} noPrint`}>
        <p>الشركة المصنّعة غير مسجلة. أكملها لتظهر مع الموديل في البطاقة.</p>
        <form action={saveMake}><label>الشركة المصنّعة<input name="make" required maxLength={60} placeholder="مثال: Toyota" /></label><button type="submit">حفظ بيانات السيارة</button></form>
      </aside>}
      <article className={styles.card}>
        <header className={styles.header}>
          <img className={styles.logo} src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
          <div><h1>تذكير الخدمة القادمة</h1><small>SERVICE REMINDER</small></div>
        </header>
        <div className={styles.meta}><b dir="ltr">{order.orderNo}</b><div>تاريخ الخدمة: <b dir="ltr">{date(order.createdAt)}</b></div></div>
        <section className={styles.next}>
          <h2>موعد زيارتك القادمة</h2>
          <div className={styles.nextValues}>
            <div><span>عند وصول العداد إلى</span><strong>{history?.nextServiceKm != null ? `${history.nextServiceKm.toLocaleString("en-US")} كم` : "لم يُحدد"}</strong></div>
            <div><span>أو بتاريخ</span><strong>{history?.nextServiceAt ? date(history.nextServiceAt) : "لم يُحدد"}</strong></div>
          </div>
        </section>
        <section className={styles.grid}>
          <div><span>السيارة / الموديل</span><b>{[order.vehicle.make,order.vehicle.model,order.vehicle.year].filter(Boolean).join(" · ") || "غير مسجل"}</b></div>
          <div><span>رقم اللوحة</span><b>{order.vehicle.plate}</b></div>
          <div><span>العداد عند الخدمة</span><b>{order.odometer != null ? `${order.odometer.toLocaleString("en-US")} كم` : "غير مسجل"}</b></div>
          <div><span>العميل</span><b>{order.customer.name}</b></div>
          {oilItem && <div className={styles.wide}><span>الزيت المستخدم</span><b>{oilItem.descriptionAr}</b></div>}
        </section>
        <div className={styles.services}>{categories.filter(([category])=>order.items.some(item=>item.product?.category===category)).map(([category,label])=><span key={category}>✓ {label}</span>)}</div>
        <footer className={styles.footer}><b dir="ltr">{companyConfig.phone}</b><div>{companyConfig.branch}</div><div dir="ltr">{companyConfig.website}</div></footer>
      </article>
    </main>
  );
}
