import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { getCollectionStats, type CollectionStats } from "../../../lib/stats";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { spacing, themedStyles, useTheme } from "../../../lib/theme";

export default function StatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setStats(await getCollectionStats(id));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Group Stats" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const empty =
    !stats ||
    (stats.totalSessions === 0 &&
      stats.topRestaurants.length === 0 &&
      stats.agreements.length === 0 &&
      stats.memberInRates.length === 0);

  const pickiest = stats?.memberInRates.length
    ? stats.memberInRates[stats.memberInRates.length - 1]
    : null;
  const keenest = stats?.memberInRates.length ? stats.memberInRates[0] : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Group Stats" }} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {empty ? (
        <EmptyState
          icon="📊"
          message="No stats yet. Run a few 'Let's Decide' sessions and they'll show up here."
        />
      ) : (
        <>
          <Card elevated>
            <Text style={styles.big}>{stats!.totalSessions}</Text>
            <Text style={styles.bigLabel}>
              {stats!.totalSessions === 1 ? "decision made" : "decisions made"}
            </Text>
          </Card>

          {stats!.recentDecisions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent decisions</Text>
              {stats!.recentDecisions.map((d) => (
                <Card key={d.sessionId} style={styles.rowCard}>
                  <Text style={styles.rowName}>🏆 {d.name}</Text>
                  <Text style={styles.rowSub}>{formatDecisionDate(d.completedAt)}</Text>
                </Card>
              ))}
            </View>
          ) : null}

          {stats!.agreements.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>You agree most with</Text>
              {stats!.agreements.map((a) => (
                <Card key={a.userId} style={styles.rowCard}>
                  <Text style={styles.rowName}>{a.name}</Text>
                  <Text style={styles.rowValue}>
                    {a.agreementPct}%{" "}
                    <Text style={styles.rowSub}>· {a.sharedVotes} shared</Text>
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}

          {stats!.topRestaurants.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Most picked</Text>
              {stats!.topRestaurants.map((r) => (
                <Card key={r.restaurantId} style={styles.rowCard}>
                  <Text style={styles.rowName}>{r.name}</Text>
                  <Text style={styles.rowValue}>
                    {r.wins} {r.wins === 1 ? "win" : "wins"}
                  </Text>
                </Card>
              ))}
            </View>
          ) : null}

          {keenest || pickiest ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Voting personalities</Text>
              {keenest ? (
                <Card style={styles.rowCard}>
                  <Text style={styles.rowName}>🤩 Most easygoing</Text>
                  <Text style={styles.rowValue}>
                    {keenest.name}{" "}
                    <Text style={styles.rowSub}>· {Math.round(keenest.inRate * 100)}% in</Text>
                  </Text>
                </Card>
              ) : null}
              {pickiest && pickiest.userId !== keenest?.userId ? (
                <Card style={styles.rowCard}>
                  <Text style={styles.rowName}>🧐 Pickiest</Text>
                  <Text style={styles.rowValue}>
                    {pickiest.name}{" "}
                    <Text style={styles.rowSub}>· {Math.round(pickiest.inRate * 100)}% in</Text>
                  </Text>
                </Card>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function formatDecisionDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const themed = themedStyles((colors, type) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.base },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  section: { gap: spacing.sm },
  sectionTitle: { ...type.label, color: colors.inkSecondary, textTransform: "uppercase", letterSpacing: 1 },
  big: { fontSize: 44, fontWeight: "800", color: colors.primary, textAlign: "center" },
  bigLabel: { ...type.body, color: colors.inkSecondary, textAlign: "center" },
  rowCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowName: { ...type.subtitle, flex: 1 },
  rowValue: { ...type.subtitle, color: colors.primary },
  rowSub: { ...type.caption, color: colors.inkTertiary, fontWeight: "400" },
  error: { color: colors.pass },
}));
