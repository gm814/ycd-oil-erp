"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PasswordInput } from "@/components/password-input";
import { PASSWORD_HINT, PASSWORD_PATTERN } from "@/lib/password-policy";

export default function RecoverPage() {
  const [kind, setKind] = useState("password");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setKind(new URLSearchParams(location.search).get("kind") === "username" ? "username" : "password");
    if (location.hash) { setToken(location.hash.slice(1)); history.replaceState(null, "", location.pathname); }
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    if (token && data.get("password") !== data.get("confirm")) { setMessage("كلمتا المرور غير متطابقتين."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/recovery", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(token ? { token, password: data.get("password") } : { kind, email: data.get("email") }) });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error === "INVALID_TOKEN" ? "الرابط منتهي أو مستخدم. اطلب رابطًا جديدًا." : "تعذر تنفيذ الاستعادة. تواصل مع مدير النظام للتحقق من إعداد الحساب والبريد."); return; }
      setMessage(token ? "تم تغيير كلمة المرور. يمكنك تسجيل الدخول بالكلمة الجديدة." : result.message);
      setDone(true);
    } catch { setMessage("تعذر الاتصال. تحقق من الشبكة ثم حاول مجددًا."); }
    finally { setBusy(false); }
  }
  return <main className="loginShell"><section className="loginCard">
    <img className="loginLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
    <h1>{token ? "تعيين كلمة مرور جديدة" : kind === "username" ? "نسيت اسم الدخول" : "نسيت كلمة المرور"}</h1>
    {!done && <form onSubmit={submit}>
      {token ? <><label>كلمة المرور الجديدة<PasswordInput name="password" autoComplete="new-password" pattern={PASSWORD_PATTERN} required /></label>
        <p>{PASSWORD_HINT}</p><label>تأكيد كلمة المرور<PasswordInput name="confirm" autoComplete="new-password" required /></label></>
        : <><p>أدخل البريد الإلكتروني المسجّل في حسابك.</p><label>البريد الإلكتروني<input name="email" type="email" autoComplete="email" required maxLength={200} /></label></>}
      <button disabled={busy}>{busy ? "جارٍ التنفيذ..." : token ? "حفظ كلمة المرور" : "إرسال طلب الاستعادة"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
    <p>إذا لم يكن لحسابك بريد مسجّل أو تعذر الوصول إليه، تواصل مع مدير النظام للتحقق من هويتك واستعادة الحساب.</p>
    <Link href="/">العودة إلى تسجيل الدخول</Link>
  </section></main>;
}
