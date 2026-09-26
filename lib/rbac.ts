export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  SERVICE_ORDER_CREATE: "service_order.create",
  SERVICE_ORDER_APPROVE: "service_order.approve",
  INVENTORY_MANAGE: "inventory.manage",
  INVENTORY_ISSUE: "inventory.issue",
  INVOICE_ISSUE: "invoice.issue",
  PAYMENT_RECEIVE: "payment.receive",
  SHIFT_OPEN: "shift.open",
  SHIFT_CLOSE: "shift.close",
  COUPON_REDEEM: "coupon.redeem",
  PROCUREMENT_REQUEST: "procurement.request",
  PROCUREMENT_QUOTE: "procurement.quote",
  PROCUREMENT_APPROVE: "procurement.approve",
  PROCUREMENT_ORDER: "procurement.order",
  PROCUREMENT_RECEIVE: "procurement.receive",
  SUPPLIER_INVOICE_CREATE: "supplier_invoice.create",
  SUPPLIER_INVOICE_APPROVE_PAYMENT: "supplier_invoice.approve_payment",
  AUDIT_VIEW: "audit.view",
} as const;

export function hasPermission(userPermissions: readonly string[], required: string) {
  return userPermissions.includes(required);
}

export function assertPermission(userPermissions: readonly string[], required: string) {
  if (!hasPermission(userPermissions, required)) {
    throw new Error("FORBIDDEN");
  }
}
