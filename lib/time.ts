const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

export function riyadhBusinessDayRange(now = new Date()) {
  const riyadh = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const startAsUtc = Date.UTC(
    riyadh.getUTCFullYear(),
    riyadh.getUTCMonth(),
    riyadh.getUTCDate(),
    0, 0, 0, 0,
  );
  const start = new Date(startAsUtc - RIYADH_OFFSET_MS);
  const end = new Date(start.getTime() + DAY_MS);
  return { start, end };
}

export function riyadhDateRange(from: string, to: string) {
  const fromParts = parseDateParts(from);
  const toParts = parseDateParts(to);
  if (!fromParts || !toParts) return null;

  const start = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day) - RIYADH_OFFSET_MS);
  const toStart = new Date(Date.UTC(toParts.year, toParts.month - 1, toParts.day) - RIYADH_OFFSET_MS);
  const end = new Date(toStart.getTime() + DAY_MS);
  if (start >= end) return null;
  return { start, end };
}

export function riyadhDateKey(date: Date) {
  return new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export function riyadhMonthToDateStrings(now = new Date()) {
  const riyadh = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const year = riyadh.getUTCFullYear();
  const month = String(riyadh.getUTCMonth() + 1).padStart(2, "0");
  const day = String(riyadh.getUTCDate()).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${day}` };
}
