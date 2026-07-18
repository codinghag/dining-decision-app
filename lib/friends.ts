import { Platform } from "react-native";
import { getUserId, invokeEdgeFunction, supabase } from "./supabase";
import { getDisplayNames } from "./profile";
import { logEvent } from "./analytics";

// Friends are mutual, stored as one row per direction, written only by the
// add-friend edge function so both directions stay in lockstep. Reads and
// deletes go straight through RLS (either side sees/dissolves both rows).

export interface Friend {
  userId: string;
  displayName: string | null;
}

export interface ContactMatch {
  userId: string;
  email: string;
  displayName: string | null;
}

function byName(a: Friend, b: Friend): number {
  return (a.displayName ?? "").localeCompare(b.displayName ?? "");
}

export async function listFriends(): Promise<Friend[]> {
  const me = await getUserId();
  if (!me) return [];
  const { data, error } = await supabase
    .from("friendships")
    .select("user_id,friend_id");
  if (error) throw error;
  // RLS returns both directions; collapse to the set of counterpart ids.
  const ids = new Set<string>();
  for (const row of (data ?? []) as { user_id: string; friend_id: string }[]) {
    ids.add(row.user_id === me ? row.friend_id : row.user_id);
  }
  ids.delete(me);
  const names = await getDisplayNames([...ids]);
  return [...ids]
    .map((userId) => ({ userId, displayName: names[userId] ?? null }))
    .sort(byName);
}

export async function addFriend(userId: string): Promise<void> {
  await invokeEdgeFunction("add-friend", { friendId: userId });
  await logEvent("friend_added", { friend_id: userId });
}

export async function removeFriend(userId: string): Promise<void> {
  const me = await getUserId();
  if (!me) throw new Error("Not signed in");
  const { error } = await supabase
    .from("friendships")
    .delete()
    .or(
      `and(user_id.eq.${me},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${me})`,
    );
  if (error) throw error;
  await logEvent("friend_removed", { friend_id: userId });
}

// Which of these emails already have a Forked account? Emails are matched
// server-side in memory and never stored (see match-contacts function).
export async function matchContacts(emails: string[]): Promise<ContactMatch[]> {
  const data = await invokeEdgeFunction<{ matches: ContactMatch[] }>(
    "match-contacts",
    { emails },
  );
  return data.matches ?? [];
}

// People you share a list with who aren't friends yet — the zero-permission
// friend source (no contacts access needed).
export async function suggestedFriends(): Promise<Friend[]> {
  const me = await getUserId();
  if (!me) return [];
  const [{ data, error }, friends] = await Promise.all([
    supabase.from("collection_members").select("user_id"),
    listFriends(),
  ]);
  if (error) throw error;
  const already = new Set(friends.map((f) => f.userId));
  const ids = new Set<string>();
  for (const row of (data ?? []) as { user_id: string }[]) {
    if (row.user_id !== me && !already.has(row.user_id)) ids.add(row.user_id);
  }
  const names = await getDisplayNames([...ids]);
  return [...ids]
    .map((userId) => ({ userId, displayName: names[userId] ?? null }))
    .sort(byName);
}

// In-app invite: adds the friends to the list server-side and pushes them a
// notification — the app-to-app alternative to texting the join link.
export async function inviteFriendsToCollection(
  collectionId: string,
  friendIds: string[],
): Promise<number> {
  const data = await invokeEdgeFunction<{ invited: number }>(
    "invite-friends",
    { collectionId, friendIds },
  );
  await logEvent("friends_invited", {
    collection_id: collectionId,
    count: data.invited,
  });
  return data.invited;
}

// Emails from the device address book, for contact matching. Native only —
// dynamic import so the web bundle never touches the native module. Returns
// null when permission is denied (vs [] for "granted but no emails").
export async function getContactEmails(): Promise<string[] | null> {
  if (Platform.OS === "web") return null;
  const Contacts = await import("expo-contacts");
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return null;
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Emails],
  });
  const emails = new Set<string>();
  for (const contact of data) {
    for (const e of contact.emails ?? []) {
      if (e.email) emails.add(e.email.trim().toLowerCase());
    }
  }
  return [...emails];
}
