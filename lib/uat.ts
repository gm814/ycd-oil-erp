export const UAT_CASES = [
  { code: "SHIFT_OPEN", areaAr: "الورديات", titleAr: "فتح وردية بواسطة مستخدم مخول" },
  { code: "SERVICE_INTAKE", areaAr: "الخدمة", titleAr: "استقبال سيارة وربط العميل والمركبة" },
  { code: "SERVICE_ITEMS_STOCK", areaAr: "الخدمة والمخزون", titleAr: "إضافة زيت/فلتر/خدمة والتحقق من المخزون" },
  { code: "SALE_CASH", areaAr: "المبيعات", titleAr: "إكمال بيع نقدي وترحيله ماليًا" },
  { code: "SALE_CARD", areaAr: "المبيعات", titleAr: "إكمال بيع مدى/بطاقة وترحيله إلى حساب التسويات" },
  { code: "SALE_TRANSFER", areaAr: "المبيعات", titleAr: "إكمال بيع بتحويل بنكي وترحيله للحساب البنكي" },
  { code: "TAX_INVOICE", areaAr: "الفوترة", titleAr: "إصدار وطباعة الفاتورة الضريبية" },
  { code: "VEHICLE_HISTORY", areaAr: "العملاء", titleAr: "التحقق من سجل المركبة وموعد الخدمة القادمة" },
  { code: "WASH_COUPON", areaAr: "الكوبونات", titleAr: "إصدار واستخدام كوبون الغسيل مرة واحدة فقط" },
  { code: "CREDIT_COLLECTION", areaAr: "الذمم", titleAr: "بيع آجل ثم تحصيل جزئي وكامل" },
  { code: "SALES_RETURN", areaAr: "المرتجعات", titleAr: "مرتجع/استرداد مع الأثر المالي والمخزني" },
  { code: "PROCUREMENT_CYCLE", areaAr: "المشتريات", titleAr: "طلب شراء واعتماد وأمر واستلام وفاتورة مورد وسداد" },
  { code: "EXPENSE_CYCLE", areaAr: "المالية", titleAr: "طلب مصروف ثم اعتماد مستقل ثم صرف" },
  { code: "CUSTODY_CYCLE", areaAr: "العهد", titleAr: "طلب عهدة واعتماد وصرف وتسوية وإقفال" },
  { code: "PAYROLL_CYCLE", areaAr: "الموارد البشرية", titleAr: "إعداد راتب ثم اعتماد ثم صرف" },
  { code: "SHIFT_CLOSE_VARIANCE", areaAr: "الورديات", titleAr: "إقفال وردية ومراجعة فروقات النقد ومدى والتحويل" },
  { code: "BANK_RECONCILIATION", areaAr: "البنوك", titleAr: "مطابقة بنك ومراجعتها وإقفالها بدون فرق" },
  { code: "FINANCIAL_CLOSE", areaAr: "الإقفال المالي", titleAr: "إعداد الإقفال اليومي والشهري ومراجعته" },
  { code: "AUDIT_LOG", areaAr: "الرقابة", titleAr: "التحقق من سجل التدقيق لكل عملية حساسة" },
] as const;

export type UatCaseCode = typeof UAT_CASES[number]["code"];

export function isUatCaseCode(value: string): value is UatCaseCode {
  return UAT_CASES.some((item) => item.code === value);
}
