"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ReturnableItem = {
  id: string;
  descriptionAr: string;
  quantity: number;
  returnedQuantity: number;
  productCategory: string | null;
};

export default function SalesReturnForm({
  invoiceId,
  items,
}: {
  invoiceId: string;
  items: ReturnableItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const availableItems = useMemo(
    () => items.map((item) => ({ ...item, available: Math.max(item.quantity - item.returnedQuantity, 0) })),
    [items],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const selected = availableItems.flatMap((item) => {
      const value = Number(data.get(`qty:${item.id}`) || 0);
      return value > 0 ? [{ serviceOrderItemId: item.id, quantity: value }] : [];
    });
    if (!selected.length) {
      setMessage("حدد كمية مرتجع لبند واحد على الأقل.");
      return;
    }

    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/secure/invoices/${invoiceId}/returns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: String(data.get("reason") || ""),
        refundMethod: data.get("refundMethod") || undefined,
        refundReference: String(data.get("refundReference") || "").trim() || undefined,
        idempotencyReference: crypto.randomUUID(),
        items: selected,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      const errors: Record<string, string> = {
        RETURN_QUANTITY_EXCEEDED: "كمية المرتجع تتجاوز الكمية المتاحة.",
        DUPLICATE_RETURN_ITEM: "تم تكرار أحد البنود.",
        REFUND_METHOD_REQUIRED: "حدد طريقة رد المبلغ للعميل.",
        OPEN_SHIFT_REQUIRED: "يلزم وجود وردية مفتوحة للاسترداد النقدي أو عبر الشبكة.",
        FINANCIAL_ACCOUNT_REQUIRED: "لا يوجد حساب مالي مناسب لعملية الاسترداد.",
        INVOICE_VOID: "لا يمكن عمل مرتجع على فاتورة ملغاة.",
      };
      setMessage(errors[result.error] || "تعذر تسجيل المرتجع.");
      return;
    }

    form.reset();
    setMessage(`تم تسجيل المرتجع ${result.salesReturn.returnNo} بنجاح.`);
    router.refresh();
  }

  return (
    <form className="returnForm" onSubmit={submit}>
      <h3>مرتجع / تسوية فاتورة</h3>
      <p className="empty">يُعاد للمخزون فقط الصنف المرتبط بالمخزون؛ بنود الخدمة لا تنشئ حركة مخزنية.</p>
      <div className="tableWrap">
        <table>
          <thead><tr><th>البند</th><th>المباع</th><th>مرتجع سابق</th><th>المتاح</th><th>كمية المرتجع</th></tr></thead>
          <tbody>
            {availableItems.map((item) => (
              <tr key={item.id}>
                <td>{item.descriptionAr}</td>
                <td>{item.quantity.toFixed(3)}</td>
                <td>{item.returnedQuantity.toFixed(3)}</td>
                <td>{item.available.toFixed(3)}</td>
                <td><input name={`qty:${item.id}`} type="number" min="0" max={item.available} step="0.001" defaultValue="0" disabled={item.available <= 0} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label>سبب المرتجع / التسوية<textarea name="reason" minLength={5} maxLength={500} required /></label>
      <div className="formRow">
        <label>طريقة رد المبلغ عند الاستحقاق
          <select name="refundMethod" defaultValue="">
            <option value="">بدون رد نقدي / تخفيض ذمة فقط</option>
            <option value="CASH">نقدي</option>
            <option value="CARD">مدى / شبكة / بطاقة</option>
            <option value="TRANSFER">تحويل بنكي</option>
          </select>
        </label>
        <label>مرجع الاسترداد<input name="refundReference" maxLength={120} placeholder="رقم السند / الحوالة / العملية" /></label>
      </div>
      <button disabled={busy}>اعتماد المرتجع والتسوية</button>
      {message && <p className="formNotice">{message}</p>}
    </form>
  );
}
