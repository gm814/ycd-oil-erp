"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Asset = { id: string; assetNo: string; nameAr: string; status: string };
type WorkOrder = { id: string; workOrderNo: string; assetName: string };

export default function AssetActions({ assets, openOrders }: { assets: Asset[]; openOrders: WorkOrder[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const messages: Record<string, string> = {
        ASSET_CREATE_FAILED: "تعذر تسجيل الأصل؛ تحقق من رقم الأصل.",
        ASSET_DISPOSED: "الأصل مستبعد ولا يمكن فتح صيانة عليه.",
        MAINTENANCE_NOT_OPEN: "أمر الصيانة مقفل أو ملغى.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم تنفيذ العملية وتسجيلها في سجل الرقابة.");
    router.refresh();
    return true;
  }

  function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/assets", Object.fromEntries(new FormData(form).entries()))
      .then((ok) => { if (ok) form.reset(); });
  }

  function openMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const assetId = String(data.get("assetId") || "");
    const body = Object.fromEntries(data.entries());
    delete body.assetId;
    void post(`/api/secure/assets/${assetId}/maintenance`, body)
      .then((ok) => { if (ok) form.reset(); });
  }

  function completeMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const orderId = String(data.get("orderId") || "");
    const body = Object.fromEntries(data.entries());
    delete body.orderId;
    void post(`/api/secure/maintenance/${orderId}/complete`, body)
      .then((ok) => { if (ok) form.reset(); });
  }

  return (
    <>
      <section className="workGrid">
        <article className="panel">
          <h2>تسجيل أصل</h2>
          <form className="intakeForm" onSubmit={createAsset}>
            <div className="formRow">
              <label>رقم الأصل<input name="assetNo" required /></label>
              <label>اسم الأصل<input name="nameAr" required /></label>
            </div>
            <div className="formRow">
              <label>الفئة<input name="categoryAr" placeholder="معدات مغسلة / كمبروسر / جهاز..." required /></label>
              <label>الرقم التسلسلي<input name="serialNo" /></label>
            </div>
            <label>الموقع<input name="locationAr" /></label>
            <div className="formRow">
              <label>تاريخ الشراء<input name="purchaseDate" type="date" /></label>
              <label>تكلفة الشراء<input name="purchaseCost" type="number" min="0" step="0.01" /></label>
            </div>
            <label>موعد الصيانة القادمة<input name="nextMaintenanceAt" type="date" /></label>
            <button disabled={busy}>حفظ الأصل</button>
          </form>
        </article>

        <article className="panel">
          <h2>فتح أمر صيانة</h2>
          <form className="intakeForm" onSubmit={openMaintenance}>
            <label>الأصل<select name="assetId" required defaultValue=""><option value="" disabled>اختر الأصل</option>{assets.filter((asset) => asset.status !== "DISPOSED").map((asset) => <option key={asset.id} value={asset.id}>{asset.assetNo} — {asset.nameAr}</option>)}</select></label>
            <label>نوع الصيانة<select name="type" defaultValue="CORRECTIVE"><option value="PREVENTIVE">وقائية</option><option value="CORRECTIVE">تصحيحية</option><option value="INSPECTION">فحص</option></select></label>
            <label>وصف البلاغ / العمل<input name="issueAr" required /></label>
            <label>المسؤول / الجهة<input name="assignedTo" /></label>
            <label>تكلفة تقديرية<input name="estimatedCost" type="number" min="0" step="0.01" /></label>
            <button disabled={busy || assets.length === 0}>فتح أمر الصيانة</button>
          </form>
        </article>
      </section>

      <article className="panel inventoryPanel">
        <h2>إقفال أمر صيانة</h2>
        <form className="intakeForm" onSubmit={completeMaintenance}>
          <label>أمر الصيانة<select name="orderId" required defaultValue=""><option value="" disabled>اختر أمر الصيانة</option>{openOrders.map((order) => <option key={order.id} value={order.id}>{order.workOrderNo} — {order.assetName}</option>)}</select></label>
          <div className="formRow">
            <label>التكلفة الفعلية<input name="actualCost" type="number" min="0" step="0.01" defaultValue="0" /></label>
            <label>الصيانة القادمة<input name="nextMaintenanceAt" type="date" /></label>
          </div>
          <label>نتيجة الصيانة والأعمال المنفذة<input name="completionNotesAr" required /></label>
          <button disabled={busy || openOrders.length === 0}>إقفال أمر الصيانة</button>
        </form>
      </article>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
