import { buildZatcaPhase1QrPayload, buildZatcaPhase1QrSvg, decodeZatcaTlvPayload } from "../lib/zatca";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ZATCA_QR_VERIFY_FAILED: ${message}`);
}

function main() {
  const timestamp = new Date("2026-09-28T00:00:00.000Z");
  const payload = buildZatcaPhase1QrPayload({
    sellerName: "شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
    vatNumber: "311380910800003",
    timestamp,
    totalWithVat: 115,
    vatTotal: 15,
  });

  const fields = decodeZatcaTlvPayload(payload);
  assert(fields.get(1) === "شركة وجهتك الإبداعية لزيوت وخدمات السيارات", "اسم البائع غير مطابق");
  assert(fields.get(2) === "311380910800003", "الرقم الضريبي غير مطابق");
  assert(fields.get(3) === timestamp.toISOString(), "وقت الفاتورة غير مطابق");
  assert(fields.get(4) === "115.00", "إجمالي الفاتورة غير مطابق");
  assert(fields.get(5) === "15.00", "إجمالي الضريبة غير مطابق");

  const svg = buildZatcaPhase1QrSvg(payload);
  assert(svg.includes("<svg"), "لم يتم توليد SVG للـ QR");
  assert(svg.length > 500, "SVG الناتج أقصر من المتوقع");

  console.log("YCD ZATCA PHASE-1 QR VERIFIED");
  console.log("TLV tags 1-5: verified");
  console.log("QR SVG generation: verified");
}

main();
