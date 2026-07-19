// Best-effort phone normalization for matching, not validation: strips
// formatting and drops a US/Canada country-code prefix so "(415) 555-1234",
// "415-555-1234", and "+14155551234" all compare equal. Good enough for a
// US-primary user base; other-country numbers still match consistently as
// long as the same raw string normalizes the same way on both sides, but
// aren't validated as "real." Mirrored (not shared — different runtimes) in
// supabase/functions/match-contacts/index.ts.
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length < 7) return null;
  return digits;
}
