import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { joinCollection, type JoinedCollection } from "../../../lib/decide";
import { getMyDisplayName, setMyDisplayName } from "../../../lib/profile";
import { Button } from "../../../components/Button";
import { TextField } from "../../../components/TextField";
import { spacing, themedStyles, useTheme } from "../../../lib/theme";

// Invite landing screen. Reached by opening a list's share link
// (/collection/<id>/join). Calls the join-collection edge function (which
// idempotently adds the visitor as a member — anonymous sessions included),
// then forwards into the normal list screen, where they have full member
// access via RLS. First-time joiners pick a display name on the way in so
// the group sees a real name next to their votes, not an anonymous id.
export default function JoinCollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinedCollection | null>(null);
  const [needsName, setNeedsName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  // Guard against double-invoking the join in React strict/dev double-render.
  const startedRef = useRef(false);

  const join = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const collection = await joinCollection(id);
      setJoined(collection);
      const existing = await getMyDisplayName();
      if (existing) {
        // Replace so the back button doesn't return to this transient screen.
        router.replace(`/collection/${id}`);
      } else {
        setNeedsName(true);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [id, router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    join();
  }, [join]);

  async function onContinue() {
    const trimmed = nameInput.trim();
    if (!trimmed || !id) return;
    setSaving(true);
    setError(null);
    try {
      await setMyDisplayName(trimmed);
      router.replace(`/collection/${id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: needsName ? "You're in" : "Joining…" }} />
      {error ? (
        <>
          <Text style={styles.icon}>😕</Text>
          <Text style={styles.error}>Couldn't join this list.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button
            label="Try again"
            onPress={() => {
              startedRef.current = false;
              setNeedsName(false);
              join();
            }}
          />
        </>
      ) : needsName ? (
        <>
          <Text style={styles.icon}>🍽️</Text>
          <Text style={styles.heading}>
            {joined ? `You're in "${joined.name}"` : "You're in"}
          </Text>
          <Text style={styles.text}>
            Pick a name so the group knows who's voting.
          </Text>
          <TextField
            style={styles.nameInput}
            placeholder="Your name"
            value={nameInput}
            onChangeText={setNameInput}
            onSubmitEditing={onContinue}
            returnKeyType="done"
            autoFocus
          />
          <Button
            label="Continue"
            loading={saving}
            disabled={!nameInput.trim()}
            onPress={onContinue}
          />
        </>
      ) : (
        <>
          <Text style={styles.icon}>🍽️</Text>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text}>
            {joined ? `Joining "${joined.name}"…` : "Joining list…"}
          </Text>
        </>
      )}
    </View>
  );
}

const themed = themedStyles((colors, type) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  icon: { fontSize: 40 },
  heading: { ...type.heading, textAlign: "center" },
  text: { ...type.body, color: colors.inkSecondary, textAlign: "center" },
  nameInput: { alignSelf: "stretch" },
  error: { ...type.heading, color: colors.pass },
  errorDetail: { ...type.caption, textAlign: "center" },
}));
