"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  sku: string;
  nameAr: string;
  salePrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  category: string;
};

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "CREDIT";

export default function OrderActions({
  orderId,
  odometer,
  locked,
  products,
  reminder,
}: {
  reminder: { nextKm: number | null; reason: string };
  orderId: string;
  odometer: number | null;
  locked: boolean;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [nextServiceKm, setNextServiceKm] = useState("");
  const [intervalMode, setIntervalMode] = useState("AUTO");
  const [manualInterval, setManualInterval] = useState("");
  const distance = Number(manualInterval);
  const manualValid = manualInterval.trim() !== "" && Number.isSafeInteger(distance) && distance > 0 && odometer !== null && Number.isSafeInteger(odometer) && odometer >= 0 && odometer + distance <= 3_000_000;
  const manualNextKm = manualValid ? odometer! + distance : "";

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
      const result = await response.json().catch(() => ({}));
      setMessage(result.error === "PRICE_OUT_OF_RANGE" ? "السعر أو صافي البيع بعد الخصم خارج الحدود المسموحة للصنف." : result.error === "PRODUCT_INACTIVE" ? "الصنف غير نشط." : "تعذر إضافة البند.");
      return;
    }
    formElement.reset();
    setSelectedProduct(null);
    setMessage("تمت إضافة البند.");
    router.refresh();
  }

  async function complete() {
    if (intervalMode === "MANUAL" && !manualValid) {
      setMessage(odometer === null ? "يجب تسجيل قراءة العداد الحالية قبل الحساب اليدوي." : "أدخل عدد كيلومترات صحيحًا أكبر من صفر، بحيث لا يتجاوز العداد القادم 3,000,000 كم.");
      return;
    }
    if (!confirm("تأكيد إقفال أمر الخدمة وإصدار الفاتورة وتسجيل الدفع؟")) return;
    setBusy(true);
    setMessage("");
    const idempotencyReference = crypto.randomUUID();
    const payload = {
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      nextServiceKm: intervalMode === "AUTO" && reminder.reason === "NO_OIL" && nextServiceKm ? Number(nextServiceKm) : undefined,
      manualServiceIntervalKm: intervalMode === "MANUAL" ? distance : undefined,
      idempotencyReference,
    };

    const response = await fetch(`/api/secure/service-orders/${orderId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      const errors: Record<string, string> = {
        PRICE_OUT_OF_RANGE: "سعر أحد البنود أو صافي البيع بعد الخصم خارج الحدود المعتمدة.",
        PRODUCT_INACTIVE: "أحد الأصناف غير نشط.",
        INVALID_SERVICE_INTERVAL: "أدخل مسافة تغيير الزيت عددًا صحيحًا أكبر من صفر.",
        SERVICE_ODOMETER_REQUIRED: "يجب تسجيل قراءة العداد الحالية قبل الحساب اليدوي.",
        NEXT_SERVICE_KM_INVALID: "كيلومترات الخدمة القادمة يجب أن تكون أكبر من قراءة العداد الحالية.",
        NEXT_SERVICE_DATE_INVALID: "تاريخ الخدمة القادمة غير صالح.",
        INSUFFICIENT_STOCK: "المخزون غير كافٍ لإقفال الأمر.",
        SHIFT_REQUIRED: "أمر الخدمة غير مرتبط بورديّة مفتوحة.",
        SERVICE_ORDER_EMPTY: "أضف بندًا واحدًا على الأقل قبل الإقفال.",
        INVALID_INPUT: "راجع بيانات الدفع والخدمة القادمة.",
        CREDIT_NOT_ALLOWED: "البيع الآجل غير مفعّل لهذا العميل.",
        CREDIT_LIMIT_EXCEEDED: "قيمة الفاتورة تتجاوز حد الائتمان المتاح للعميل.",
        FINANCIAL_ACCOUNT_REQUIRED: "لا يوجد حساب مالي مناسب لطريقة الدفع.",
      };
      setMessage(errors[result.error] || "تعذر إقفال أمر الخدمة.");
      return;
    }

    const coupon = result.invoice.coupons?.[0]?.serial;
    setMessage(
      coupon
        ? `تم إصدار الفاتورة ${result.invoice.invoiceNo} والكوبون ${coupon}`
        : `تم إصدار الفاتورة ${result.invoice.invoiceNo}`,
    );
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
              setSelectedProduct(product ?? null);
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
          <label>سعر الوحدة<input name="unitPrice" type="number" min={selectedProduct?.minPrice ?? 0} max={selectedProduct?.maxPrice ?? undefined} step="0.01" required /></label>
        </div>
        {selectedProduct?.minPrice != null && <p>نطاق سعر الوحدة قبل الضريبة: {selectedProduct.minPrice.toFixed(2)}–{selectedProduct.maxPrice?.toFixed(2)} ر.س. يشمل الحد الأدنى صافي البيع بعد الخصم.</p>}
        <label>الخصم<input name="discount" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <button type="submit" disabled={busy}>إضافة البند</button>
      </form>

      <hr className="divider" />

      <div className="intakeForm closingFields">
        <h3>الإقفال والدفع والخدمة القادمة</h3>
        <label className="paymentSelect">طريقة الدفع
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}>
            <option value="CASH">نقدًا</option>
            <option value="CARD">مدى / شبكة / بطاقة</option>
            <option value="TRANSFER">تحويل بنكي</option>
            <option value="CREDIT">آجل / ذمم عميل</option>
          </select>
        </label>

        {paymentMethod !== "CASH" && paymentMethod !== "CREDIT" && (
          <label>مرجع عملية الدفع
            <input
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              maxLength={120}
              placeholder={paymentMethod === "TRANSFER" ? "رقم الحوالة" : "مرجع عملية الشبكة"}
            />
          </label>
        )}

        <label>حساب عداد تغيير الزيت القادم
          <select value={intervalMode} onChange={event => setIntervalMode(event.target.value)}>
            <option value="AUTO">تلقائي حسب صنف الزيت</option>
            <option value="MANUAL">يدوي — إدخال عدد الكيلومترات</option>
          </select>
        </label>
        {intervalMode === "MANUAL" && <>
          <p>قراءة العداد الحالية: {odometer === null ? "غير مسجلة" : `${odometer.toLocaleString("en-US")} كم`}</p>
          <label>تغيير الزيت بعد (كم)
            <input type="number" min="1" max="3000000" step="1" value={manualInterval} onChange={event => setManualInterval(event.target.value)} placeholder="مثال: 7000" />
          </label>
          <p>تُضاف هذه المسافة إلى قراءة العداد الحالية لهذا الأمر فقط.</p>
        </>}
        <div className="formRow">
          <label>الخدمة القادمة عند عداد
            <input
              type="number"
              min="0"
              max="3000000"
              value={intervalMode === "MANUAL" ? manualNextKm : reminder.reason === "NO_OIL" ? nextServiceKm : reminder.nextKm ?? ""}
              readOnly={intervalMode === "MANUAL" || reminder.reason !== "NO_OIL"}
              onChange={(event) => setNextServiceKm(event.target.value)}
              placeholder={reminder.reason === "NO_OIL" ? "اختياري" : "حدد فترة صنف الزيت وقراءة العداد"}
            />
          </label>
          <label>تاريخ الخدمة القادمة
            <input value="" readOnly aria-label="تاريخ الخدمة القادمة — فارغ" />
          </label>
        </div>

        <p>يُحسب العداد القادم من القراءة الحالية + فترة الصنف تلقائيًا، أو المسافة المدخلة يدويًا. التاريخ القادم يُترك فارغًا.</p>
        {intervalMode === "AUTO" && reminder.reason === "CONFLICT" && <p role="alert">أصناف الزيت المختارة لها فترات مختلفة؛ راجع الأصناف قبل الإقفال.</p>}
        <button className="completeButton" type="button" disabled={busy} onClick={complete}>
          إقفال الخدمة وإصدار الفاتورة
        </button>
      </div>
      {message && <p className="formNotice">{message}</p>}
    </>
  );
}
