"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    setLoading(false);
    if (!response.ok) {
      setError("تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginBrand">YCD <span>OIL</span></div>
        <p className="loginSubtitle">نظام الإدارة والتشغيل ERP & Operations</p>
        <h1>تسجيل الدخول</h1>
        <form onSubmit={submit}>
          <label>
            البريد الإلكتروني
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            كلمة المرور
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="formError">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "جارٍ التحقق..." : "دخول النظام"}
          </button>
        </form>
        <small>شركة وجهتك الإبداعية لزيوت وخدمات السيارات</small>
      </section>
    </main>
  );
}
