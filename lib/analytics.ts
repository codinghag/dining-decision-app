import { getUserId, supabase } from "./supabase";

// logEvent inserts a row into the analytics_events table, stamped with the
// current (anonymous or permanent) user id. Insert-only by design — the app has
// no read policy on this table. Analytics is instrumented alongside features,
// never bolted on after.
export async function logEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const userId = await getUserId();
    const { error } = await supabase.from("analytics_events").insert({
      event_name: eventName,
      user_id: userId,
      properties,
    });
    if (error) {
      console.warn(`[analytics] failed to log "${eventName}":`, error.message);
    }
  } catch (err) {
    // Analytics must never break a user flow.
    console.warn(`[analytics] error logging "${eventName}":`, err);
  }
}
