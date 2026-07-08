import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { createCollection, listCollections, type Collection } from "../lib/db";
import { ScreenContainer } from "../components/ScreenContainer";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { colors, radius, shadow, spacing, type } from "../lib/theme";

export default function CollectionsScreen() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await listCollections();
      setCollections(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

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
              <Pressable style={styles.row}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
});
