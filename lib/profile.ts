import { getUserId, supabase } from "./supabase";
import { normalizePhone } from "./phone";

// The profiles row is auto-created (display_name null) by a trigger when the
// anonymous auth user is created (see migration 0001). These helpers just
// read/write the display_name so group features can show real names instead
// of anonymous ids. profiles_select is `using (true)`, so any member can read
// any profile's name; profiles_update_self restricts writes to your own row.

export async function getMyDisplayName(): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.display_name as string | null) ?? null;
}

export async function setMyDisplayName(name: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userId);
  if (error) throw error;
}

// Your own phone number, so friends can find you via phone-based contact
// matching (see lib/friends.ts). Stored in profile_phones, not profiles —
// unlike display_name, it must NOT be publicly select-able, so only the
// owner can read it back (RLS, migration 0016).
export async function getMyPhone(): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profile_phones")
    .select("phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.phone as string | null) ?? null;
}

export async function setMyPhone(rawPhone: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error("That doesn't look like a valid phone number.");
  const { error } = await supabase.from("profile_phones").upsert(
    { user_id: userId, phone, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function clearMyPhone(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const { error } = await supabase.from("profile_phones").delete().eq("user_id", userId);
  if (error) throw error;
}

// Map of user id -> display_name for a set of users (e.g. the members whose
// votes appear in a collection's stats).
export async function getDisplayNames(
  ids: string[],
): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name")
    .in("id", ids);
  if (error) throw error;
  const map: Record<string, string | null> = {};
  for (const row of (data ?? []) as { id: string; display_name: string | null }[]) {
    map[row.id] = row.display_name;
  }
  return map;
}
