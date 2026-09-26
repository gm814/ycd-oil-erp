"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companies: { id: string; legalNameAr: string; relationType: string; bankAccountCount: number }[];
  accounts: { id: string; nameAr: string; type: string; balance: number }[];
};

export default function GroupFinanceActions({ companies, accounts }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function post(url: string, body: unknown, success: string) {
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
      const labels: Record<string, string> = {
        GROUP_COMPANY_CREATE_FAILED: "تعذر إضافة الشركة؛ تحقق من عدم تكرار الكود.",
        GROUP_COMPANY_NOT_FOUND: "شركة المجموعة غير موجودة.",
        GROUP_COMPANY_BANK_CREATE_FAILED: "تعذر تسجيل الحساب البنكي.",
        IBAN_ALREADY_REGISTERED: "رقم الآيبان مسجل مسبقًا لشركة أخرى.",
        FINANCIAL_ACCOUNT_NOT_FOUND: "الحساب المالي غير موجود.",
        IDEMPOTENCY_CONFLICT: "مرجع العملية مستخدم سابقًا.",
        FORBIDDEN: "لا تملك صلاحية تسجيل تمويل المجموعة.",
      };
      setMessage(labels[result.error] || "تعذر تنفيذ العملية.");
      return false;
    }
    setMessage(success);
    router.refresh();
    return true;
  }

  function addCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void post("/api/secure/finance/group-companies", Object.fromEntries(new FormData(form).entries()), "تمت إضافة شركة المجموعة.")
      .then((ok) => { if (ok) form.reset(); });
  }

  function addBankAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const companyId = String(data.companyId || "");
    if (!companyId) return;
    const { companyId: _companyId, ...body } = data;
    void post(`/api/secure/finance/group-companies/${companyId}/bank-accounts`, body, "تم تسجيل الحساب البنكي للشركة وحفظ بيانات الآيبان.")
      .then((ok) => { if (ok) form.reset(); });
  }

  function addFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    void post("/api/secure/finance/group-funding", {
      ...data,
      idempotencyReference: crypto.randomUUID(),
    }, "تم تسجيل التمويل وإضافته إلى رصيد الحساب المستلم.")
      .then((ok) => { if (ok) form.reset(); });
  }

  return (
    <>
      <section className="workGrid">
        <article className="panel">
          <h2>إضافة شركة للمجموعة</h2>
          <form className="intakeForm" onSubmit={addCompany}>
            <div className="formRow">
              <label>كود داخلي<input name="code" required placeholder="مثال: GROUP-002" /></label>
              <label>نوع العلاقة
                <select name="relationType" defaultValue="AFFILIATE">
                  <option value="PARENT">الشركة الرئيسية</option>
                  <option value="SUBSIDIARY">شركة تابعة</option>
                  <option value="AFFILIATE">شركة شقيقة / مرتبطة</option>
                </select>
              </label>
            </div>
            <label>الاسم القانوني بالعربي<input name="legalNameAr" required /></label>
            <label>الاسم التجاري<input name="brandName" /></label>
            <div className="formRow">
              <label>الرقم الوطني الموحد<input name="unifiedNumber" /></label>
              <label>السجل التجاري<input name="crNumber" /></label>
            </div>
            <label>الرقم الضريبي<input name="vatNumber" /></label>
            <button disabled={busy}>حفظ شركة المجموعة</button>
          </form>
        </article>

        <article className="panel">
          <h2>تسجيل تمويل وارد للمشروع</h2>
          <form className="intakeForm" onSubmit={addFunding}>
            <label>الشركة الممولة
              <select name="sourceCompanyId" required defaultValue="">
                <option value="" disabled>اختر مصدر التمويل</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.legalNameAr}</option>)}
              </select>
            </label>
            <label>الحساب المستلم
              <select name="accountId" required defaultValue="">
                <option value="" disabled>اختر الحساب</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.nameAr} — رصيد {account.balance.toFixed(2)} ر.س</option>)}
              </select>
            </label>
            <div className="formRow">
              <label>المبلغ<input name="amount" type="number" min="0.01" step="0.01" required /></label>
              <label>مرجع التحويل<input name="reference" /></label>
            </div>
            <label>ملاحظات<input name="notes" placeholder="سبب التمويل أو الغرض منه" /></label>
            <button disabled={busy || companies.length === 0 || accounts.length === 0}>تسجيل التمويل</button>
          </form>
        </article>
      </section>
      <section className="workGrid">
        <article className="panel">
          <h2>تسجيل حساب بنكي لشركة المجموعة</h2>
          <p className="muted">مخصص لشهادات الآيبان التي سيتم تزويد النظام بها للشركة الرئيسية وباقي شركات المجموعة.</p>
          <form className="intakeForm" onSubmit={addBankAccount}>
            <label>الشركة
              <select name="companyId" required defaultValue="">
                <option value="" disabled>اختر الشركة</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.legalNameAr} · {company.bankAccountCount} حساب</option>
                ))}
              </select>
            </label>
            <div className="formRow">
              <label>اسم البنك<input name="bankName" required placeholder="مثال: مصرف الراجحي" /></label>
              <label>اسم الحساب<input name="accountNameAr" placeholder="اسم الشركة كما يظهر في البنك" /></label>
            </div>
            <div className="formRow">
              <label>رقم الحساب<input name="accountNumber" dir="ltr" /></label>
              <label>IBAN<input name="iban" dir="ltr" placeholder="SA..." /></label>
            </div>
            <div className="formRow">
              <label>العملة<input name="currency" defaultValue="SAR" maxLength={3} required /></label>
              <label>ملاحظات<input name="notes" /></label>
            </div>
            <button disabled={busy || companies.length === 0}>حفظ الحساب البنكي</button>
          </form>
        </article>

        <article className="panel">
          <h2>استكمال بيانات المجموعة</h2>
          <p>يمكن تسجيل كل شركة الآن، ثم إضافة السجل التجاري والرقم الموحد والرقم الضريبي، وبعد وصول شهادة الآيبان يضاف الحساب البنكي بدون خلطه بحسابات YCD OIL التشغيلية.</p>
          <p className="formNotice">الحسابات البنكية لشركات المجموعة تستخدم كبيانات مرجعية لمصدر التمويل، بينما قيد التمويل نفسه يدخل فقط إلى حساب YCD OIL المستلم.</p>
        </article>
      </section>

      {message && <p className="formNotice globalNotice">{message}</p>}
    </>
  );
}
