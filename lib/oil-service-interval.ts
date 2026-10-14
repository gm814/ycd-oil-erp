// Intervals are explicit product settings, never inferred from names or viscosity.
export function oilServiceReminder(odometer: number | null, items: readonly {
  product?: { category: string; serviceIntervalKm?: number | null } | null;
}[]) {
  const oils = items.filter(item => item.product?.category === "OIL");
  if (!oils.length) return { nextKm: null, reason: "NO_OIL" } as const;
  const intervals = oils.map(item => item.product?.serviceIntervalKm);
  if (intervals.some(km => km !== 5000 && km !== 10000)) return { nextKm: null, reason: "UNCONFIGURED" } as const;
  if (new Set(intervals).size !== 1) return { nextKm: null, reason: "CONFLICT" } as const;
  if (odometer === null || !Number.isSafeInteger(odometer) || odometer < 0) return { nextKm: null, reason: "NO_ODOMETER" } as const;
  return { nextKm: odometer + intervals[0]!, reason: "READY" } as const;
}
