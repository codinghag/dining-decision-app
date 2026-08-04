// Display formatting for the date/time options proposed on a decide session
// (lib/timeSlots.ts generates the candidates, this formats any ISO string
// for display -- including custom slots typed in by hand).

const formatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// "Sat, Aug 8, 7:00 PM" (locale-aware; falls back to the raw ISO string on
// an unparseable input rather than throwing, since this only ever renders --
// never gates logic).
export function formatTimeOption(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatter.format(d);
}
