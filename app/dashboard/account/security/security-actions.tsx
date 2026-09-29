"use client";

import { useState } from "react";

export default function SecurityActions() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function revokeSessions() {
    if (!window.confirm("سيتم إنهاء جميع جلسات الدخول الأخرى لحسابك، مع إبقاء هذه الجلسة الحالية فعالة. هل تريد المتابعة؟")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/secure/account/revoke-sessions", { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      setMessage("تعذر إنهاء الجلسات الأخرى.");
      return;
    }
    setMessage("تم إنهاء جميع الجلسات الأخرى وإصدار جلسة جديدة وآمنة لهذا الجهاز.");
  }

  return (
    <article className="panel">
      <h2>إدارة الجلسات</h2>
      <p>استخدم هذا الإجراء إذا دخلت من جهاز آخر أو فقدت جهازًا أو أردت إبطال أي جلسة قديمة فورًا.</p>
      <button type="button" disabled={busy} onClick={revokeSessions}>
        {busy ? "جارٍ التنفيذ..." : "إنهاء جميع الجلسات الأخرى"}
      </button>
      {message && <p className="formNotice">{message}</p>}
    </article>
  );
}
