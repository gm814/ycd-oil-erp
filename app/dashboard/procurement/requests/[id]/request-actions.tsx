"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Supplier = { id: string; code: string; nameAr: string };
type RequestItem = { id: string; label: string; quantity: number };
type Quote = { id: string; supplier: string; totalAmount: number };

export default function RequestActions({
  requestId, status, suppliers, items, quotes, hasOrder,
}: {
  requestId: string;
  status: string;
  suppliers: Supplier[];
  items: RequestItem[];
  quotes: Quote[];
  hasOrder: boolean;
}) {
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
        SUPPLIER_QUOTE_REQUIRED: "يجب إضافة عرض مورد واحد على الأقل.",
        PURCHASE_REQUEST_NOT_APPROVED: "يجب اعتماد طلب الشراء أولًا.",
        QUOTE_MUST_COVER_ALL_REQUEST_ITEMS: "يجب تسعير جميع بنود الطلب.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم تنفيذ العملية بنجاح.");
    router.refresh();
    return true;
  }

  function addQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const validUntil = String(data.get("validUntil") || "");
    const quoteItems = items.map((item) => ({
      purchaseRequestItemId: item.id,
      unitCost: data.get(`unitCost_${item.id}`),
    }));
    void post(`/api/secure/procurement/requests/${requestId}/quotes`, {
      supplierId: data.get("supplierId"),
      quoteNo: data.get("quoteNo"),
      validUntil: validUntil ? new Date(`${validUntil}T12:00:00Z`).toISOString() : undefined,
      notes: data.get("notes"),
      items: quoteItems,
    }).then((ok) => { if (ok) form.reset(); });
  }

  return (
    <div className="actionStack">
      {status === "PENDING_APPROVAL" && (
        <form className="intakeForm procurementAction" onSubmit={addQuote}>
          <h3>إضافة عرض مورد</h3>
          <label>المورد
            <select name="supplierId" required defaultValue="">
              <option value="" disabled>اختر المورد</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} — {supplier.nameAr}</option>)}
            </select>
          </label>
          <div className="formRow">
            <label>رقم العرض<input name="quoteNo" /></label>
            <label>صالح حتى<input name="validUntil" type="date" /></label>
          </div>
          {items.map((item) => (
            <label key={item.id}>سعر الوحدة — {item.label} ({item.quantity})
              <input name={`unitCost_${item.id}`} type="number" min="0" step="0.01" required />
            </label>
          ))}
          <label>ملاحظات<input name="notes" /></label>
          <button disabled={busy || suppliers.length === 0}>حفظ عرض المورد</button>
        </form>
      )}

      {status === "PENDING_APPROVAL" && quotes.length > 0 && (
        <button disabled={busy} onClick={() => void post(`/api/secure/procurement/requests/${requestId}/approve`, {})}>اعتماد طلب الشراء</button>
      )}

      {status === "APPROVED" && !hasOrder && (
        <div className="intakeForm procurementAction">
          <h3>إصدار أمر الشراء</h3>
          {quotes.map((quote) => (
            <button key={quote.id} className="secondaryButton" disabled={busy} onClick={() => void post(`/api/secure/procurement/requests/${requestId}/order`, { quoteId: quote.id })}>
              {quote.supplier} — {quote.totalAmount.toFixed(2)} ر.س
            </button>
          ))}
        </div>
      )}
      {message && <p className="formNotice">{message}</p>}
    </div>
  );
}
