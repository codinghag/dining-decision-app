import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import {
  addFriend,
  getContactEmails,
  listFriends,
  matchContacts,
  removeFriend,
  suggestedFriends,
  type ContactMatch,
  type Friend,
} from "../lib/friends";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

// Friends hub: see your friends, and add new ones three ways —
//   1. from your phone contacts (native only; emails matched server-side,
//      never stored),
//   2. by exact email,
//   3. from people you already share a list with (zero-permission source).
// Friends can then be invited into lists in-app (see collection invite
// screen) instead of only via a texted link.
export default function FriendsScreen() {
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [suggested, setSuggested] = useState<Friend[]>([]);
  const [email, setEmail] = useState("");
  const [emailMatch, setEmailMatch] = useState<ContactMatch | null>(null);
  const [emailMiss, setEmailMiss] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [f, s] = await Promise.all([listFriends(), suggestedFriends()]);
      setFriends(f);
      setSuggested(s);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onAdd(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await addFriend(userId);
      setEmailMatch(null);
      setEmail("");
      setContactMatches((prev) =>
        prev ? prev.filter((m) => m.userId !== userId) : prev,
      );
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await removeFriend(userId);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLookupEmail() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setBusy(true);
    setError(null);
    setEmailMatch(null);
    setEmailMiss(false);
    try {
      const matches = await matchContacts([e]);
      if (matches.length > 0) setEmailMatch(matches[0]);
      else setEmailMiss(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFindFromContacts() {
    setBusy(true);
    setError(null);
    try {
      const emails = await getContactEmails();
      if (emails === null) {
        setError("Contacts permission was denied — you can still add friends by email.");
        return;
      }
      if (emails.length === 0) {
        setContactMatches([]);
        return;
      }
      const friendIds = new Set((friends ?? []).map((f) => f.userId));
      const matches = (await matchContacts(emails)).filter(
        (m) => !friendIds.has(m.userId),
      );
      setContactMatches(matches);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function personRow(
    userId: string,
    label: string,
    sub: string | null,
    action: "add" | "remove",
  ) {
    return (
      <View key={userId} style={styles.row}>
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{label}</Text>
          {sub ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        {action === "add" ? (
          <Button label="Add" onPress={() => onAdd(userId)} />
        ) : (
          <Pressable
            onPress={() => onRemove(userId)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label} from your friends`}
          >
            <Text style={styles.removeLink}>Remove</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: "Friends" }} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.primary} /> : null}

      {/* --- Your friends --- */}
      <Text style={styles.sectionTitle}>Your friends</Text>
      {friends === null ? (
        <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
      ) : friends.length === 0 ? (
        <EmptyState message="No friends yet. Add them below — then you can invite them to lists right in the app." />
      ) : (
        friends.map((f) =>
          personRow(f.userId, f.displayName ?? "Unnamed friend", null, "remove"),
        )
      )}

      {/* --- Find from contacts (native only) --- */}
      {Platform.OS !== "web" ? (
        <>
          <Text style={styles.sectionTitle}>From your contacts</Text>
          <Text style={styles.help}>
            We check which of your contacts' emails are on Forked. Emails are
            matched once and never stored.
          </Text>
          <Button
            label="Find friends from contacts"
            variant="outline"
            loading={busy && contactMatches === null}
            onPress={onFindFromContacts}
          />
          {contactMatches !== null && contactMatches.length === 0 ? (
            <Text style={styles.help}>
              None of your contacts are on Forked yet — share a list link to
              get them in.
            </Text>
          ) : null}
          {(contactMatches ?? []).map((m) =>
            personRow(m.userId, m.displayName ?? m.email, m.email, "add"),
          )}
        </>
      ) : null}

      {/* --- Add by email --- */}
      <Text style={styles.sectionTitle}>Add by email</Text>
      <View style={styles.searchRow}>
        <TextField
          style={styles.searchInput}
          placeholder="friend@example.com"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailMatch(null);
            setEmailMiss(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onSubmitEditing={onLookupEmail}
          returnKeyType="search"
        />
        <Button label="Find" loading={busy} disabled={!email.trim()} onPress={onLookupEmail} />
      </View>
      {emailMatch
        ? personRow(
            emailMatch.userId,
            emailMatch.displayName ?? emailMatch.email,
            emailMatch.email,
            "add",
          )
        : null}
      {emailMiss ? (
        <Text style={styles.help}>
          No Forked account with that email yet — share a list link with them
          instead.
        </Text>
      ) : null}

      {/* --- People from your groups --- */}
      {suggested.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>From your groups</Text>
          {suggested.map((s) =>
            personRow(s.userId, s.displayName ?? "Unnamed member", null, "add"),
          )}
        </>
      ) : null}
    </ScreenContainer>
  );
}

const themed = themedStyles((colors, type) => ({
  sectionTitle: { ...type.label, marginTop: spacing.base },
  help: { ...type.caption, color: colors.inkSecondary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  rowBody: { flex: 1, gap: 2 },
  rowName: { ...type.subtitle },
  rowSub: { ...type.caption },
  removeLink: { ...type.caption, color: colors.pass, fontWeight: "600" },
  searchRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  searchInput: { flex: 1 },
  error: { color: colors.pass },
}));
