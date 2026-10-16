"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { lockOfflineProfile } from "@/lib/offline/lock";
import { PasswordInput } from "@/components/password-input";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    // React clears currentTarget after the synchronous submit handler returns.
    const form = new FormData(event.currentTarget);
    setError("");
    setLoading(true);
    try {
    await lockOfflineProfile();

    const response = await fetch("/api/auth/login", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: form.get("identifier"),
        password: form.get("password"),
      }),
    });

    setLoading(false);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(response.status >= 500 ? "خدمة الدخول غير جاهزة حاليًا. تواصل مع مدير النظام لاستكمال إعداد قاعدة البيانات." : "تعذر تسجيل الدخول. تحقق من اسم المستخدم أو البريد وكلمة المرور.");
      return;
    }

    await lockOfflineProfile(false);
    router.replace(result.mustChangePassword ? "/change-password" : "/dashboard");
    router.refresh();
    } catch { setError("تعذر الاتصال. أعد المحاولة عند توفر الشبكة."); }
    finally { setLoading(false); }
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <img className="loginLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
        <p className="loginSubtitle">نظام الإدارة والتشغيل ERP & Operations</p>
        <h1>تسجيل الدخول</h1>
        <form onSubmit={submit}>
          <label>
            اسم المستخدم أو البريد الإلكتروني
            <input name="identifier" type="text" autoComplete="username" required placeholder="مثال: YCD-005" />
          </label>
          <label>
            كلمة المرور
            <PasswordInput name="password" autoComplete="current-password" required />
          </label>
          <Link href="/forgot-password" className="passwordRecoveryLink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <circle cx="8" cy="8" r="5" />
              <path d="m12 12 9 9m-4-4 3-3m-6 0 3-3" />
            </svg>
            نسيت كلمة المرور؟
          </Link>
          {error && <p className="formError">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "جارٍ التحقق..." : "دخول النظام"}
          </button>
        </form>
        <p><Link href="/recover?kind=password">نسيت كلمة المرور؟</Link></p>
        <p><Link href="/recover?kind=username">نسيت اسم الدخول؟</Link></p>
        <small>شركة وجهتك الإبداعية لزيوت وخدمات السيارات</small>
      </section>
    </main>
  );
}
