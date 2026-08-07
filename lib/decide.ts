import { getUserId, invokeEdgeFunction, supabase } from "./supabase";
import { logEvent } from "./analytics";
import type { Restaurant } from "./db";

// A "Decide Now" session: a fixed set of (up to) 3 restaurants the group votes
// on with a swipe. The vote data underneath is plain binary counts — no ranking.
// It also carries a fixed set of organizer-proposed time slots, approved the
// same way (see TimeOption/TimeVote below) — one combined session settles
// both where and when.
export interface DecideSession {
  id: string;
  collection_id: string;
  started_by: string;
  status: "active" | "completed";
  restaurant_ids: string[];
  winner_restaurant_id: string | null;
  winner_time_option_id: string | null;
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

// A candidate date/time slot proposed by the session's organizer.
export interface TimeOption {
  id: string;
  session_id: string;
  starts_at: string;
}

// Approval per (session, option, user) — a row means approved; there is no
// "explicitly not interested" row, un-approving just deletes it.
export interface TimeVote {
  id: string;
  session_id: string;
  option_id: string;
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
  timeOptions: TimeOption[];
}

// Start a session (server picks the random 3, notifies other members), then log.
// An optional wildcardRestaurantId is appended to the deck server-side -- a
// nearby surprise the client fetched from Google that isn't in the collection.
// timeOptions is the organizer's proposed date/time slots (1+ ISO strings) --
// ignored server-side if an active session already exists to join instead.
export async function startDecideSession(
  collectionId: string,
  opts: { wildcardRestaurantId?: string; timeOptions: string[] },
): Promise<StartedSession> {
  const result = await invokeEdgeFunction<StartedSession>(
    "start-decide-session",
    {
      collectionId,
      wildcardRestaurantId: opts.wildcardRestaurantId,
      timeOptions: opts.timeOptions,
    },
  );
  await logEvent("decide_session_started", {
    collection_id: collectionId,
    session_id: result.session.id,
    restaurant_count: result.restaurants.length,
    time_option_count: result.timeOptions.length,
    wildcard: !!opts.wildcardRestaurantId,
  });
  return result;
}

// Load a session plus the details of its fixed restaurant set and time
// options. Used when a member opens a session they didn't start (e.g. from a
// push notification).
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
  const [{ data: restaurants, error: rErr }, { data: timeOptions, error: tErr }] =
    await Promise.all([
      supabase.from("restaurants").select("*").in("id", ids),
      supabase
        .from("decide_time_options")
        .select("*")
        .eq("session_id", sessionId)
        .order("starts_at", { ascending: true }),
    ]);
  if (rErr) throw rErr;
  if (tErr) throw tErr;

  // Preserve the session's restaurant_ids ordering.
  const byId = new Map(
    (restaurants as Restaurant[]).map((r) => [r.id, r]),
  );
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is Restaurant => r != null);

  return {
    session: session as DecideSession,
    restaurants: ordered,
    timeOptions: (timeOptions ?? []) as TimeOption[],
  };
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

// Optional post-decide reaction: one thumbs up/down per (session, user),
// recorded once a session is completed. Upsert so a mis-tap is correctable.
export interface SessionFeedback {
  id: string;
  session_id: string;
  user_id: string;
  restaurant_id: string;
  liked: boolean;
  created_at: string;
}

export async function submitSessionFeedback(
  sessionId: string,
  restaurantId: string,
  liked: boolean,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  const { error } = await supabase.from("session_feedback").upsert(
    { session_id: sessionId, user_id: userId, restaurant_id: restaurantId, liked },
    { onConflict: "session_id,user_id" },
  );
  if (error) throw error;
  await logEvent("decide_feedback_given", { session_id: sessionId, liked });
}

// Whether (and how) the current user already answered "How was it?" for a
// session -- null means no feedback yet, so the result screen can skip
// re-asking someone who's already answered.
export async function getMyFeedback(sessionId: string): Promise<boolean | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("session_feedback")
    .select("liked")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { liked: boolean } | null)?.liked ?? null;
}

// Approve or un-approve one time option. Approving upserts a row (like
// castVote); un-approving deletes it instead of writing vote=false, since
// there's no "explicitly not interested" state to record for a time slot.
export async function castTimeVote(
  sessionId: string,
  optionId: string,
  approve: boolean,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("Not signed in");
  if (approve) {
    const { error } = await supabase.from("time_votes").upsert(
      { session_id: sessionId, option_id: optionId, user_id: userId, vote: true },
      { onConflict: "session_id,option_id,user_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("time_votes")
      .delete()
      .eq("session_id", sessionId)
      .eq("option_id", optionId)
      .eq("user_id", userId);
    if (error) throw error;
  }
  await logEvent("time_vote_cast", {
    session_id: sessionId,
    option_id: optionId,
    approve,
  });
}

// All time-option approvals in a session (RLS scopes this to members). Used
// to render live per-option tallies; also refreshed on each Realtime event.
export async function listTimeVotes(sessionId: string): Promise<TimeVote[]> {
  const { data, error } = await supabase
    .from("time_votes")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []) as TimeVote[];
}

// Count of approvals per option_id -- every row already implies approval.
export function tallyTimeApprovals(votes: TimeVote[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of votes) {
    counts[v.option_id] = (counts[v.option_id] ?? 0) + 1;
  }
  return counts;
}

// End the session: server-side RPC computes both winners authoritatively --
// the restaurant with the most "yes" votes (ties broken by restaurant_id),
// and the time option with the most approvals (ties broken by earliest
// starts_at). Then log session_completed.
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
    winner_time_option_id: session.winner_time_option_id,
  });
  return session;
}

// Best-effort push to the rest of the group once a session completes.
// Fire-and-forget: never throws, since a failed notification shouldn't block
// the result view from showing. Safe to call from every client that
// witnesses completion -- the server-side claim makes only one push go out.
export async function notifyDecideComplete(sessionId: string): Promise<void> {
  try {
    await invokeEdgeFunction("notify-decide-complete", { sessionId });
  } catch {
    // ignored -- this is a nice-to-have, not a correctness requirement
  }
}
