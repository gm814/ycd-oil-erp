"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Product = { id: string; sku: string; nameAr: string };
type Supplier = { id: string; code: string; nameAr: string };

export default function ProcurementForms({ products, suppliers }: { products: Product[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(url: string, body: unknown, form: HTMLFormElement) {
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
      setMessage(result.error === "SUPPLIER_CREATE_FAILED" ? "تعذر إنشاء المورد؛ تحقق من كود المورد." : "تعذر حفظ العملية.");
      return;
    }
    form.reset();
    setMessage("تم الحفظ بنجاح.");
    router.refresh();
  }

  function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void send("/api/secure/procurement/suppliers", Object.fromEntries(new FormData(form).entries()), form);
  }

  function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void send("/api/secure/procurement/requests", {
      reason: data.get("reason"),
      items: [{
        productId: data.get("productId"),
        quantity: data.get("quantity"),
        notes: data.get("notes"),
      }],
    }, form);
  }

  return (
    <>
      <section className="workGrid">
        <article className="panel">
          <h2>طلب شراء جديد</h2>
          <form className="intakeForm" onSubmit={createRequest}>
            <label>الصنف
              <select name="productId" required defaultValue="">
                <option value="" disabled>اختر الصنف</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.nameAr}</option>)}
              </select>
            </label>
            <div className="formRow">
              <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" required /></label>
              <label>ملاحظة البند<input name="notes" /></label>
            </div>
            <label>سبب / مبرر الطلب<input name="reason" /></label>
            <button disabled={busy || products.length === 0}>إنشاء طلب شراء</button>
          </form>
        </article>

        <article className="panel">
          <h2>تعريف مورد</h2>
          <form className="intakeForm" onSubmit={createSupplier}>
            <div className="formRow">
              <label>كود المورد<input name="code" required /></label>
              <label>اسم المورد<input name="nameAr" required /></label>
            </div>
            <div className="formRow">
              <label>الرقم الضريبي<input name="vatNumber" /></label>
              <label>السجل التجاري<input name="crNumber" /></label>
            </div>
            <div className="formRow">
              <label>الجوال<input name="phone" /></label>
              <label>البريد الإلكتروني<input name="email" type="email" /></label>
            </div>
            <button disabled={busy}>حفظ المورد</button>
          </form>
          <p className="empty">الموردون النشطون: {suppliers.length.toLocaleString("ar-SA-u-nu-latn")}</p>
        </article>
      </section>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
