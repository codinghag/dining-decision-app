import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { getCollection } from "../../../lib/db";
import {
  inviteFriendsToCollection,
  listFriends,
  pickContactPhone,
  type Friend,
} from "../../../lib/friends";
import { shareCollectionInvite, textCollectionInvite } from "../../../lib/invite";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { TextField } from "../../../components/TextField";
import { Button } from "../../../components/Button";
import { radius, spacing, themedStyles, useTheme } from "../../../lib/theme";

// Invite hub for a list, reached from the Share button. Three paths:
//   - Friends on Forked: multi-select from your general friends list, one
//     tap adds them all server-side + push-notifies them — no link, no login.
//   - Text a number: opens the SMS composer pre-filled with the join link
//     (pick a contact via the system picker, or type the number).
//   - Share link: the general share sheet for every other channel.
export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];

  const [name, setName] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [phone, setPhone] = useState("");
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

  function toggle(userId: string) {
    if (invited.has(userId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function onInviteSelected() {
    if (!id || selected.size === 0) return;
    setInviting(true);
    setError(null);
    setFeedback(null);
    try {
      const ids = [...selected];
      const count = await inviteFriendsToCollection(id, ids);
      setInvited((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      setFeedback(`Invited ${count} ${count === 1 ? "friend" : "friends"} ✓`);
    } catch (e) {
      setError(String(e));
    } finally {
      setInviting(false);
    }
  }

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

  async function onTextNumber(number: string) {
    if (!id || !number.trim()) return;
    setError(null);
    setFeedback(null);
    try {
      await textCollectionInvite(id, name ?? "our list", number);
      setPhone("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onPickContact() {
    setError(null);
    try {
      const picked = await pickContactPhone();
      if (picked) await onTextNumber(picked.phone);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: "Invite" }} />

      <Text style={styles.heading}>
        {name ? `Invite people to "${name}"` : "Invite people"}
      </Text>

      {feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* --- Friends on Forked: multi-select from the general list --- */}
      <Text style={styles.sectionTitle}>Friends on Forked</Text>
      {friends === null ? (
        <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
      ) : friends.length === 0 ? (
        <>
          <Text style={styles.help}>
            No friends yet — add some once and inviting becomes one tap.
          </Text>
          <Button
            label="Go to Friends"
            variant="outline"
            onPress={() => router.push("/friends")}
          />
        </>
      ) : (
        <>
          {friends.map((f) => {
            const done = invited.has(f.userId);
            const on = selected.has(f.userId);
            return (
              <Pressable
                key={f.userId}
                style={[styles.row, on && styles.rowSelected]}
                onPress={() => toggle(f.userId)}
                disabled={done}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: done }}
                accessibilityLabel={`Invite ${f.displayName ?? "friend"}`}
              >
                <Text style={[styles.check, on && styles.checkOn]}>
                  {done ? "✓" : on ? "●" : "○"}
                </Text>
                <Text style={[styles.rowName, done && styles.rowNameDone]}>
                  {f.displayName ?? "Unnamed friend"}
                </Text>
                {done ? <Text style={styles.invitedText}>Invited</Text> : null}
              </Pressable>
            );
          })}
          {selected.size > 0 ? (
            <Button
              label={`Invite ${selected.size} ${selected.size === 1 ? "friend" : "friends"}`}
              loading={inviting}
              onPress={onInviteSelected}
            />
          ) : null}
        </>
      )}

      {/* --- Text the link to a number --- */}
      <Text style={styles.sectionTitle}>Text the link</Text>
      {Platform.OS !== "web" ? (
        <Button
          label="📱 Pick from contacts"
          variant="outline"
          onPress={onPickContact}
        />
      ) : null}
      <View style={styles.phoneRow}>
        <TextField
          style={styles.phoneInput}
          placeholder="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          onSubmitEditing={() => onTextNumber(phone)}
          returnKeyType="send"
        />
        <Button
          label="Text link"
          disabled={!phone.trim()}
          onPress={() => onTextNumber(phone)}
        />
      </View>

      {/* --- Everything else --- */}
      <Text style={styles.sectionTitle}>Or share anywhere</Text>
      <Button label="📤 Share invite link" variant="outline" onPress={onShareLink} />
      <Text style={styles.help}>
        Anyone with the link can join and vote — no account needed.
      </Text>
    </ScreenContainer>
  );
}

const themed = themedStyles((colors, type) => ({
  heading: { ...type.heading, marginBottom: spacing.sm },
  sectionTitle: { ...type.label, marginTop: spacing.base, marginBottom: spacing.xs },
  help: { ...type.caption, color: colors.inkSecondary, marginTop: spacing.xs },
  feedback: { ...type.body, color: colors.yes },
  error: { color: colors.pass },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  check: { ...type.subtitle, color: colors.inkTertiary, width: 22, textAlign: "center" },
  checkOn: { color: colors.primary },
  rowName: { ...type.subtitle, flex: 1 },
  rowNameDone: { color: colors.inkTertiary },
  invitedText: { ...type.caption, color: colors.yes, fontWeight: "600" },
  phoneRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  phoneInput: { flex: 1 },
}));
