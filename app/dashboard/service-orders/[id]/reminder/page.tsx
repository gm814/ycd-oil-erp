import { oilServiceReminder } from "@/lib/oil-service-interval";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/rbac";
import { companyConfig } from "@/lib/config";
import ThermalReminder from "./thermal-reminder";
import styles from "./reminder.module.css";

export default async function ServiceReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!session.branchId) redirect("/dashboard");
  const { id } = await params;
  const order = await db.serviceOrder.findFirst({
    where: { id, branchId: session.branchId },
    include: { invoice: true, vehicle: true, customer: true, items: { include: { product: true } }, histories: { orderBy: { createdAt: "desc" }, take: 1 } },
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
  const reminder = oilServiceReminder(order.odometer, order.items);
  const nextKm = history?.nextServiceKm ?? reminder.nextKm;
  const oilItem = order.items.find(item => item.product?.category === "OIL");
  const date = (value: Date) => value.toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh" });
  return (
    <main className={`workspace ${styles.workspace}`}>
      <div className="invoiceActions noPrint">
        <a href={`/dashboard/service-orders/${id}`} className="backLink">← أمر الخدمة</a>
        {order.invoice && <a className="secondaryLink" href={`/dashboard/invoices/${order.invoice.id}#customer-package`}>الفاتورة والتذكير وكوبون الغسيل — مشاركة واحدة</a>}
      </div>
      {!order.vehicle.make && hasPermission(session.permissions, PERMISSIONS.SERVICE_ORDER_CREATE) && <aside className={`${styles.correction} noPrint`}>
        <p>الشركة المصنّعة غير مسجلة. أكملها لتظهر مع الموديل في البطاقة.</p>
        <form action={saveMake}><label>الشركة المصنّعة<input name="make" required maxLength={60} placeholder="مثال: Toyota" /></label><button type="submit">حفظ بيانات السيارة</button></form>
      </aside>}
      {nextKm === null && oilItem && <p className="noPrint" role="status">يلزم تحديد فترة خدمة صنف الزيت في المخزون (5,000 أو 10,000 كم)، ووجود قراءة عداد. عند وجود زيوت بفترات مختلفة لا يُحسب موعد تلقائي.</p>}
      <ThermalReminder data={{
        customerName: order.customer.name,
        customerPhone: order.customer.phone || "",
        serviceDate: date(order.createdAt),
        vehicle: [order.vehicle.make, order.vehicle.model, order.vehicle.year].filter(Boolean).join(" · ") || "السيارة غير مسجلة",
        plate: order.vehicle.plate,
        odometer: order.odometer?.toLocaleString("en-US") ?? "غير مسجل",
        service: oilItem?.descriptionAr || order.items.map(item => item.descriptionAr).join("، ") || "خدمة عامة",
        nextKm: nextKm?.toLocaleString("en-US") ?? "لم يُحدد",
        nextDate: history?.nextServiceAt ? date(history.nextServiceAt) : "",
        phone: companyConfig.phone,
        website: companyConfig.website,
      }} />
    </main>
  );
}
