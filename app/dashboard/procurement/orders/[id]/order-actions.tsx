"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Item = { id: string; label: string; ordered: number; received: number };
type Invoice = { id: string; invoiceNo: string; status: string; matched: boolean };

export default function OrderProcurementActions({
  orderId, status, items, poSubtotal, poVatAmount, poTotal, invoices,
}: {
  orderId: string;
  status: string;
  items: Item[];
  poSubtotal: number;
  poVatAmount: number;
  poTotal: number;
  invoices: Invoice[];
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
        RECEIPT_EXCEEDS_ORDERED_QUANTITY: "كمية الاستلام تتجاوز الكمية المطلوبة.",
        THREE_WAY_MATCH_REQUIRED: "لا يمكن اعتماد الدفع قبل نجاح المطابقة الثلاثية.",
        SUPPLIER_INVOICE_DUPLICATE: "فاتورة المورد مسجلة مسبقًا.",
      };
      setMessage(messages[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage("تم تنفيذ العملية بنجاح.");
    router.refresh();
    return true;
  }

  function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const receiptItems = items
      .map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(data.get(`qty_${item.id}`) || 0) }))
      .filter((item) => item.quantity > 0);
    if (receiptItems.length === 0) {
      setMessage("أدخل كمية مستلمة واحدة على الأقل.");
      return;
    }
    void post(`/api/secure/procurement/orders/${orderId}/receive`, {
      supplierDeliveryRef: data.get("supplierDeliveryRef"),
      items: receiptItems,
    }).then((ok) => { if (ok) form.reset(); });
  }

  function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void post(`/api/secure/procurement/orders/${orderId}/supplier-invoice`, Object.fromEntries(data.entries()))
      .then((ok) => { if (ok) form.reset(); });
  }

  const receivable = status === "APPROVED" || status === "PARTIALLY_RECEIVED";

  return (
    <div className="actionStack">
      {receivable && (
        <form className="intakeForm procurementAction" onSubmit={receive}>
          <h3>استلام مخزني</h3>
          {items.map((item) => {
            const remaining = Math.max(0, item.ordered - item.received);
            return (
              <label key={item.id}>{item.label} — المتبقي {remaining}
                <input name={`qty_${item.id}`} type="number" min="0" max={remaining} step="0.001" defaultValue={remaining || 0} disabled={remaining === 0} />
              </label>
            );
          })}
          <label>مرجع تسليم المورد<input name="supplierDeliveryRef" /></label>
          <button disabled={busy}>تسجيل الاستلام وإضافة المخزون</button>
        </form>
      )}

      <form className="intakeForm procurementAction" onSubmit={createInvoice}>
        <h3>فاتورة المورد والمطابقة الثلاثية</h3>
        <label>رقم فاتورة المورد<input name="invoiceNo" required /></label>
        <div className="formRow">
          <label>قبل الضريبة<input name="subtotal" type="number" step="0.01" defaultValue={poSubtotal.toFixed(2)} required /></label>
          <label>الضريبة<input name="vatAmount" type="number" step="0.01" defaultValue={poVatAmount.toFixed(2)} required /></label>
        </div>
        <label>الإجمالي<input name="total" type="number" step="0.01" defaultValue={poTotal.toFixed(2)} required /></label>
        <button disabled={busy}>تسجيل الفاتورة وفحص المطابقة</button>
      </form>

      {invoices.filter((invoice) => invoice.matched && invoice.status === "MATCHED").map((invoice) => (
        <button key={invoice.id} className="secondaryButton" disabled={busy} onClick={() => void post(`/api/secure/procurement/supplier-invoices/${invoice.id}/approve-payment`, {})}>
          اعتماد دفع الفاتورة {invoice.invoiceNo}
        </button>
      ))}
      {message && <p className="formNotice">{message}</p>}
    </div>
  );
}
