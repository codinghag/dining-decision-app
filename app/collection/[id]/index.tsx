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
  useRouter,
} from "expo-router";
import {
  getCollection,
  listCollectionRestaurants,
  type Collection,
  type Restaurant,
} from "../../../lib/db";
import { shareCollectionInvite } from "../../../lib/invite";
import { startDecideSession } from "../../../lib/decide";

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

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

  async function onShare() {
    if (!id || !collection) return;
    try {
      await shareCollectionInvite(id, collection.name);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onDecide() {
    if (!id) return;
    setDeciding(true);
    setError(null);
    try {
      const { session } = await startDecideSession(id);
      router.push(`/collection/${id}/decide/${session.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeciding(false);
    }
  }

  const hasRestaurants = restaurants.length > 0;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: collection?.name ?? "Collection",
          headerRight: () => (
            <Pressable onPress={onShare} hitSlop={12}>
              <Text style={styles.headerShare}>Share</Text>
            </Pressable>
          ),
        }}
      />

      <View style={styles.topRow}>
        <Link href={`/collection/${id}/add`} asChild>
          <Pressable style={[styles.addButton, styles.flex1]}>
            <Text style={styles.addButtonText}>+ Add Restaurant</Text>
          </Pressable>
        </Link>
        <Pressable
          style={[
            styles.decideButton,
            styles.flex1,
            (!hasRestaurants || deciding) && styles.buttonDisabled,
          ]}
          onPress={onDecide}
          disabled={!hasRestaurants || deciding}
        >
          <Text style={styles.decideButtonText}>
            {deciding ? "Starting…" : "Let's Decide"}
          </Text>
        </Pressable>
      </View>

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
  topRow: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  addButton: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  decideButton: {
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  decideButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.4 },
  headerShare: { color: "#1f6feb", fontWeight: "600", fontSize: 16 },
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
