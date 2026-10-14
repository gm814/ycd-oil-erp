import { Prisma } from "@prisma/client";

type PricedProduct = {
  costPrice: Prisma.Decimal | number | string;
  costBasedPricing?: boolean;
  active?: boolean;
};
export function productPriceRange(product: PricedProduct) {
  if (!product.costBasedPricing) return null;
  const cost = new Prisma.Decimal(product.costPrice);
  return {
    min: cost.mul("1.25").toDecimalPlaces(2, Prisma.Decimal.ROUND_CEIL),
    max: cost.mul(6).toDecimalPlaces(2, Prisma.Decimal.ROUND_FLOOR),
  };
}
export function validateProductPrice(product: PricedProduct, quantity: Prisma.Decimal.Value, unitPrice: Prisma.Decimal.Value, discount: Prisma.Decimal.Value = 0) {
  if (product.active === false) throw new Error("PRODUCT_INACTIVE");
  const range = productPriceRange(product);
  if (!range) return;
  const q = new Prisma.Decimal(quantity), price = new Prisma.Decimal(unitPrice), reduction = new Prisma.Decimal(discount);
  if (q.lte(0) || reduction.lt(0) || price.gt(range.max) || price.lt(range.min) || price.mul(q).minus(reduction).lt(range.min.mul(q))) {
    throw new Error("PRICE_OUT_OF_RANGE");
  }
}
