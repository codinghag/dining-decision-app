import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { createCollection, listCollections, type Collection } from "../lib/db";
import { getMyDisplayName, setMyDisplayName } from "../lib/profile";
import { getAuthStatus, signOut } from "../lib/auth";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

export default function CollectionsScreen() {
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display name (for group stats / who-voted). Anonymous until set.
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [syncEmail, setSyncEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [data, myName, auth] = await Promise.all([
        listCollections(),
        getMyDisplayName(),
        getAuthStatus(),
      ]);
      setCollections(data);
      setDisplayName(myName);
      setSyncEmail(auth.email);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  async function onSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    setError(null);
    try {
      await setMyDisplayName(trimmed);
      setDisplayName(trimmed);
      setEditingName(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingName(false);
    }
  }

  // Reload whenever the screen regains focus (e.g. after creating in a detail).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const c = await createCollection(trimmed);
      setName("");
      await load();
      router.push(`/collection/${c.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer>
      {/* Editorial header: serif greeting + account line, like a menu cover. */}
      <View style={styles.header}>
        <Text style={styles.kicker}>THE TABLE IS YOURS</Text>
        <Text style={styles.greeting} accessibilityRole="header">
          {displayName ? `Hungry, ${displayName}?` : "Where to next?"}
        </Text>
        <View style={styles.accountRow}>
          {editingName || (!displayName && !loading) ? (
            <View style={styles.createRowFill}>
              <TextField
                style={styles.input}
                placeholder="Your name"
                value={nameInput}
                onChangeText={setNameInput}
                onSubmitEditing={onSaveName}
                returnKeyType="done"
                autoFocus={editingName}
              />
              <Button
                label="Save"
                loading={savingName}
                onPress={onSaveName}
                disabled={!nameInput.trim()}
              />
            </View>
          ) : (
            <>
              <Pressable
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Open your friends"
                onPress={() => router.push("/friends")}
              >
                <Text style={styles.accountLink}>👥 Friends</Text>
              </Pressable>
              {displayName ? (
                <Pressable
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit your name, currently ${displayName}`}
                  onPress={() => {
                    setNameInput(displayName);
                    setEditingName(true);
                  }}
                >
                  <Text style={styles.accountLink}>Edit name</Text>
                </Pressable>
              ) : null}
              {syncEmail ? (
                <>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {syncEmail}
                  </Text>
                  <Pressable
                    onPress={() => signOut()}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                  >
                    <Text style={styles.accountLink}>Sign out</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          )}
        </View>
      </View>

      <View style={styles.createRow}>
        <TextField
          style={styles.input}
          placeholder="Start a new list…"
          value={name}
          onChangeText={setName}
          onSubmitEditing={onCreate}
          returnKeyType="done"
        />
        <Button label="Create" loading={creating} onPress={onCreate} disabled={!name.trim()} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState message="No lists yet. Create one above to get started." />
          }
          renderItem={({ item }) => (
            <Link href={`/collection/${item.id}`} asChild>
              <Pressable
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={`Open list ${item.name}, ${item.restaurant_count ?? 0} spots`}
              >
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={styles.cardMeta}>
                    {item.restaurant_count === 1
                      ? "1 spot saved"
                      : `${item.restaurant_count ?? 0} spots saved`}
                  </Text>
                </View>
                <View style={styles.cardBadge}>
                  <Text style={styles.cardBadgeText}>{item.restaurant_count ?? 0}</Text>
                </View>
              </Pressable>
            </Link>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const themed = themedStyles((colors, type) => ({
  header: { paddingTop: spacing.sm, paddingBottom: spacing.base, gap: spacing.xs },
  kicker: { ...type.label, color: colors.accent },
  greeting: { ...type.title },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  accountEmail: { ...type.caption, flexShrink: 1 },
  accountLink: { ...type.caption, color: colors.primary, fontWeight: "600" },
  createRow: { flexDirection: "row", gap: spacing.sm },
  createRowFill: { flexDirection: "row", gap: spacing.sm, flex: 1 },
  input: { flex: 1 },
  list: { paddingTop: spacing.base, gap: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadow.card,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { ...type.heading },
  cardMeta: { ...type.caption },
  cardBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadgeText: { ...type.subtitle, color: colors.primary },
  error: { color: colors.pass, marginTop: spacing.sm },
}));
