import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import {
  Link,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import {
  deleteCollection,
  ensureRestaurant,
  getCollection,
  listCollectionRestaurants,
  moveRestaurantToCollection,
  removeRestaurantFromCollection,
  renameCollection,
  type Collection,
  type Restaurant,
} from "../../../lib/db";
import { MoveToListSheet } from "../../../components/MoveToListSheet";
import { RestaurantSheet } from "../../../components/RestaurantSheet";
import { ShareRestaurantSheet } from "../../../components/ShareRestaurantSheet";
import { startDecideSession } from "../../../lib/decide";
import { getCurrentLocation, type Coords } from "../../../lib/location";
import { pickWildcardPlace } from "../../../lib/wildcard";
import { isOpenNow } from "../../../lib/hours";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { RestaurantTags } from "../../../components/RestaurantTags";
import { RestaurantPhoto } from "../../../components/RestaurantPhoto";
import { TextField } from "../../../components/TextField";
import { radius, spacing, themedStyles, useTheme } from "../../../lib/theme";

// Display-only — capitalizes just the first letter, unlike CSS
// textTransform:"capitalize" which would capitalize every word.
function capitalizeFirst(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [collection, setCollection] = useState<Collection | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [restaurantToRemove, setRestaurantToRemove] = useState<Restaurant | null>(null);
  const [removing, setRemoving] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [wildcard, setWildcard] = useState(false);
  const [location, setLocation] = useState<Coords | null>(null);
  const [editingListName, setEditingListName] = useState(false);
  const [listNameInput, setListNameInput] = useState("");
  const [savingListName, setSavingListName] = useState(false);
  const [confirmingDeleteList, setConfirmingDeleteList] = useState(false);
  const [deletingList, setDeletingList] = useState(false);
  const [restaurantToMove, setRestaurantToMove] = useState<Restaurant | null>(null);
  const [moving, setMoving] = useState(false);
  const [restaurantToShare, setRestaurantToShare] = useState<Restaurant | null>(null);
  useEffect(() => {
    getCurrentLocation().then(setLocation);
  }, []);

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

  async function onDecide() {
    if (!id) return;
    setDeciding(true);
    setError(null);
    try {
      let wildcardRestaurantId: string | undefined;
      if (wildcard && location) {
        // Best-effort -- a failed/empty wildcard just starts the session
        // without one, never blocks deciding.
        try {
          const excluded = restaurants
            .map((r) => r.google_place_id)
            .filter((x): x is string => !!x);
          const place = await pickWildcardPlace(location, excluded);
          if (place) {
            const row = await ensureRestaurant(place);
            wildcardRestaurantId = row.id;
          }
        } catch {
          // ignore -- proceed without a wildcard
        }
      }
      const { session } = await startDecideSession(id, { wildcardRestaurantId });
      router.push(`/collection/${id}/decide/${session.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setDeciding(false);
    }
  }

  async function onConfirmRemove() {
    if (!id || !restaurantToRemove) return;
    setRemoving(true);
    setError(null);
    try {
      await removeRestaurantFromCollection(id, restaurantToRemove.id);
      setRestaurantToRemove(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setRemoving(false);
    }
  }

  async function onMovePick(targetCollectionId: string) {
    if (!id || !restaurantToMove) return;
    setMoving(true);
    setError(null);
    try {
      await moveRestaurantToCollection(id, targetCollectionId, restaurantToMove.id);
      setRestaurantToMove(null);
      setFeedback(`Moved to another list ✓`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setMoving(false);
    }
  }

  async function onSaveListName() {
    const trimmed = listNameInput.trim();
    if (!id || !trimmed) return;
    setSavingListName(true);
    setError(null);
    try {
      await renameCollection(id, trimmed);
      setCollection((c) => (c ? { ...c, name: trimmed } : c));
      setEditingListName(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingListName(false);
    }
  }

  async function onConfirmDeleteList() {
    if (!id) return;
    setDeletingList(true);
    setError(null);
    try {
      await deleteCollection(id);
      router.replace("/");
    } catch (e) {
      setError(String(e));
      setDeletingList(false);
    }
  }

  const hasRestaurants = restaurants.length > 0;

  return (
    <ScreenContainer>
      {/* title is metadata only (browser tab / task switcher) — the header
          itself is just the default back arrow + centered Forked mark; the
          list's name is shown in the body below instead (see listName). */}
      <Stack.Screen options={{ title: collection?.name ?? "List" }} />

      <ConfirmDialog
        visible={!!restaurantToRemove}
        title="Remove this restaurant?"
        message={`"${restaurantToRemove?.name}" will be removed from this list.`}
        confirmLabel="Remove"
        destructive
        loading={removing}
        onConfirm={onConfirmRemove}
        onCancel={() => setRestaurantToRemove(null)}
      />

      <ConfirmDialog
        visible={confirmingDeleteList}
        title="Delete this list?"
        message={`"${collection?.name ?? "This list"}" and all its saved spots will be deleted for everyone. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deletingList}
        onConfirm={onConfirmDeleteList}
        onCancel={() => setConfirmingDeleteList(false)}
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

      <View style={styles.subRow}>
        <Pressable
          style={[styles.wildcardChip, wildcard && styles.wildcardChipActive]}
          onPress={() => setWildcard((w) => !w)}
          hitSlop={8}
          accessibilityRole="switch"
          accessibilityLabel="Add a wildcard restaurant to the next decision"
          accessibilityState={{ checked: wildcard }}
        >
          <Text style={[styles.wildcardText, wildcard && styles.wildcardTextActive]}>
            🎲 {wildcard ? "Wildcard on" : "Add a wildcard"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/collection/${id}/stats`)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="View group stats"
        >
          <Text style={styles.statsLinkText}>📊 Group stats</Text>
        </Pressable>
      </View>
      {wildcard ? (
        <Text style={styles.wildcardHint}>
          A surprise nearby spot will join the deck when you decide.
        </Text>
      ) : null}

      {editingListName ? (
        <View style={styles.listNameEditRow}>
          <TextField
            style={styles.input}
            value={listNameInput}
            onChangeText={setListNameInput}
            onSubmitEditing={onSaveListName}
            returnKeyType="done"
            autoFocus
          />
          <Button
            label="Save"
            loading={savingListName}
            onPress={onSaveListName}
            disabled={!listNameInput.trim()}
          />
          <Button label="Cancel" variant="outline" onPress={() => setEditingListName(false)} />
        </View>
      ) : (
        <View style={styles.listNameRow}>
          <Text style={styles.listName}>
            {collection?.is_general ? "⚡ " : ""}
            {capitalizeFirst(collection?.name ?? "List")}
          </Text>
          <Pressable
            onPress={() => {
              setListNameInput(collection?.name ?? "");
              setEditingListName(true);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Rename this list"
          >
            <Text style={styles.listNameAction}>Rename</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/collection/${id}/invite`)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Share this list"
          >
            <Text style={styles.listNameAction}>Share</Text>
          </Pressable>
          <Pressable
            onPress={() => setConfirmingDeleteList(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Delete this list"
          >
            <Text style={[styles.listNameAction, styles.listNameDelete]}>Delete</Text>
          </Pressable>
        </View>
      )}

      {feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <MoveToListSheet
        visible={!!restaurantToMove}
        restaurantName={restaurantToMove?.name ?? ""}
        excludeCollectionId={id ?? ""}
        moving={moving}
        onPick={onMovePick}
        onClose={() => setRestaurantToMove(null)}
      />

      <ShareRestaurantSheet
        restaurant={restaurantToShare}
        onClose={() => setRestaurantToShare(null)}
      />

      <RestaurantSheet
        restaurant={selectedRestaurant}
        collectionId={id}
        onChanged={(updated) => {
          setSelectedRestaurant(updated);
          load();
        }}
        onClose={() => setSelectedRestaurant(null)}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState message="No restaurants yet. Add one to build this list." />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedRestaurant(item)}
              accessibilityRole="button"
              accessibilityLabel={`View details for ${item.name}`}
            >
              <Card elevated>
                <View style={styles.cardRow}>
                {item.photo_name || item.source_image_url ? (
                  <RestaurantPhoto
                    photoName={item.photo_name}
                    fallbackUri={item.source_image_url}
                    variant="thumb"
                  />
                ) : null}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.name}</Text>
                    <View style={styles.cardActions}>
                      <Pressable
                        onPress={() => setRestaurantToRemove(item)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name} from this list`}
                      >
                        <Text style={styles.cardRemove}>Remove</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setRestaurantToMove(item)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${item.name} to another list`}
                      >
                        <Text style={styles.cardShare}>Move</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setRestaurantToShare(item)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Share ${item.name}`}
                      >
                        <Text style={styles.cardShare}>Share</Text>
                      </Pressable>
                    </View>
                  </View>
                  <RestaurantTags
                    cuisine={item.cuisine}
                    priceLevel={item.price_level}
                    rating={item.rating}
                    ratingCount={item.rating_count}
                    openNow={isOpenNow(item.hours, item.utc_offset_minutes)}
                  />
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
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}

const themed = themedStyles((colors, type) => ({
  topRow: { flexDirection: "row", gap: spacing.sm },
  listName: { ...type.heading, flexShrink: 1 },
  listNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  listNameEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  listNameAction: { ...type.label, color: colors.primary },
  listNameDelete: { color: colors.pass },
  input: { flex: 1 },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  wildcardChip: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  wildcardChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  wildcardText: { ...type.label, color: colors.inkSecondary },
  wildcardTextActive: { color: colors.primaryDark },
  wildcardHint: { ...type.caption, color: colors.inkTertiary, paddingTop: spacing.xs },
  statsLinkText: { ...type.label, color: colors.primary },
  list: { paddingTop: spacing.base, gap: spacing.sm },
  cardRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  cardBody: { flex: 1, gap: spacing.xs },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  cardTitle: { ...type.subtitle, flex: 1 },
  cardActions: { alignItems: "flex-end", gap: 4 },
  cardRemove: { ...type.label, color: colors.pass },
  cardShare: { ...type.label, color: colors.primary },
  cardSub: { ...type.body, color: colors.inkSecondary },
  cardMetaRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginTop: spacing.xs },
  cardMeta: { ...type.caption },
  feedback: { ...type.body, color: colors.yes, marginTop: spacing.sm },
  error: { color: colors.pass, marginTop: spacing.sm },
}));
