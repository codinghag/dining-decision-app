// Quick-pick date/time candidates for ProposeTimesSheet -- plain Date math,
// no picker dependency (matches this app's preference for small custom
// components over pulling in new native libraries).

export interface QuickSlot {
  label: string;
  iso: string;
}

function atHour(date: Date, hour: number): Date {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// The next occurrence of a weekday (0=Sun..6=Sat) at or after `from`,
// including today if `from`'s weekday already matches.
function nextWeekday(from: Date, targetDow: number): Date {
  const diff = (targetDow - from.getDay() + 7) % 7;
  return addDays(from, diff);
}

const DEFAULT_HOUR = 19; // 7pm

// A handful of tappable suggestions: tonight (if not already past), tomorrow,
// this Friday, this Saturday -- each at 7pm. "This Friday/Saturday" rolls to
// next week if that day's 7pm has already passed.
export function quickTimeSlots(now: Date = new Date()): QuickSlot[] {
  const slots: QuickSlot[] = [];

  const tonight = atHour(now, DEFAULT_HOUR);
  if (tonight.getTime() > now.getTime()) {
    slots.push({ label: "Tonight, 7pm", iso: tonight.toISOString() });
  }

  const tomorrow = atHour(addDays(now, 1), DEFAULT_HOUR);
  slots.push({ label: "Tomorrow, 7pm", iso: tomorrow.toISOString() });

  const friday = atHour(nextWeekday(now, 5), DEFAULT_HOUR);
  if (friday.getTime() <= now.getTime()) friday.setDate(friday.getDate() + 7);
  slots.push({ label: "This Friday, 7pm", iso: friday.toISOString() });

  const saturday = atHour(nextWeekday(now, 6), DEFAULT_HOUR);
  if (saturday.getTime() <= now.getTime()) saturday.setDate(saturday.getDate() + 7);
  slots.push({ label: "This Saturday, 7pm", iso: saturday.toISOString() });

  return slots;
}

// Parse a custom "YYYY-MM-DD" + "HH:MM" (24h) pair typed into the sheet's
// two text fields into an ISO string, or null if either is malformed.
export function parseCustomSlot(dateStr: string, timeStr: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;
  const [, y, mo, da] = dateMatch;
  const [, h, mi] = timeMatch;
  const d = new Date(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(h),
    Number(mi),
    0,
    0,
  );
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
