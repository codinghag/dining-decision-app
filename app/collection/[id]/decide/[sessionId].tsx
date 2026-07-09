import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { getUserId, supabase } from "../../../../lib/supabase";
import type { Restaurant } from "../../../../lib/db";
import {
  castVote,
  completeSession,
  getSessionWithRestaurants,
  listVotes,
  tallyYesVotes,
  type DecideSession,
  type Vote,
} from "../../../../lib/decide";
import { Button } from "../../../../components/Button";
import { RestaurantTags } from "../../../../components/RestaurantTags";
import { Confetti } from "../../../../components/Confetti";
import { buildMapsUrl } from "../../../../lib/maps";
import { logEvent } from "../../../../lib/analytics";
import { colors, radius, shadow, spacing, type } from "../../../../lib/theme";

const SWIPE_THRESHOLD = 110; // px of horizontal travel to count as a decision
const DECIDE_DURATION_MS = 60_000; // each session runs 60s, then auto-finishes

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DecideScreen() {
  const { id: collectionId, sessionId } = useLocalSearchParams<{
    id: string;
    sessionId: string;
  }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [session, setSession] = useState<DecideSession | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [index, setIndex] = useState(0); // which card the local user is on
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [presentCount, setPresentCount] = useState(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      setError(null);
      const data = await getSessionWithRestaurants(sessionId);
      if (!data) {
        setError("Session not found");
        return;
      }
      setSession(data.session);
      setRestaurants(data.restaurants);
      setVotes(await listVotes(sessionId));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch tallies whenever any vote in this session changes, so
  // every member watching sees live counts without polling.
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`votes:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "votes",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          listVotes(sessionId)
            .then(setVotes)
            .catch((e) => setError(String(e)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Realtime: pick up session completion pushed by whichever member taps
  // Finish, so everyone else's screen flips to the result view too instead
  // of only the member who tapped Finish seeing it.
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`decide_sessions:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "decide_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as DecideSession);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Realtime Presence: show how many members are on this session right now.
  // Keyed by user id so the count is unique members, not tabs/reconnects.
  useEffect(() => {
    if (!sessionId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const userId = (await getUserId()) ?? Math.random().toString(36).slice(2);
      if (cancelled) return;
      channel = supabase.channel(`presence:${sessionId}`, {
        config: { presence: { key: userId } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          setPresentCount(Object.keys(channel!.presenceState()).length);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel!.track({ online_at: new Date().toISOString() });
          }
        });
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const tallies = useMemo(() => tallyYesVotes(votes), [votes]);
  const maxTally = useMemo(
    () => Math.max(1, ...restaurants.map((r) => tallies[r.id] ?? 0)),
    [restaurants, tallies],
  );

  // Spring "pop" on the winner name when the result appears.
  const winnerScale = useSharedValue(0.7);
  useEffect(() => {
    if (session?.status === "completed") {
      winnerScale.value = 0.7;
      winnerScale.value = withSpring(1, { damping: 9, stiffness: 130 });
    }
  }, [session?.status, winnerScale]);
  const winnerNameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: winnerScale.value }],
  }));

  // Guards against casting two votes for one card: the swipe-fling path calls
  // onSwiped ~180ms after the gesture ends (via runOnJS), so a quick tap on
  // the In/Pass button right after a swipe could otherwise fire a second vote
  // before the first one's setIndex has flushed, silently skipping the next
  // card. A ref (not state) lets both call sites agree on "have we already
  // voted for this index" synchronously, regardless of render timing.
  const votedIndexRef = useRef(-1);

  const voteCurrentCard = useCallback(
    (vote: boolean) => {
      if (votedIndexRef.current === index) return;
      votedIndexRef.current = index;
      const current = restaurants[index];
      // Optimistically advance; the write + realtime refresh happen async.
      setIndex((i) => i + 1);
      if (current) {
        castVote(sessionId!, current.id, vote).catch((e) => setError(String(e)));
      }
    },
    [restaurants, index, sessionId],
  );

  // Called from the gesture worklet (via runOnJS) once a swipe crosses the
  // threshold; resets the card position for the next one.
  const onSwiped = useCallback(
    (dir: "left" | "right") => {
      translateX.value = 0;
      translateY.value = 0;
      voteCurrentCard(dir === "right");
    },
    [voteCurrentCard, translateX, translateY],
  );

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const dir = e.translationX > 0 ? "right" : "left";
        // Fling the card off-screen, then hand back to JS to advance.
        translateX.value = withTiming(
          Math.sign(e.translationX) * width * 1.5,
          { duration: 180 },
          () => {
            runOnJS(onSwiped)(dir);
          },
        );
      } else {
        // Snap back — not a decisive swipe.
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(translateX.value, [-width, 0, width], [-12, 0, 12])}deg`,
      },
    ],
  }));

  const yesOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1]),
  }));
  const passOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0]),
  }));

  const onFinish = useCallback(async () => {
    if (!sessionId) return;
    setFinishing(true);
    setError(null);
    try {
      const completed = await completeSession(sessionId);
      setSession(completed);
      setVotes(await listVotes(sessionId));
    } catch (e) {
      setError(String(e));
    } finally {
      setFinishing(false);
    }
  }, [sessionId]);

  // --- Countdown timer -----------------------------------------------------
  // All members share the session's server created_at, so a deadline derived
  // from it keeps every client's countdown in sync without any extra state.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (session?.status !== "active") return;
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, [session?.status]);

  const deadlineMs = session
    ? new Date(session.created_at).getTime() + DECIDE_DURATION_MS
    : 0;
  const remainingMs = Math.max(0, deadlineMs - nowMs);

  // When the clock runs out, whichever client reaches zero first completes the
  // session (the RPC is idempotent); realtime flips everyone to the result.
  const autoFinishedRef = useRef(false);
  useEffect(() => {
    if (
      session?.status === "active" &&
      deadlineMs > 0 &&
      remainingMs === 0 &&
      !autoFinishedRef.current &&
      !finishing
    ) {
      autoFinishedRef.current = true;
      onFinish();
    }
  }, [session?.status, deadlineMs, remainingMs, finishing, onFinish]);

  // Tap fallback (also useful on web where a drag gesture is awkward).
  function buttonVote(vote: boolean) {
    voteCurrentCard(vote);
  }

  function openDirections(r: Restaurant) {
    logEvent("directions_opened", {
      session_id: sessionId,
      restaurant_id: r.id,
    });
    Linking.openURL(buildMapsUrl(r)).catch((e) => setError(String(e)));
  }

  function renderTallies() {
    return restaurants.map((r) => {
      const count = tallies[r.id] ?? 0;
      const pct = Math.round((count / maxTally) * 100);
      return (
        <View key={r.id} style={styles.tallyRow}>
          <View style={styles.tallyHeader}>
            <Text style={styles.tallyName}>{r.name}</Text>
            <Text style={styles.tallyCount}>{count} in</Text>
          </View>
          <View style={styles.tallyTrack}>
            <View style={[styles.tallyFill, { width: `${pct}%` }]} />
          </View>
        </View>
      );
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Decide" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const completed = session?.status === "completed";
  const winner = completed
    ? restaurants.find((r) => r.id === session?.winner_restaurant_id) ?? null
    : null;
  const current = restaurants[index];
  const doneVoting = index >= restaurants.length;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Let's Decide" }} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {completed ? (
        // ---- Result view ----
        <View style={styles.resultBox}>
          <Confetti />
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.resultLabel}>The group picked</Text>
          <Animated.Text style={[styles.resultName, winnerNameStyle]}>
            {winner?.name ?? "No winner"}
          </Animated.Text>
          {winner ? (
            <RestaurantTags
              cuisine={winner.cuisine}
              priceLevel={winner.price_level}
              style={styles.resultTags}
            />
          ) : null}
          {winner?.address ? (
            <Text style={styles.resultSub}>{winner.address}</Text>
          ) : null}
          {winner ? (
            <Button
              label="Get directions"
              style={styles.directionsButton}
              onPress={() => openDirections(winner)}
            />
          ) : null}
          <View style={styles.tallies}>{renderTallies()}</View>
          <Button
            label="Back to collection"
            variant="outline"
            style={styles.primaryButton}
            onPress={() => router.replace(`/collection/${collectionId}`)}
          />
        </View>
      ) : (
        // ---- Voting view ----
        <>
          <View style={styles.timerRow}>
            <View style={[styles.timer, remainingMs <= 10_000 && styles.timerUrgent]}>
              <Text style={[styles.timerText, remainingMs <= 10_000 && styles.timerTextUrgent]}>
                ⏱ {formatCountdown(remainingMs)}
              </Text>
            </View>
          </View>

          <View style={styles.deck}>
            {doneVoting ? (
              <View style={styles.emptyDeck}>
                <Text style={styles.emptyDeckText}>
                  You've voted on all {restaurants.length}. Waiting on the group —
                  tap Finish when everyone's in.
                </Text>
              </View>
            ) : (
              <GestureDetector gesture={pan}>
                <Animated.View style={[styles.card, cardStyle]}>
                  <Animated.View style={[styles.stamp, styles.stampYes, yesOpacity]}>
                    <Text style={styles.stampYesText}>IN</Text>
                  </Animated.View>
                  <Animated.View style={[styles.stamp, styles.stampPass, passOpacity]}>
                    <Text style={styles.stampPassText}>PASS</Text>
                  </Animated.View>
                  <Text style={styles.cardName}>{current?.name}</Text>
                  <RestaurantTags
                    cuisine={current?.cuisine}
                    priceLevel={current?.price_level}
                    style={styles.cardCuisine}
                  />
                  {current?.address ? (
                    <Text style={styles.cardAddress}>{current.address}</Text>
                  ) : null}
                  <Text style={styles.cardHint}>
                    Swipe right for IN, left to PASS
                  </Text>
                </Animated.View>
              </GestureDetector>
            )}
          </View>

          {!doneVoting ? (
            <View style={styles.voteButtons}>
              <Button
                label="Pass"
                variant="danger-outline"
                flex
                onPress={() => buttonVote(false)}
              />
              <Button label="In" variant="primary" flex onPress={() => buttonVote(true)} />
            </View>
          ) : null}

          {/* Live tallies from all members */}
          <View style={styles.tallies}>
            <View style={styles.talliesHeader}>
              <Text style={styles.talliesTitle}>Live votes</Text>
              {presentCount > 0 ? (
                <Text style={styles.presence}>🟢 {presentCount} here now</Text>
              ) : null}
            </View>
            {renderTallies()}
          </View>

          <Button
            label={finishing ? "Finishing…" : "Finish & see result"}
            variant="dark"
            loading={finishing}
            onPress={onFinish}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.base, gap: spacing.base },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  timerRow: { alignItems: "center" },
  timer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerUrgent: { backgroundColor: colors.passLight, borderColor: colors.pass },
  timerText: { ...type.subtitle, color: colors.inkSecondary },
  timerTextUrgent: { color: colors.pass },
  deck: { height: 260, alignItems: "center", justifyContent: "center" },
  card: {
    width: "100%",
    height: 240,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    boxShadow: shadow.raised,
  },
  cardName: { ...type.heading, fontSize: 24, textAlign: "center" },
  cardCuisine: { alignSelf: "center" },
  cardAddress: { ...type.body, color: colors.inkSecondary, textAlign: "center" },
  cardHint: { ...type.caption, marginTop: spacing.sm },
  stamp: {
    position: "absolute",
    top: 20,
    borderWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  stampYes: { right: 20, borderColor: colors.yes, transform: [{ rotate: "12deg" }] },
  stampYesText: { color: colors.yes, fontWeight: "800", fontSize: 24 },
  stampPass: { left: 20, borderColor: colors.pass, transform: [{ rotate: "-12deg" }] },
  stampPassText: { color: colors.pass, fontWeight: "800", fontSize: 24 },
  emptyDeck: {
    padding: spacing.lg,
    alignItems: "center",
  },
  emptyDeckText: { ...type.body, color: colors.inkTertiary, textAlign: "center" },
  voteButtons: { flexDirection: "row", gap: spacing.md, justifyContent: "center" },
  tallies: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  talliesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  talliesTitle: { ...type.label, marginBottom: 2 },
  presence: { ...type.caption, color: colors.yes, fontWeight: "600" },
  tallyRow: { gap: 4 },
  tallyHeader: { flexDirection: "row", justifyContent: "space-between" },
  tallyName: { ...type.body, flex: 1 },
  tallyCount: { color: colors.primary, fontWeight: "700" },
  tallyTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  tallyFill: {
    height: "100%",
    borderRadius: radius.full,
    backgroundColor: colors.yes,
  },
  directionsButton: { marginTop: spacing.sm, alignSelf: "stretch" },
  primaryButton: { marginTop: spacing.sm, alignSelf: "stretch" },
  resultBox: { gap: spacing.sm, alignItems: "center", paddingTop: spacing.lg },
  trophy: { fontSize: 52 },
  resultLabel: { ...type.label, textTransform: "uppercase", letterSpacing: 1 },
  resultName: { ...type.title, textAlign: "center" },
  resultTags: { justifyContent: "center" },
  resultSub: { ...type.body, color: colors.inkSecondary, textAlign: "center" },
  error: { color: colors.pass },
});
