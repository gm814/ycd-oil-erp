import { Prisma } from "@prisma/client";

// Keep inclusive-price conversion precision until subtotal and tax are each rounded.
// Both the preview and posting must use this calculation.
export function serviceOrderTotals(items: {unitPrice: Prisma.Decimal.Value; quantity: Prisma.Decimal.Value; discount: Prisma.Decimal.Value}[], rate: Prisma.Decimal.Value) {
 const exactSubtotal = items.reduce((sum,item)=>sum.plus(new Prisma.Decimal(item.unitPrice).mul(item.quantity).minus(item.discount)),new Prisma.Decimal(0));
 const subtotal = exactSubtotal.toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
 const vatAmount = exactSubtotal.mul(rate).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
 return {subtotal,vatAmount,total:subtotal.plus(vatAmount)};
}
