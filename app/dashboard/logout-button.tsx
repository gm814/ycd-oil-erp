"use client";

import { lockOfflineProfile } from "@/lib/offline/lock";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await lockOfflineProfile();
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      router.replace("/"); router.refresh();
    } catch { setError("تم قفل الوصول المحلي إن أمكن. أعد الاتصال لإكمال تسجيل الخروج."); }
    finally { setBusy(false); }
  }

  return <><button className="logout" disabled={busy} onClick={logout}>{busy ? "جارٍ الخروج…" : "تسجيل الخروج"}</button>{error && <p role="alert">{error}</p>}</>;
}
