import { getUserId, invokeEdgeFunction, supabase } from "./supabase";
import { logEvent } from "./analytics";
import type { Restaurant } from "./db";

// A "Decide Now" session: a fixed set of (up to) 3 restaurants the group votes
// on with a swipe. The vote data underneath is plain binary counts — no ranking.
export interface DecideSession {
  id: string;
  collection_id: string;
  started_by: string;
  status: "active" | "completed";
  restaurant_ids: string[];
  winner_restaurant_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Vote {
  id: string;
  session_id: string;
  restaurant_id: string;
  user_id: string;
  vote: boolean;
  created_at: string;
}

// --- Invite / share -------------------------------------------------------

export interface JoinedCollection {
  id: string;
  name: string;
}

// Accept an invite: join the collection via the controlled edge function (the
// only path that can insert a non-member's membership row), then log the accept.
export async function joinCollection(
  collectionId: string,
): Promise<JoinedCollection> {
  const data = await invokeEdgeFunction<{ collection: JoinedCollection }>(
    "join-collection",
    { collectionId },
  );
  await logEvent("invite_accepted", { collection_id: collectionId });
  return data.collection;
}

// --- Sessions -------------------------------------------------------------

export interface StartedSession {
  session: DecideSession;
  restaurants: Restaurant[];
}

// Start a session (server picks the random 3, notifies other members), then log.
// An optional wildcardRestaurantId is appended to the deck server-side -- a
// nearby surprise the client fetched from Google that isn't in the collection.
export async function startDecideSession(
  collectionId: string,
  opts?: { wildcardRestaurantId?: string },
): Promise<StartedSession> {
  const result = await invokeEdgeFunction<StartedSession>(
    "start-decide-session",
    { collectionId, wildcardRestaurantId: opts?.wildcardRestaurantId },
  );
  await logEvent("decide_session_started", {
    collection_id: collectionId,
    session_id: result.session.id,
    restaurant_count: result.restaurants.length,
    wildcard: !!opts?.wildcardRestaurantId,
  });
  return result;
}

// Load a session plus the details of its fixed restaurant set. Used when a
// member opens a session they didn't start (e.g. from a push notification).
export async function getSessionWithRestaurants(
  sessionId: string,
): Promise<StartedSession | null> {
  const { data: session, error } = await supabase
    .from("decide_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!session) return null;

  const ids = (session as DecideSession).restaurant_ids;
  const { data: restaurants, error: rErr } = await supabase
    .from("restaurants")
    .select("*")
    .in("id", ids);
  if (rErr) throw rErr;

  // Preserve the session's restaurant_ids ordering.
  const byId = new Map(
    (restaurants as Restaurant[]).map((r) => [r.id, r]),
  );
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is Restaurant => r != null);

  return { session: session as DecideSession, restaurants: ordered };
}

// Cast (or change) a vote on one restaurant. Upsert on the unique
// (session, restaurant, user) key so re-swiping updates rather than duplicates.
export async function castVote(
  sessionId: string,
  restaurantId: string,
  vote: boolean,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  const { error } = await supabase.from("votes").upsert(
    {
      session_id: sessionId,
      restaurant_id: restaurantId,
      user_id: userId,
      vote,
    },
    { onConflict: "session_id,restaurant_id,user_id" },
  );
  if (error) throw error;
  await logEvent("vote_cast", {
    session_id: sessionId,
    restaurant_id: restaurantId,
    vote,
  });
}

// All votes in a session (RLS scopes this to members). Used to render live
// per-restaurant tallies; also refreshed on each Realtime change event.
export async function listVotes(sessionId: string): Promise<Vote[]> {
  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []) as Vote[];
}

// Count of "yes" votes per restaurant_id, for a simple live tally display.
export function tallyYesVotes(votes: Vote[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of votes) {
    if (v.vote) counts[v.restaurant_id] = (counts[v.restaurant_id] ?? 0) + 1;
  }
  return counts;
}

// End the session: server-side RPC computes the winner authoritatively (most
// "yes" votes, ties broken by restaurant_id). Then log session_completed.
export async function completeSession(
  sessionId: string,
): Promise<DecideSession> {
  const { data, error } = await supabase.rpc("complete_decide_session", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  // Postgres function returning a single composite row: supabase-js may hand it
  // back as an object or a one-element array depending on inference.
  const session = (Array.isArray(data) ? data[0] : data) as DecideSession;
  await logEvent("session_completed", {
    session_id: sessionId,
    winner_restaurant_id: session.winner_restaurant_id,
  });
  return session;
}
