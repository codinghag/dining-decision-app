import { useCallback, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getCollection } from "../../../lib/db";
import { listFriends, inviteFriendsToCollection, type Friend } from "../../../lib/friends";
import { shareCollectionInvite } from "../../../lib/invite";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Button } from "../../../components/Button";
import { radius, spacing, themedStyles, useTheme } from "../../../lib/theme";

// Invite hub for a list, reached from the Share button. Two paths:
//   - Friends on Forked: one tap adds them to the list server-side and
//     push-notifies them — no link, no login, it just appears for them.
//   - Everyone else: the existing share-sheet link (text/WhatsApp/etc.),
//     which is also how brand-new users get in.
export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];

  const [name, setName] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [coll, f] = await Promise.all([getCollection(id), listFriends()]);
      setName(coll?.name ?? null);
      setFriends(f);
    } catch (e) {
      setError(String(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onShareLink() {
    if (!id) return;
    setFeedback(null);
    setError(null);
    try {
      const outcome = await shareCollectionInvite(id, name ?? "our list");
      if (outcome === "copied") setFeedback("Link copied to clipboard ✓");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onInvite(friend: Friend) {
    if (!id) return;
    setBusyId(friend.userId);
    setError(null);
    try {
      await inviteFriendsToCollection(id, [friend.userId]);
      setInvited((prev) => new Set(prev).add(friend.userId));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: "Invite" }} />

      <Text style={styles.heading}>
        {name ? `Invite people to "${name}"` : "Invite people"}
      </Text>

      <Button label="📤 Share invite link" onPress={onShareLink} />
      <Text style={styles.help}>
        Anyone with the link can join and vote — no account needed.
      </Text>
      {feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Friends on Forked</Text>
      {friends === null ? (
        <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
      ) : friends.length === 0 ? (
        <>
          <Text style={styles.help}>
            No friends yet — add some and inviting takes one tap.
          </Text>
          <Button
            label="Go to Friends"
            variant="outline"
            onPress={() => router.push("/friends")}
          />
        </>
      ) : (
        friends.map((f) => {
          const done = invited.has(f.userId);
          return (
            <View key={f.userId} style={styles.row}>
              <Text style={styles.rowName}>{f.displayName ?? "Unnamed friend"}</Text>
              {done ? (
                <Text style={styles.invited}>Invited ✓</Text>
              ) : (
                <Button
                  label="Invite"
                  loading={busyId === f.userId}
                  onPress={() => onInvite(f)}
                />
              )}
            </View>
          );
        })
      )}
    </ScreenContainer>
  );
}

const themed = themedStyles((colors, type) => ({
  heading: { ...type.heading, marginBottom: spacing.sm },
  sectionTitle: { ...type.label, marginTop: spacing.base },
  help: { ...type.caption, color: colors.inkSecondary, marginTop: spacing.xs },
  feedback: { ...type.body, color: colors.yes },
  error: { color: colors.pass },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  rowName: { ...type.subtitle, flex: 1 },
  invited: { ...type.body, color: colors.yes, fontWeight: "600" },
}));
