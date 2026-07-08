import { getUserId, supabase } from "./supabase";

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
