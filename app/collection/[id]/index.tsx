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
  ensureRestaurant,
  getCollection,
  listCollectionRestaurants,
  removeRestaurantFromCollection,
  type Collection,
  type Restaurant,
} from "../../../lib/db";
import { shareRestaurant } from "../../../lib/invite";
import { RestaurantSheet } from "../../../components/RestaurantSheet";
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

  // Share a single restaurant (name + address + a Maps link) — clipboard
  // fallback (web without the Web Share API) is invisible, so say so.
  async function onShareRestaurant(r: Restaurant) {
    setFeedback(null);
    const outcome = await shareRestaurant(r);
    if (outcome === "copied") setFeedback("Copied to clipboard ✓");
  }

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

      <Text style={styles.listName}>
        {capitalizeFirst(collection?.name ?? "List")}
      </Text>

      {feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

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
                {item.photo_name ? (
                  <RestaurantPhoto photoName={item.photo_name} variant="thumb" />
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
                        onPress={() => onShareRestaurant(item)}
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
  listName: { ...type.heading, marginTop: spacing.sm },
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
