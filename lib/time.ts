const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export function riyadhBusinessDayRange(now = new Date()) {
  const riyadh = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const startAsUtc = Date.UTC(
    riyadh.getUTCFullYear(),
    riyadh.getUTCMonth(),
    riyadh.getUTCDate(),
    0, 0, 0, 0,
  );
  const start = new Date(startAsUtc - RIYADH_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
