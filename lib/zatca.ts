import qrcode from "qrcode-generator";

export type ZatcaPhase1QrInput = {
  sellerName: string;
  vatNumber: string;
  timestamp: Date;
  totalWithVat: number;
  vatTotal: number;
};

function tlv(tag: number, value: string) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > 255) throw new Error(`ZATCA_TLV_VALUE_TOO_LONG:${tag}`);
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

function amount(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("ZATCA_INVALID_AMOUNT");
  return value.toFixed(2);
}

export function buildZatcaPhase1QrPayload(input: ZatcaPhase1QrInput) {
  const fields = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, input.timestamp.toISOString()),
    tlv(4, amount(input.totalWithVat)),
    tlv(5, amount(input.vatTotal)),
  ];
  return Buffer.concat(fields).toString("base64");
}

export function buildZatcaPhase1QrSvg(payload: string) {
  const qr = qrcode(0, "M");
  qr.addData(payload, "Byte");
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
}

export function decodeZatcaTlvPayload(payload: string) {
  const data = Buffer.from(payload, "base64");
  const fields = new Map<number, string>();
  let offset = 0;
  while (offset < data.length) {
    const tag = data[offset];
    const length = data[offset + 1];
    if (tag === undefined || length === undefined || offset + 2 + length > data.length) {
      throw new Error("ZATCA_INVALID_TLV");
    }
    fields.set(tag, data.subarray(offset + 2, offset + 2 + length).toString("utf8"));
    offset += 2 + length;
  }
  return fields;
}
