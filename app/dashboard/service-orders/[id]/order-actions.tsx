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

// Text inputs preserve a trailing decimal separator while typing in Arabic browsers.
function normalizeDecimal(value: string) {
  return value.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٫،,]/g, ".");
}

type PaymentMethod = "CASH" | "CARD" | "TRANSFER" | "CREDIT";

export default function OrderActions({
  orderId,
  subtotal,
  vatRate,
  odometer,
  locked,
  products,
  reminder,
}: {
  reminder: { nextKm: number | null; reason: string };
  orderId: string;
  subtotal: number;
  vatRate: number;
  odometer: number | null;
  locked: boolean;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [priceIncludesVat, setPriceIncludesVat] = useState(false);
  const [amountPaid, setAmountPaid] = useState("");
  const vatAmount = Math.round((subtotal * vatRate + Number.EPSILON) * 100) / 100;
  const invoiceTotal = Math.round((subtotal + vatAmount + Number.EPSILON) * 100) / 100;

  const [productSearch, setProductSearch] = useState("");
  const normalizeSearch = (value: string) => value.normalize("NFKC").toLowerCase()
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[\u064B-\u065F\u0640]/g, "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  const searchWords = normalizeSearch(productSearch).trim().split(/\s+/).filter(Boolean);
  const filteredProducts = products.filter(product => searchWords.every(word => normalizeSearch(`${product.sku} ${product.nameAr}`).includes(word)));
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [odometerInput, setOdometerInput] = useState(String(odometer ?? ""));
  const odometerChanged = odometerInput !== String(odometer ?? "");
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

  function selectProduct(product: ProductOption | null, form: HTMLFormElement | null) {
    setSelectedProduct(product);
    const description = form?.elements.namedItem("descriptionAr") as HTMLInputElement | null;
    const price = form?.elements.namedItem("unitPrice") as HTMLInputElement | null;
    if (description) description.value = product?.nameAr ?? "";
    if (price) price.value = product ? (product.salePrice * (priceIncludesVat ? 1 + vatRate : 1)).toFixed(2) : "";
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (productSearch.trim() && !selectedProduct) { setMessage("اختر الصنف من نتائج البحث أولًا."); return; }
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement).entries());
    for (const field of ["unitPrice", "discount"]) {
      const value = normalizeDecimal(String(payload[field] ?? "")).trim();
      if (!/^(?:[0-9]+(?:\.[0-9]{0,2})?|\.[0-9]{1,2})$/.test(value) || !Number.isFinite(Number(value))) {
        setMessage("أدخل السعر والخصم كأرقام صحيحة أو عشرية، مثل 29.75.");
        return;
      }
      payload[field] = value;
    }
    payload.priceIncludesVat = priceIncludesVat ? "true" : "false";
    setBusy(true);
    setMessage("");

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
    setProductSearch("");
    setMessage("تمت إضافة البند.");
    router.refresh();
  }

  async function saveOdometer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = normalizeDecimal(odometerInput).trim();
    if (!/^[0-9]+$/.test(value) || Number(value) > 2_000_000) {
      setMessage("أدخل قراءة عداد صحيحة من 0 إلى 2,000,000 كم.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/secure/service-orders/${orderId}/odometer`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ odometer: Number(value) }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error === "ODOMETER_DECREASE" ? "القراءة أقل من قراءة زيارة مكتملة سابقة؛ راجع العداد." : result.error === "ORDER_LOCKED" ? "أمر الخدمة مقفل ولا يمكن تعديل العداد." : "تعذر حفظ القراءة؛ راجع الصلاحيات وأعد المحاولة.");
        return;
      }
      setOdometerInput(String(result.odometer));
      setMessage("تم حفظ قراءة العداد. يُحدّث العداد القادم حسب أصناف الزيت المضافة.");
      router.refresh();
    } catch {
      setMessage("تعذر الاتصال لحفظ العداد؛ أعد المحاولة.");
    } finally { setBusy(false); }
  }

  async function complete() {
    if (odometerChanged) { setMessage("احفظ قراءة العداد الحالية قبل إقفال الخدمة."); return; }
    if (intervalMode === "MANUAL" && !manualValid) {
      setMessage(odometer === null ? "يجب تسجيل قراءة العداد الحالية قبل الحساب اليدوي." : "أدخل عدد كيلومترات صحيحًا أكبر من صفر، بحيث لا يتجاوز العداد القادم 3,000,000 كم.");
      return;
    }
    const paid = normalizeDecimal(amountPaid).trim();
    if (paymentMethod !== "CREDIT" && (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(paid) || Math.round(Number(paid) * 100) !== Math.round(invoiceTotal * 100))) {
      setMessage(`المبلغ المدفوع يجب أن يطابق إجمالي الفاتورة ${invoiceTotal.toFixed(2)} ريال. راجع أسعار البنود قبل الإقفال.`);
      return;
    }
    if (!confirm(`إجمالي الفاتورة شامل الضريبة: ${invoiceTotal.toFixed(2)} ريال. تأكيد الإقفال وإصدار الفاتورة؟`)) return;
    setBusy(true);
    setMessage("");
    const idempotencyReference = crypto.randomUUID();
    const payload = {
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      amountPaid: paymentMethod === "CREDIT" ? undefined : Number(paid),
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
        PAYMENT_AMOUNT_MISMATCH: "المبلغ المدفوع لا يطابق إجمالي الفاتورة الحالي؛ راجع البنود والمبلغ.",
        PAYMENT_AMOUNT_REQUIRED: "أدخل مبلغ السداد الفعلي قبل الإقفال.",
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
        <label>بحث عن صنف بالاسم أو الكود
          <input type="search" value={productSearch} placeholder="مثال: فلتر رينو أو 8200033408 أو فوكس" autoComplete="off"
            onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
            onChange={event => {
              const query = event.target.value;
              setProductSearch(query);
              const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
              const matches = words.length ? products.filter(product => words.every(word => normalizeSearch(`${product.sku} ${product.nameAr}`).includes(word))) : [];
              const exact = matches.find(product => normalizeSearch(product.sku) === normalizeSearch(query).trim());
              selectProduct(exact ?? (matches.length === 1 ? matches[0] : null), event.currentTarget.form);
            }} />
        </label>
        {productSearch.trim() ? <>
          <input type="hidden" name="productId" value={selectedProduct?.id ?? ""} />
          <p role="status">{selectedProduct ? `تم اختيار: ${selectedProduct.nameAr}` : filteredProducts.length ? `نتائج البحث: ${filteredProducts.length} — اضغط على الصنف المطلوب.` : "لا توجد أصناف مطابقة؛ جرّب جزءًا من الاسم أو الكود."}</p>
          {filteredProducts.length > 0 && <div aria-label="نتائج بحث الأصناف" style={{ maxHeight: 280, overflowY: "auto", display: "grid", gap: 8 }}>
            {filteredProducts.map(product => <button
              key={product.id}
              type="button"
              aria-pressed={selectedProduct?.id === product.id}
              onClick={event => selectProduct(product, event.currentTarget.form)}
              style={{ textAlign: "right", background: selectedProduct?.id === product.id ? "#fff2cc" : "#fff", color: "#252525", border: selectedProduct?.id === product.id ? "2px solid #d99816" : "1px solid #ddd", padding: "12px 16px" }}
            >
              <strong dir="ltr">{product.sku}</strong> — {product.nameAr}
            </button>)}
          </div>}
        </> : <label>الصنف / الخدمة
          <select
            name="productId"
            value={selectedProduct?.id ?? ""}
            onChange={event => selectProduct(products.find(product => product.id === event.target.value) ?? null, event.currentTarget.form)}
          >
            <option value="">بند يدوي بدون مخزون</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.sku} — {product.nameAr}</option>)}
          </select>
        </label>}
        <label>وصف الخدمة / المادة<input name="descriptionAr" required /></label>
        <label>طريقة إدخال السعر والخصم
          <select value={priceIncludesVat ? "INCLUSIVE" : "EXCLUSIVE"} onChange={event => {
            const inclusive = event.target.value === "INCLUSIVE";
            const form = event.currentTarget.form;
            for (const name of ["unitPrice", "discount"]) {
              const input = form?.elements.namedItem(name) as HTMLInputElement | null;
              if (input && input.value.trim() && Number.isFinite(Number(normalizeDecimal(input.value)))) {
                const value = Number(normalizeDecimal(input.value));
                input.value = (inclusive ? value * (1 + vatRate) : value / (1 + vatRate)).toFixed(2);
              }
            }
            setPriceIncludesVat(inclusive);
          }}>
            <option value="EXCLUSIVE">قبل الضريبة</option>
            <option value="INCLUSIVE">شامل الضريبة</option>
          </select>
        </label>
        {priceIncludesVat && <p>يحوّل النظام سعر الوحدة والخصم إلى ما قبل الضريبة ويقرّبهما لأقرب هللة. راجع الإجمالي النهائي بعد إضافة البند.</p>}
        <div className="formRow">
          <label>الكمية<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label>
          <label>{priceIncludesVat ? "سعر الوحدة شامل الضريبة" : "سعر الوحدة قبل الضريبة"}<input name="unitPrice" type="text" inputMode="decimal" dir="ltr" autoComplete="off" placeholder="29.75" onChange={event => { event.currentTarget.value = normalizeDecimal(event.currentTarget.value); }} required /></label>
        </div>
        {selectedProduct?.minPrice != null && <p>نطاق سعر الوحدة قبل الضريبة: {selectedProduct.minPrice.toFixed(2)}–{selectedProduct.maxPrice?.toFixed(2)} ر.س. يشمل الحد الأدنى صافي البيع بعد الخصم.</p>}
        <label>الخصم<input name="discount" type="text" inputMode="decimal" dir="ltr" autoComplete="off" onChange={event => { event.currentTarget.value = normalizeDecimal(event.currentTarget.value); }} defaultValue="0" required /></label>
        <button type="submit" disabled={busy || Boolean(productSearch.trim() && !selectedProduct)}>إضافة البند</button>
      </form>

      <hr className="divider" />

      <form className="intakeForm" onSubmit={saveOdometer}>
        <label>قراءة العداد الحالية (كم)
          <input type="text" inputMode="numeric" dir="ltr" value={odometerInput}
            onChange={event => setOdometerInput(normalizeDecimal(event.target.value))}
            required placeholder="مثال: 160000" />
        </label>
        <button type="submit" disabled={busy || !odometerChanged}>حفظ قراءة العداد</button>
        {odometerChanged && <p>القراءة لم تُحفظ بعد. احفظها لتحديث العداد القادم.</p>}
      </form>

      <div className="intakeForm closingFields">
        <h3>الإقفال والدفع والخدمة القادمة</h3>
        <div role="status">
          <p>الإجمالي قبل الضريبة: <b>{subtotal.toFixed(2)} ر.س</b></p>
          <p>الضريبة ({(vatRate * 100).toFixed(0)}%): <b>{vatAmount.toFixed(2)} ر.س</b></p>
          <p>الإجمالي شامل الضريبة: <b>{invoiceTotal.toFixed(2)} ر.س</b></p>
        </div>
        {paymentMethod !== "CREDIT" && <label>المبلغ المدفوع فعليًا — شامل الضريبة
          <input type="text" inputMode="decimal" dir="ltr" value={amountPaid} placeholder="أدخل المبلغ من إيصال الدفع"
            onChange={event => setAmountPaid(normalizeDecimal(event.target.value))} />
        </label>}
        {paymentMethod !== "CREDIT" && amountPaid && Number.isFinite(Number(amountPaid)) && Math.round(Number(amountPaid) * 100) !== Math.round(invoiceTotal * 100) &&
          <p role="alert">فرق السداد: {(Number(amountPaid) - invoiceTotal).toFixed(2)} ر.س. يجب تصحيح الأسعار أو مبلغ السداد قبل الإقفال.</p>}
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
