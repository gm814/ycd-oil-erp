import type { Prisma } from "@prisma/client";
export function marketingPhone(phone: string | null) {
  const cleaned = (phone ?? "").replace(/[\s()-]/g, "");
  // International format is deliberate: do not guess a customer's country.
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}
export async function marketingRecipient(tx: Prisma.TransactionClient, branchId: string, customerId: string, channel: string) {
  const consent = await tx.marketingConsent.findUnique({ where: { branchId_customerId_channel: { branchId, customerId, channel } }, include: { customer: true } });
  if (!consent?.allowed || !marketingPhone(consent.customer.phone) || consent.phone !== marketingPhone(consent.customer.phone)) return null;
  return consent.customer;
}
export function marketingLink(channel: string, phone: string, message: string) {
  return channel === "WHATSAPP" ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}` : `sms:${phone}?body=${encodeURIComponent(message)}`;
}
