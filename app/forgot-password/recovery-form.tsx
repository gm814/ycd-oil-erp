"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { PASSWORD_PATTERN, PASSWORD_HINT } from "@/lib/password-policy";
import type { RecoveryChannel } from "@/lib/password-recovery/provider";
import { lockOfflineProfile } from "@/lib/offline/lock";

export default function RecoveryForm({ channels }: { channels: RecoveryChannel[] }) {
  const [channel, setChannel] = useState<RecoveryChannel>(channels[0] ?? "email");
  const [challenge, setChallenge] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (challenge || complete) heading.current?.focus(); }, [challenge, complete]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    if (challenge && form.get("newPassword") !== form.get("confirmPassword")) { setError("كلمتا المرور غير متطابقتين."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auth/recovery/${challenge ? "complete" : "request"}`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify(challenge ? {
          challenge, code: form.get("code"), newPassword: form.get("newPassword"), confirmPassword: form.get("confirmPassword"),
        } : { identifier: form.get("identifier"), channel }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error === "RECOVERY_UNAVAILABLE" ? "خدمة الاستعادة غير متاحة حاليًا. تواصل مع مسؤول النظام." : challenge ? "الرمز غير صحيح أو انتهت صلاحيته. تحقق منه أو اطلب رمزًا آخر." : "تعذر تقديم الطلب. تحقق من البيانات وحاول مجددًا.");
        return;
      }
      if (challenge) {
        // The password is already changed; local cache failure must not report reset failure.
        await lockOfflineProfile().catch(() => undefined);
        setComplete(true); setChallenge(""); setNotice("");
      } else {
        setChallenge(result.challenge); setNotice(result.message); setCooldown(60);
      }
    } catch { setError(challenge ? "تعذر تأكيد النتيجة بسبب الاتصال. جرّب تسجيل الدخول بكلمة المرور الجديدة قبل إعادة الطلب." : "تعذر الاتصال. تحقق من الشبكة ثم أعد المحاولة."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  if (complete) return <>
    <h2 ref={heading} tabIndex={-1}>تم تعيين كلمة المرور الجديدة</h2>
    <p role="status" className="recoveryNotice">تم إنهاء جلسات الدخول السابقة. سجّل الدخول بكلمة المرور الجديدة.</p>
    <Link href="/" className="passwordRecoveryLink">العودة لتسجيل الدخول</Link>
  </>;

  return <>
    {!channels.length && <p role="status" className="recoveryNotice">الاستعادة بالبريد وواتساب غير مفعّلة حاليًا. تواصل مع مسؤول النظام لإعادة تعيين كلمة المرور.</p>}
    {notice && <p role="status" className="recoveryNotice">{notice}</p>}
    <form onSubmit={submit}>
      {!challenge ? <>
        <label>اسم المستخدم أو البريد الإلكتروني<input name="identifier" type="text" autoComplete="username" required minLength={2} maxLength={200} placeholder="مثال: YCD-005" disabled={busy || !channels.length} /></label>
        <fieldset className="recoveryChannels" disabled={busy || !channels.length}>
          <legend>اختر وسيلة الاستعادة</legend>
          <label><input type="radio" name="channel" value="email" checked={channel === "email"} onChange={() => setChannel("email")} disabled={!channels.includes("email")} />البريد الإلكتروني{!channels.includes("email") && " — غير مفعّل"}</label>
          <label><input type="radio" name="channel" value="whatsapp" checked={channel === "whatsapp"} onChange={() => setChannel("whatsapp")} disabled={!channels.includes("whatsapp")} />واتساب{!channels.includes("whatsapp") && " — غير مفعّل"}</label>
        </fieldset>
        <small className="recoveryHint">يصلك الرمز على البريد أو رقم الواتساب المسجل لحسابك، حسب اختيارك.</small>
      </> : <>
        <h2 ref={heading} tabIndex={-1}>التحقق وتعيين كلمة المرور</h2>
        <small className="recoveryHint">أدخل الرمز المرسل عبر {channel === "email" ? "البريد الإلكتروني" : "واتساب"}. صلاحيته 10 دقائق، وبحد أقصى 5 محاولات.</small>
        <label>رمز التحقق<input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,10}" minLength={4} maxLength={10} dir="ltr" required disabled={busy} /></label>
        <label>كلمة المرور الجديدة<PasswordInput name="newPassword" autoComplete="new-password" pattern={PASSWORD_PATTERN} required disabled={busy} /></label>
        <small className="recoveryHint">{PASSWORD_HINT}</small>
        <label>تأكيد كلمة المرور<PasswordInput name="confirmPassword" autoComplete="new-password" pattern={PASSWORD_PATTERN} required disabled={busy} /></label>
      </>}
      {error && <p role="alert" className="formError">{error}</p>}
      <button type="submit" disabled={busy || !channels.length}>{busy ? "جارٍ التحقق..." : challenge ? "حفظ كلمة المرور الجديدة" : "إرسال رمز التحقق"}</button>
    </form>
    <div className="recoveryLinks">
      {challenge && <button type="button" disabled={busy || cooldown > 0} onClick={() => { setChallenge(""); setNotice(""); setError(""); }}>{cooldown ? `طلب رمز آخر بعد ${cooldown} ثانية` : "طلب رمز آخر أو تغيير الوسيلة"}</button>}
      <Link href="/">العودة لتسجيل الدخول</Link>
    </div>
    <small>إذا لم يصلك الرمز، تحقق من البريد غير المرغوب أو تواصل مع مسؤول النظام لتحديث وسيلة الاتصال بعد التحقق من هويتك.</small>
  </>;
}
