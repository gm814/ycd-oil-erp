"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = { id: string; sku: string; nameAr: string; category: string; serviceIntervalKm: number | null };

export default function InventoryForms({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("OIL");

  async function post(url: string, form: HTMLFormElement, method = "POST") {
    setBusy(true);
    setMessage("");
    const payload = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error === "PRODUCT_CREATE_FAILED" ? "تعذر إنشاء الصنف؛ تحقق من عدم تكرار SKU." : "تعذر حفظ العملية.");
      return false;
    }
    form.reset();
    setMessage("تم حفظ العملية بنجاح.");
    router.refresh();
    return true;
  }

  function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void post("/api/secure/inventory/products", event.currentTarget).then(saved => { if (saved) setCategory("OIL"); });
  }

  function receiveStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void post("/api/secure/inventory/receive", event.currentTarget);
  }

  return (
    <>
      <section className="workGrid">
        <article className="panel">
          <h2>تعريف صنف</h2>
          <form className="intakeForm" onSubmit={createProduct}>
            <div className="formRow">
              <label>SKU<input name="sku" required /></label>
              <label>اسم الصنف<input name="nameAr" required /></label>
            </div>
            <div className="formRow">
              <label>التصنيف
                <select name="category" value={category} onChange={event => setCategory(event.target.value)}>
                  <option value="OIL">زيوت</option><option value="FILTER">فلاتر</option>
                  <option value="BATTERY">بطاريات</option><option value="PART">قطع غيار</option>
                  <option value="WASH_SUPPLY">مواد مغسلة</option><option value="SERVICE">خدمة</option>
                  <option value="OTHER">أخرى</option>
                </select>
              </label>
              <label>الوحدة<input name="unit" placeholder="لتر / حبة" required /></label>
            </div>
            <div className="formRow">
              <label>سعر البيع<input name="salePrice" type="number" min="0" step="0.01" required /></label>
              <label>التكلفة<input name="costPrice" type="number" min="0" step="0.01" required /></label>
            </div>
            {category === "OIL" && <label>فترة الخدمة حسب صنف الزيت<select name="serviceIntervalKm" defaultValue=""><option value="">غير محددة</option><option value="5000">5,000 كم</option><option value="10000">10,000 كم</option></select></label>}
            <label>الحد الأدنى للمخزون<input name="minStock" type="number" min="0" step="0.001" defaultValue="0" /></label>
            <label className="checkLabel"><input name="grantsWashCoupon" type="checkbox" value="true" /> يمنح كوبون غسيل مجاني عند بيعه</label>
            <button disabled={busy}>حفظ الصنف</button>
          </form>
        </article>

        <article className="panel">
          <h2>استلام مخزون</h2>
          <form className="intakeForm" onSubmit={receiveStock}>
            <label>الصنف
              <select name="productId" required defaultValue="">
                <option value="" disabled>اختر الصنف</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.nameAr}</option>)}
              </select>
            </label>
            <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" required /></label>
            <label>مرجع الاستلام<input name="reference" placeholder="فاتورة المورد / GRN" /></label>
            <button disabled={busy || products.length === 0}>إضافة للمخزون</button>
          </form>
        </article>
      </section>
      <article className="panel">
        <h2>فترة خدمة أصناف الزيت الحالية</h2>
        <p>حدد المسافة لكل صنف. يُضاف هذا المقدار تلقائيًا إلى عداد السيارة، ويُترك التاريخ القادم فارغًا.</p>
        {products.filter(p => p.category === "OIL").map(product => <form key={`${product.id}-${product.serviceIntervalKm}`} className="intakeForm" onSubmit={event => { event.preventDefault(); void post("/api/secure/inventory/products", event.currentTarget, "PATCH"); }}>
          <input type="hidden" name="productId" value={product.id} />
          <label>{product.sku} — {product.nameAr}<select name="serviceIntervalKm" defaultValue={product.serviceIntervalKm ?? ""}><option value="">غير محددة</option><option value="5000">5,000 كم</option><option value="10000">10,000 كم</option></select></label>
          <button disabled={busy}>حفظ فترة الصنف</button>
        </form>)}
      </article>
      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
