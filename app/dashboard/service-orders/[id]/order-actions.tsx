"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  sku: string;
  nameAr: string;
  salePrice: number;
  category: string;
};

export default function OrderActions({
  orderId,
  locked,
  products,
}: {
  orderId: string;
  locked: boolean;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement).entries());

    const response = await fetch(`/api/secure/service-orders/${orderId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    setBusy(false);
    if (!response.ok) {
      setMessage("تعذر إضافة البند.");
      return;
    }
    formElement.reset();
    setMessage("تمت إضافة البند.");
    router.refresh();
  }

  async function complete() {
    if (!confirm("تأكيد إقفال أمر الخدمة وإصدار الفاتورة وتسجيل الدفع؟")) return;
    setBusy(true);
    setMessage("");
    const idempotencyReference = crypto.randomUUID();
    const response = await fetch(`/api/secure/service-orders/${orderId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentMethod, idempotencyReference }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      const errors: Record<string, string> = {
        INSUFFICIENT_STOCK: "المخزون غير كافٍ لإقفال الأمر.",
        SHIFT_REQUIRED: "أمر الخدمة غير مرتبط بورديّة مفتوحة.",
        SERVICE_ORDER_EMPTY: "أضف بندًا واحدًا على الأقل قبل الإقفال.",
      };
      setMessage(errors[result.error] || "تعذر إقفال أمر الخدمة.");
      return;
    }
    const coupon = result.invoice.coupons?.[0]?.serial;
    setMessage(coupon ? `تم إصدار الفاتورة ${result.invoice.invoiceNo} والكوبون ${coupon}` : `تم إصدار الفاتورة ${result.invoice.invoiceNo}`);
    router.refresh();
  }

  if (locked) return <p className="empty">أمر الخدمة مقفل ولا يقبل تعديلات إضافية.</p>;

  return (
    <>
      <form className="intakeForm" onSubmit={addItem}>
        <label>الصنف / الخدمة
          <select
            name="productId"
            defaultValue=""
            onChange={(event) => {
              const product = products.find((item) => item.id === event.target.value);
              const form = event.currentTarget.form;
              if (!product || !form) return;
              const description = form.elements.namedItem("descriptionAr") as HTMLInputElement | null;
              const price = form.elements.namedItem("unitPrice") as HTMLInputElement | null;
              if (description) description.value = product.nameAr;
              if (price) price.value = String(product.salePrice);
            }}
          >
            <option value="">بند يدوي بدون مخزون</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.sku} — {product.nameAr}</option>
            ))}
          </select>
        </label>
        <label>وصف الخدمة / المادة<input name="descriptionAr" required /></label>
        <div className="formRow">
          <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label>
          <label>سعر الوحدة<input name="unitPrice" type="number" min="0" step="0.01" required /></label>
        </div>
        <label>الخصم<input name="discount" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <button type="submit" disabled={busy}>إضافة البند</button>
      </form>
      <hr className="divider" />
      <label className="paymentSelect">طريقة الدفع
        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "CASH" | "CARD" | "TRANSFER")}>
          <option value="CASH">نقدًا</option>
          <option value="CARD">شبكة / بطاقة</option>
          <option value="TRANSFER">تحويل بنكي</option>
        </select>
      </label>
      <button className="completeButton" type="button" disabled={busy} onClick={complete}>إقفال الخدمة وإصدار الفاتورة</button>
      {message && <p className="formNotice">{message}</p>}
    </>
  );
}
