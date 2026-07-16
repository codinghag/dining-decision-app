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
      <View style={styles.identity}>
        {editingName || (!displayName && !loading) ? (
          <View style={styles.createRow}>
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
        ) : displayName ? (
          <Pressable
            style={styles.identityRow}
            accessibilityRole="button"
            accessibilityLabel={`Edit your name, currently ${displayName}`}
            onPress={() => {
              setNameInput(displayName);
              setEditingName(true);
            }}
          >
            <Text style={styles.identityText}>👤 {displayName}</Text>
            <Text style={styles.identityEditLink}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      {syncEmail ? (
        <View style={styles.syncRow}>
          <Text style={styles.syncTextMuted} numberOfLines={1}>
            {syncEmail}
          </Text>
          <Pressable
            onPress={() => signOut()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.syncText}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.createRow}>
        <TextField
          style={styles.input}
          placeholder="New collection name"
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
            <EmptyState message="No collections yet. Create one above to get started." />
          }
          renderItem={({ item }) => (
            <Link href={`/collection/${item.id}`} asChild>
              <Pressable
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`Open collection ${item.name}`}
              >
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowChevron} accessible={false}>
                  ›
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const themed = themedStyles((colors, type) => ({
  identity: { marginBottom: spacing.sm },
  identityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  identityText: { ...type.subtitle },
  identityEditLink: { ...type.label, color: colors.primary },
  syncRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  syncText: { ...type.label, color: colors.primary },
  syncTextMuted: { ...type.caption, color: colors.inkTertiary, flex: 1 },
  createRow: { flexDirection: "row", gap: spacing.sm },
  input: { flex: 1 },
  list: { paddingTop: spacing.base, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadow.card,
  },
  rowTitle: { ...type.subtitle },
  rowChevron: { fontSize: 22, color: colors.inkTertiary },
  error: { color: colors.pass, marginTop: spacing.sm },
}));
