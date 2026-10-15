// A wash reward is earned by an oil-change service, never by a filter/other sale alone.
// Product metadata explicitly distinguishes oil filters from air/cabin/fuel filters.
export function washEligibility(order: { channel: string; items: readonly {
  quantity: unknown; product?: { category: string; isOilFilter?: boolean } | null;
}[] }) {
  const positive = order.items.filter(i => Number(i.quantity) > 0);
  const hasOil = order.channel === "OIL" && positive.some(i => i.product?.category === "OIL");
  const hasOilFilter = positive.some(i => i.product?.category === "FILTER" && i.product.isOilFilter === true);
  return { hasOil, hasOilFilter, eligible: hasOil && hasOilFilter };
}
