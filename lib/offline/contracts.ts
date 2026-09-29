import { z } from "zod";

const optionalNumber = (schema: z.ZodType) => z.preprocess(
  value => value === "" || value === null ? undefined : value, schema.optional(),
);

export const offlineOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20).or(z.literal("")),
  plate: z.string().trim().min(2).max(30),
  make: z.string().trim().max(60).default(""),
  model: z.string().trim().max(60).default(""),
  year: optionalNumber(z.coerce.number().int().min(1950).max(2100)),
  odometer: optionalNumber(z.coerce.number().int().min(0).max(2_000_000)),
  items: z.array(z.object({
    productId: z.string().min(1).max(100),
    quantity: z.number().positive().max(10000),
    unitPrice: z.number().min(0).max(10_000_000),
  })).max(100),
  complete: z.boolean(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "CREDIT"]),
  paymentReference: z.string().trim().max(120).default(""),
}).superRefine((value, ctx) => {
  if (value.complete && !value.items.length) ctx.addIssue({ code: "custom", message: "ORDER_EMPTY", path: ["items"] });
  if (value.complete && ["CARD", "TRANSFER"].includes(value.paymentMethod) && !value.paymentReference) {
    ctx.addIssue({ code: "custom", message: "PAYMENT_REFERENCE_REQUIRED", path: ["paymentReference"] });
  }
});

export const offlineCommandSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  userId: z.string().min(1).max(100),
  branchId: z.string().min(1).max(100),
  sessionVersion: z.number().int().min(0),
  shiftId: z.string().min(1).max(100),
  recordedAt: z.iso.datetime(),
  kind: z.literal("SERVICE_ORDER"),
  payload: offlineOrderSchema,
});

export type OfflineCommand = z.infer<typeof offlineCommandSchema>;

export const offlineErrorMessages: Record<string, string> = {
  SCOPE_CHANGED: "الحساب أو الفرع تغير. سجّل الدخول بالحساب الأصلي لمراجعة العملية.",
  SESSION_CHANGED: "تغيرت صلاحيات الجلسة؛ تحتاج العملية مراجعة قبل اعتمادها.",
  SHIFT_CHANGED: "الوردية الأصلية مغلقة أو غير موجودة. تحتاج العملية مراجعة.",
  FORBIDDEN: "الصلاحيات الحالية لا تسمح بتنفيذ العملية.",
  CUSTOMER_CONFLICT: "بيانات العميل تختلف عن البيانات المركزية؛ راجع العملية.",
  VEHICLE_CONFLICT: "السيارة مرتبطة بعميل آخر أو قراءة عداد أحدث؛ راجع العملية.",
  PRODUCT_CHANGED: "أحد الأصناف غير متاح أو تغير سعره؛ راجع العملية.",
  INSUFFICIENT_STOCK: "الرصيد المركزي لا يكفي؛ العملية محفوظة للمراجعة.",
  IDEMPOTENCY_CONFLICT: "تغير محتوى عملية أرسلت سابقًا؛ يلزم مراجعتها.",
  INVALID_INPUT: "راجع بيانات العملية المحفوظة.",
  CREDIT_NOT_ALLOWED: "البيع الآجل غير مفعّل لهذا العميل.",
  CREDIT_LIMIT_EXCEEDED: "تجاوزت العملية الحد الائتماني المتاح.",
  FINANCIAL_ACCOUNT_REQUIRED: "الحساب المالي المطلوب غير مهيأ.",
};
