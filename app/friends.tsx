import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import {
  addFriend,
  getContactInfo,
  listFriends,
  matchContacts,
  removeFriend,
  suggestedFriends,
  type ContactMatch,
  type Friend,
} from "../lib/friends";
import { clearMyPhone, getMyPhone, setMyPhone } from "../lib/profile";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

// Friends hub: see your friends, and add new ones several ways —
//   1. from your phone contacts (native only; emails + phone numbers matched
//      server-side, never stored),
//   2. by exact email or phone number,
//   3. from people you already share a list with (zero-permission source).
// A phone number is only matchable if the OTHER person has set one on their
// own profile below — it's opt-in, same as this screen lets you set yours.
// Friends can then be invited into lists in-app (see collection invite
// screen) instead of only via a texted link.
export default function FriendsScreen() {
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];

  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [suggested, setSuggested] = useState<Friend[]>([]);
  const [myPhone, setMyPhoneState] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [email, setEmail] = useState("");
  const [emailMatch, setEmailMatch] = useState<ContactMatch | null>(null);
  const [emailMiss, setEmailMiss] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [phoneMatch, setPhoneMatch] = useState<ContactMatch | null>(null);
  const [phoneMiss, setPhoneMiss] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [f, s, p] = await Promise.all([
        listFriends(),
        suggestedFriends(),
        getMyPhone(),
      ]);
      setFriends(f);
      setSuggested(s);
      setMyPhoneState(p);
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
      setPhoneMatch(null);
      setLookupPhone("");
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

  async function onSavePhone() {
    if (!phoneInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await setMyPhone(phoneInput.trim());
      setEditingPhone(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhone() {
    setBusy(true);
    setError(null);
    try {
      await clearMyPhone();
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
      const matches = await matchContacts({ emails: [e] });
      if (matches.length > 0) setEmailMatch(matches[0]);
      else setEmailMiss(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onLookupPhone() {
    if (!lookupPhone.trim()) return;
    setBusy(true);
    setError(null);
    setPhoneMatch(null);
    setPhoneMiss(false);
    try {
      const matches = await matchContacts({ phones: [lookupPhone.trim()] });
      if (matches.length > 0) setPhoneMatch(matches[0]);
      else setPhoneMiss(true);
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
      const info = await getContactInfo();
      if (info === null) {
        setError("Contacts permission was denied — you can still add friends by email or phone.");
        return;
      }
      if (info.emails.length === 0 && info.phones.length === 0) {
        setContactMatches([]);
        return;
      }
      const friendIds = new Set((friends ?? []).map((f) => f.userId));
      const matches = (
        await matchContacts({ emails: info.emails, phones: info.phones })
      ).filter((m) => !friendIds.has(m.userId));
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

      {/* --- Your own phone number, so others can find you --- */}
      <Text style={styles.sectionTitle}>So friends can find you by phone</Text>
      {editingPhone ? (
        <View style={styles.searchRow}>
          <TextField
            style={styles.searchInput}
            placeholder="Your phone number"
            value={phoneInput}
            onChangeText={setPhoneInput}
            keyboardType="phone-pad"
            onSubmitEditing={onSavePhone}
            returnKeyType="done"
            autoFocus
          />
          <Button label="Save" loading={busy} disabled={!phoneInput.trim()} onPress={onSavePhone} />
        </View>
      ) : myPhone ? (
        <View style={styles.row}>
          <Text style={styles.rowName}>{myPhone}</Text>
          <Pressable
            onPress={onRemovePhone}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Remove your phone number"
          >
            <Text style={styles.removeLink}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <Button
          label="Add your phone number"
          variant="outline"
          onPress={() => {
            setPhoneInput("");
            setEditingPhone(true);
          }}
        />
      )}
      <Text style={styles.help}>
        Optional — only used so contacts who search for your number can find
        you. Never shown to anyone until you're friends.
      </Text>

      {/* --- Find from contacts (native only) --- */}
      {Platform.OS !== "web" ? (
        <>
          <Text style={styles.sectionTitle}>From your contacts</Text>
          <Text style={styles.help}>
            We check which of your contacts' emails and phone numbers are on
            Forked. Nothing is matched more than once or stored.
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
            personRow(
              m.userId,
              m.displayName ?? m.email ?? m.phone ?? "Forked user",
              m.email ?? m.phone,
              "add",
            ),
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
            emailMatch.displayName ?? emailMatch.email ?? "Forked user",
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

      {/* --- Add by phone number --- */}
      <Text style={styles.sectionTitle}>Add by phone number</Text>
      <View style={styles.searchRow}>
        <TextField
          style={styles.searchInput}
          placeholder="Their phone number"
          value={lookupPhone}
          onChangeText={(t) => {
            setLookupPhone(t);
            setPhoneMatch(null);
            setPhoneMiss(false);
          }}
          keyboardType="phone-pad"
          onSubmitEditing={onLookupPhone}
          returnKeyType="search"
        />
        <Button
          label="Find"
          loading={busy}
          disabled={!lookupPhone.trim()}
          onPress={onLookupPhone}
        />
      </View>
      {phoneMatch
        ? personRow(
            phoneMatch.userId,
            phoneMatch.displayName ?? phoneMatch.phone ?? "Forked user",
            phoneMatch.phone,
            "add",
          )
        : null}
      {phoneMiss ? (
        <Text style={styles.help}>
          No Forked account has that number saved yet — text them a list link
          instead, or ask them to add their number on this screen.
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
