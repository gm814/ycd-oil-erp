"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { PASSWORD_PATTERN, PASSWORD_HINT } from "@/lib/password-policy";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) {
      setMessage("كلمتا المرور الجديدتان غير متطابقتين.");
      return;
    }

    setBusy(true);
    setMessage("");
    const response = await fetch("/api/secure/account/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: form.get("currentPassword"),
        newPassword,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(
        result.error === "CURRENT_PASSWORD_INVALID"
          ? "كلمة المرور الحالية غير صحيحة."
          : `تعذر تغيير كلمة المرور. ${PASSWORD_HINT}`,
      );
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <img className="loginLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
        <p className="loginSubtitle">تأمين حساب الموظف</p>
        <h1>تغيير كلمة المرور المؤقتة</h1>
        <p>قبل دخول النظام لأول مرة، أنشئ كلمة مرور خاصة بك: {PASSWORD_HINT}</p>
        <form onSubmit={submit}>
          <label>كلمة المرور الحالية
            <PasswordInput name="currentPassword" autoComplete="current-password" minLength={8} required />
          </label>
          <label>كلمة المرور الجديدة
            <PasswordInput name="newPassword" autoComplete="new-password" minLength={8} maxLength={8} pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} required />
          </label>
          <label>تأكيد كلمة المرور الجديدة
            <PasswordInput name="confirmPassword" autoComplete="new-password" minLength={8} maxLength={8} pattern={PASSWORD_PATTERN} title={PASSWORD_HINT} required />
          </label>
          {message && <p className="formError">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ والدخول للنظام"}</button>
        </form>
      </section>
    </main>
  );
}
