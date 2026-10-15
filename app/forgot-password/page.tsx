import type { Metadata } from "next";
import { recoveryChannels } from "@/lib/password-recovery/provider";
import RecoveryForm from "./recovery-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "استعادة كلمة المرور | YCD OIL", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ForgotPasswordPage() {
  return <main className="loginShell"><section className="loginCard">
    <img className="loginLogo" src="/brand/ycd-logo-source.svg" alt="YCD OIL" />
    <h1>استعادة كلمة المرور</h1>
    <RecoveryForm channels={recoveryChannels()} />
  </section></main>;
}
