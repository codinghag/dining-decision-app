// Computes whether a place is open right now from Google's regularOpeningHours
// (the stored `hours` jsonb) plus the place's UTC offset -- so it's always
// live, never a stale saved boolean. Returns null when we can't tell (no
// hours, or no offset -- e.g. a manually quick-added place).
//
// Google's periods use day 0 = Sunday; a period with no `close` means the
// place is open-ended (24/7); a period whose close is "earlier" than its open
// wraps past the end of the week (e.g. Fri 8pm -> Sat 2am).

interface TimePoint {
  day: number;
  hour: number;
  minute: number;
}
interface Period {
  open?: TimePoint;
  close?: TimePoint;
}
interface RegularHours {
  periods?: Period[];
}

const WEEK_MINUTES = 7 * 24 * 60;

export function isOpenNow(
  hours: unknown,
  utcOffsetMinutes: number | null,
  nowMs: number = Date.now(),
): boolean | null {
  if (utcOffsetMinutes == null) return null;
  const periods = (hours as RegularHours | null)?.periods;
  if (!periods || periods.length === 0) return null;

  // Shift into the place's local wall clock, then read via UTC getters.
  const local = new Date(nowMs + utcOffsetMinutes * 60_000);
  const nowMin =
    local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();

  for (const p of periods) {
    if (!p.open) continue;
    const openMin = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    if (!p.close) return true; // open-ended => always open
    let closeMin = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    if (closeMin <= openMin) closeMin += WEEK_MINUTES; // wraps past end of week
    if (
      (nowMin >= openMin && nowMin < closeMin) ||
      (nowMin + WEEK_MINUTES >= openMin && nowMin + WEEK_MINUTES < closeMin)
    ) {
      return true;
    }
  }
  return false;
}
