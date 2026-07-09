import { getUserId, supabase } from "./supabase";
import { getDisplayNames } from "./profile";

export interface Agreement {
  userId: string;
  name: string;
  agreementPct: number;
  sharedVotes: number;
}

export interface TopRestaurant {
  restaurantId: string;
  name: string;
  wins: number;
}

export interface MemberInRate {
  userId: string;
  name: string;
  inRate: number; // 0..1, share of votes that were "in"
  totalVotes: number;
}

export interface RecentDecision {
  sessionId: string;
  name: string;
  completedAt: string | null;
}

export interface CollectionStats {
  totalSessions: number;
  topRestaurants: TopRestaurant[];
  agreements: Agreement[]; // current user vs each other member
  memberInRates: MemberInRate[];
  recentDecisions: RecentDecision[]; // most recent first
}

// Computes group stats for a collection from its decide sessions + votes.
// All reads are RLS-scoped to members. Computation is client-side, which is
// fine at friend-group scale (a handful of sessions and voters).
export async function getCollectionStats(collectionId: string): Promise<CollectionStats> {
  const myId = await getUserId();

  const { data: sessions, error: sErr } = await supabase
    .from("decide_sessions")
    .select("id,status,winner_restaurant_id,completed_at")
    .eq("collection_id", collectionId);
  if (sErr) throw sErr;
  const sessionRows = (sessions ?? []) as {
    id: string;
    status: string;
    winner_restaurant_id: string | null;
    completed_at: string | null;
  }[];
  const completed = sessionRows.filter((s) => s.status === "completed");
  const sessionIds = sessionRows.map((s) => s.id);

  let votes: {
    session_id: string;
    restaurant_id: string;
    user_id: string;
    vote: boolean;
  }[] = [];
  if (sessionIds.length > 0) {
    const { data: v, error: vErr } = await supabase
      .from("votes")
      .select("session_id,restaurant_id,user_id,vote")
      .in("session_id", sessionIds);
    if (vErr) throw vErr;
    votes = (v ?? []) as typeof votes;
  }

  const winnerIds = completed
    .map((s) => s.winner_restaurant_id)
    .filter((x): x is string => !!x);
  const restaurantIds = Array.from(
    new Set([...winnerIds, ...votes.map((v) => v.restaurant_id)]),
  );
  const nameById: Record<string, string> = {};
  if (restaurantIds.length > 0) {
    const { data: rs, error: rErr } = await supabase
      .from("restaurants")
      .select("id,name")
      .in("id", restaurantIds);
    if (rErr) throw rErr;
    for (const r of (rs ?? []) as { id: string; name: string }[]) {
      nameById[r.id] = r.name;
    }
  }

  const userIds = Array.from(new Set(votes.map((v) => v.user_id)));
  const names = await getDisplayNames(userIds);
  const nameOf = (uid: string) => names[uid] ?? "Someone";

  // Chronological history of decisions (most recent first) — the group's memory.
  const recentDecisions = completed
    .filter((s) => s.winner_restaurant_id)
    .map((s) => ({
      sessionId: s.id,
      name: nameById[s.winner_restaurant_id as string] ?? "Unknown",
      completedAt: s.completed_at,
    }))
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, 15);

  // Top restaurants by number of wins.
  const winCounts: Record<string, number> = {};
  for (const id of winnerIds) winCounts[id] = (winCounts[id] ?? 0) + 1;
  const topRestaurants = Object.entries(winCounts)
    .map(([restaurantId, wins]) => ({
      restaurantId,
      name: nameById[restaurantId] ?? "Unknown",
      wins,
    }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 5);

  // Per-member "in" rate (how enthusiastic vs picky they are).
  const perUser: Record<string, { inCount: number; total: number }> = {};
  for (const v of votes) {
    const u = perUser[v.user_id] ?? { inCount: 0, total: 0 };
    u.total++;
    if (v.vote) u.inCount++;
    perUser[v.user_id] = u;
  }
  const memberInRates = Object.entries(perUser)
    .map(([userId, s]) => ({
      userId,
      name: nameOf(userId),
      inRate: s.total ? s.inCount / s.total : 0,
      totalVotes: s.total,
    }))
    .sort((a, b) => b.inRate - a.inRate);

  // Pairwise agreement of the current user vs each other member: over the
  // (session, restaurant) pairs both voted on, the share where the vote matched.
  const agreements: Agreement[] = [];
  if (myId) {
    const myVotes = new Map<string, boolean>();
    for (const v of votes) {
      if (v.user_id === myId) myVotes.set(`${v.session_id}:${v.restaurant_id}`, v.vote);
    }
    for (const u of userIds.filter((x) => x !== myId)) {
      let shared = 0;
      let agree = 0;
      for (const v of votes) {
        if (v.user_id !== u) continue;
        const mine = myVotes.get(`${v.session_id}:${v.restaurant_id}`);
        if (mine === undefined) continue;
        shared++;
        if (mine === v.vote) agree++;
      }
      if (shared > 0) {
        agreements.push({
          userId: u,
          name: nameOf(u),
          agreementPct: Math.round((agree / shared) * 100),
          sharedVotes: shared,
        });
      }
    }
    agreements.sort((a, b) => b.agreementPct - a.agreementPct);
  }

  return {
    totalSessions: completed.length,
    topRestaurants,
    agreements,
    memberInRates,
    recentDecisions,
  };
}
