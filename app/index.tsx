import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { createCollection, listCollections, type Collection } from "../lib/db";

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
    <View style={styles.container}>
      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="New collection name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={onCreate}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.button, creating && styles.buttonDisabled]}
          onPress={onCreate}
          disabled={creating}
        >
          <Text style={styles.buttonText}>{creating ? "…" : "Create"}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No collections yet. Create one above to get started.
            </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  createRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  list: { paddingTop: 16, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    backgroundColor: "#fafafa",
  },
  rowTitle: { fontSize: 16, fontWeight: "500" },
  rowChevron: { fontSize: 22, color: "#bbb" },
  empty: { color: "#888", textAlign: "center", marginTop: 32 },
  error: { color: "#c00", marginTop: 8 },
});
