import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Link,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  getCollection,
  listCollectionRestaurants,
  type Collection,
  type Restaurant,
} from "../../../lib/db";

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [c, r] = await Promise.all([
        getCollection(id),
        listCollectionRestaurants(id),
      ]);
      setCollection(c);
      setRestaurants(r);
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: collection?.name ?? "Collection" }} />

      <Link href={`/collection/${id}/add`} asChild>
        <Pressable style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add Restaurant</Text>
        </Pressable>
      </Link>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No restaurants yet. Add one to build this collection.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.address ? (
                <Text style={styles.cardSub}>{item.address}</Text>
              ) : null}
              <View style={styles.cardMetaRow}>
                {item.phone ? (
                  <Text style={styles.cardMeta}>{item.phone}</Text>
                ) : null}
                {item.website ? (
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.website}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  addButton: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  list: { paddingTop: 16, gap: 8 },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 14,
    backgroundColor: "#fafafa",
    gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSub: { color: "#555" },
  cardMetaRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  cardMeta: { color: "#888", fontSize: 12 },
  empty: { color: "#888", textAlign: "center", marginTop: 32 },
  error: { color: "#c00", marginTop: 8 },
});
