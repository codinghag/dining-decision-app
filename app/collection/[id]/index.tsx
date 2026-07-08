import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Link,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import {
  deleteCollection,
  getCollection,
  listCollectionRestaurants,
  type Collection,
  type Restaurant,
} from "../../../lib/db";
import { getUserId } from "../../../lib/supabase";
import { shareCollectionInvite } from "../../../lib/invite";
import { startDecideSession } from "../../../lib/decide";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { RestaurantTags } from "../../../components/RestaurantTags";
import { colors, spacing, type } from "../../../lib/theme";

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      const [c, r, uid] = await Promise.all([
        getCollection(id),
        listCollectionRestaurants(id),
        getUserId(),
      ]);
      setCollection(c);
      setRestaurants(r);
      setUserId(uid);
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

  async function onConfirmDelete() {
    if (!id) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCollection(id);
      router.replace("/");
    } catch (e) {
      setError(String(e));
      setDeleting(false);
      setConfirmDeleteVisible(false);
    }
  }

  const hasRestaurants = restaurants.length > 0;
  const isOwner = !!userId && !!collection && collection.owner_id === userId;

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          title: collection?.name ?? "Collection",
          headerRight: () => (
            <View style={styles.headerActions}>
              {isOwner ? (
                <Pressable onPress={() => setConfirmDeleteVisible(true)} hitSlop={12}>
                  <Text style={styles.headerDelete}>Delete</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onShare} hitSlop={12}>
                <Text style={styles.headerShare}>Share</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      <ConfirmDialog
        visible={confirmDeleteVisible}
        title="Delete this collection?"
        message={`"${collection?.name}" and all its saved restaurants will be gone for everyone in the group. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirmDeleteVisible(false)}
      />

      <View style={styles.topRow}>
        <Link href={`/collection/${id}/add`} asChild>
          <Button label="+ Add Restaurant" flex />
        </Link>
        <Button
          label="Let's Decide"
          variant="dark"
          flex
          loading={deciding}
          disabled={!hasRestaurants}
          onPress={onDecide}
        />
      </View>

      <Pressable style={styles.statsLink} onPress={() => router.push(`/collection/${id}/stats`)}>
        <Text style={styles.statsLinkText}>📊 Group stats</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState message="No restaurants yet. Add one to build this collection." />
          }
          renderItem={({ item }) => (
            <Card elevated>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <RestaurantTags cuisine={item.cuisine} priceLevel={item.price_level} />
              {item.address ? <Text style={styles.cardSub}>{item.address}</Text> : null}
              {item.phone || item.website ? (
                <View style={styles.cardMetaRow}>
                  {item.phone ? (
                    <Text style={styles.cardMeta}>📞 {item.phone}</Text>
                  ) : null}
                  {item.website ? (
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      🌐 {item.website}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", gap: spacing.sm },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerShare: { color: colors.primary, fontWeight: "600", fontSize: 16 },
  headerDelete: { color: colors.pass, fontWeight: "600", fontSize: 16 },
  statsLink: { alignItems: "center", paddingVertical: spacing.xs },
  statsLinkText: { ...type.label, color: colors.primary },
  list: { paddingTop: spacing.base, gap: spacing.sm },
  cardTitle: { ...type.subtitle },
  cardSub: { ...type.body, color: colors.inkSecondary },
  cardMetaRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginTop: spacing.xs },
  cardMeta: { ...type.caption },
  error: { color: colors.pass, marginTop: spacing.sm },
});
