export const CUSTOMER_PHONE_ERROR = "رقم الجوال يجب أن يتكون من 10 أرقام بالضبط.";

export function normalizeCustomerPhone(value: string): string {
  return value.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
}

export function isCustomerPhone(value: string): boolean {
  return /^[0-9]{10}$/.test(normalizeCustomerPhone(value));
}
