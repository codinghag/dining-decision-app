import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
import { supabase } from "../../../../lib/supabase";
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

const SWIPE_THRESHOLD = 110; // px of horizontal travel to count as a decision

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

  const tallies = useMemo(() => tallyYesVotes(votes), [votes]);

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

  async function onFinish() {
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
  }

  // Tap fallback (also useful on web where a drag gesture is awkward).
  function buttonVote(vote: boolean) {
    voteCurrentCard(vote);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Decide" }} />
        <ActivityIndicator size="large" />
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
          <Text style={styles.resultLabel}>The group picked</Text>
          <Text style={styles.resultName}>{winner?.name ?? "No winner"}</Text>
          {winner?.address ? (
            <Text style={styles.resultSub}>{winner.address}</Text>
          ) : null}
          <View style={styles.tallies}>
            {restaurants.map((r) => (
              <View key={r.id} style={styles.tallyRow}>
                <Text style={styles.tallyName}>{r.name}</Text>
                <Text style={styles.tallyCount}>{tallies[r.id] ?? 0} in</Text>
              </View>
            ))}
          </View>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace(`/collection/${collectionId}`)}
          >
            <Text style={styles.primaryButtonText}>Back to collection</Text>
          </Pressable>
        </View>
      ) : (
        // ---- Voting view ----
        <>
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
              <Pressable
                style={[styles.voteButton, styles.passButton]}
                onPress={() => buttonVote(false)}
              >
                <Text style={styles.passButtonText}>Pass</Text>
              </Pressable>
              <Pressable
                style={[styles.voteButton, styles.inButton]}
                onPress={() => buttonVote(true)}
              >
                <Text style={styles.inButtonText}>In</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Live tallies from all members */}
          <View style={styles.tallies}>
            <Text style={styles.talliesTitle}>Live votes</Text>
            {restaurants.map((r) => (
              <View key={r.id} style={styles.tallyRow}>
                <Text style={styles.tallyName}>{r.name}</Text>
                <Text style={styles.tallyCount}>{tallies[r.id] ?? 0} in</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.finishButton, finishing && styles.buttonDisabled]}
            onPress={onFinish}
            disabled={finishing}
          >
            <Text style={styles.finishButtonText}>
              {finishing ? "Finishing…" : "Finish & see result"}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  deck: { height: 260, alignItems: "center", justifyContent: "center" },
  card: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fafafa",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardName: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  cardAddress: { color: "#666", textAlign: "center" },
  cardHint: { color: "#aaa", fontSize: 12, marginTop: 8 },
  stamp: {
    position: "absolute",
    top: 20,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stampYes: { right: 20, borderColor: "#2ecc71", transform: [{ rotate: "12deg" }] },
  stampYesText: { color: "#2ecc71", fontWeight: "800", fontSize: 24 },
  stampPass: { left: 20, borderColor: "#e74c3c", transform: [{ rotate: "-12deg" }] },
  stampPassText: { color: "#e74c3c", fontWeight: "800", fontSize: 24 },
  emptyDeck: {
    padding: 24,
    alignItems: "center",
  },
  emptyDeckText: { color: "#888", textAlign: "center", fontSize: 15 },
  voteButtons: { flexDirection: "row", gap: 12, justifyContent: "center" },
  voteButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  passButton: { borderColor: "#e74c3c", backgroundColor: "#fff" },
  passButtonText: { color: "#e74c3c", fontWeight: "700", fontSize: 16 },
  inButton: { borderColor: "#2ecc71", backgroundColor: "#2ecc71" },
  inButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  tallies: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: "#fafafa",
  },
  talliesTitle: { fontWeight: "600", color: "#444", marginBottom: 2 },
  tallyRow: { flexDirection: "row", justifyContent: "space-between" },
  tallyName: { color: "#333", flex: 1 },
  tallyCount: { color: "#1f6feb", fontWeight: "600" },
  finishButton: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  finishButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
  primaryButton: {
    backgroundColor: "#1f6feb",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  resultBox: { gap: 8, alignItems: "center", paddingTop: 24 },
  resultLabel: { color: "#888", textTransform: "uppercase", letterSpacing: 1 },
  resultName: { fontSize: 28, fontWeight: "800", textAlign: "center" },
  resultSub: { color: "#666", textAlign: "center" },
  error: { color: "#c00" },
});
