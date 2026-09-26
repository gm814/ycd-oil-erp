export const companyConfig = {
  legalNameAr: "شركة وجهتك الإبداعية لزيوت وخدمات السيارات",
  brand: "YCD OIL",
  branch: "الرياض - حي طويق",
  phone: "0535898340",
  email: "info@ycdoil.sa",
  website: "www.ycdoil.sa",
  unifiedNumber: "7038822883",
  crNumber: "1009014238",
  vatNumber: "311380910800003",
  vatRate: Number(process.env.VAT_RATE ?? "0.15"),
  washCouponValidityDays: Number(process.env.WASH_COUPON_VALIDITY_DAYS ?? "30"),
} as const;

export const brandColors = {
  orange: "#F18F21",
  gold: "#F7A81D",
  gray: "#939497",
  lightGray: "#BDBDBF",
  black: "#111111",
  white: "#FFFFFF",
} as const;
