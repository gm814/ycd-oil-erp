import { createHmac } from "node:crypto";
import type { RecoveryChannel } from "./provider";

export function recoveryHash(value: string) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET_MISSING");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`password-recovery:${value}`).digest("hex");
}

export function recoveryPhone(value?: string | null) {
  const phone = value?.trim().replace(/[\s()-]/g, "");
  if (!phone) return null;
  if (/^05\d{8}$/.test(phone)) return `+966${phone.slice(1)}`;
  if (/^9665\d{8}$/.test(phone)) return `+${phone}`;
  if (/^009665\d{8}$/.test(phone)) return `+${phone.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

type ContactUser = { email: string | null; recoveryWhatsApp: string | null; employee: { phone: string | null; active: boolean } | null };
export function recoveryDestination(user: ContactUser, channel: RecoveryChannel) {
  if (user.employee && !user.employee.active) return null;
  if (channel === "whatsapp") return recoveryPhone(user.recoveryWhatsApp);
  const email = user.email?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
