import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import {
  listSocialSaves,
  moveRestaurantToCollection,
  removeRestaurantFromCollection,
  type Restaurant,
  type SocialSave,
} from "../lib/db";
import { MoveToListSheet } from "../components/MoveToListSheet";
import { RestaurantSheet } from "../components/RestaurantSheet";
import { ShareRestaurantSheet } from "../components/ShareRestaurantSheet";
import { ScreenContainer } from "../components/ScreenContainer";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { RestaurantPhoto } from "../components/RestaurantPhoto";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

// Every restaurant saved from an Instagram/TikTok post, across all lists —
// the same Share/Remove affordances as a list detail screen, but cutting
// across lists instead of scoped to one. A spot saved from a post into two
// different lists shows up once per list, since Remove here only drops that
// one membership (matches how Remove works everywhere else in the app).
export default function SocialSavesScreen() {
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [saves, setSaves] = useState<SocialSave[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<SocialSave | null>(null);
  const [selected, setSelected] = useState<SocialSave | null>(null);
  const [toMove, setToMove] = useState<SocialSave | null>(null);
  const [moving, setMoving] = useState(false);
  const [toShare, setToShare] = useState<SocialSave | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSaves(await listSocialSaves());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onConfirmRemove() {
    if (!toRemove) return;
    try {
      await removeRestaurantFromCollection(toRemove.collectionId, toRemove.id);
      setToRemove(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onMovePick(targetCollectionId: string) {
    if (!toMove) return;
    setMoving(true);
    setError(null);
    try {
      await moveRestaurantToCollection(toMove.collectionId, targetCollectionId, toMove.id);
      setToMove(null);
      setFeedback("Moved to another list ✓");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setMoving(false);
    }
  }

  return (
    <ScreenContainer scroll={false}>
      <Stack.Screen options={{ title: "Instagram & TikTok saves" }} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {feedback ? (
        <Text style={styles.feedback} accessibilityLiveRegion="polite">
          {feedback}
        </Text>
      ) : null}

      <RestaurantSheet
        restaurant={selected as Restaurant | null}
        collectionId={selected?.collectionId}
        onChanged={() => load()}
        onClose={() => setSelected(null)}
      />

      <MoveToListSheet
        visible={!!toMove}
        restaurantName={toMove?.name ?? ""}
        excludeCollectionId={toMove?.collectionId ?? ""}
        moving={moving}
        onPick={onMovePick}
        onClose={() => setToMove(null)}
      />

      <ShareRestaurantSheet
        restaurant={toShare as Restaurant | null}
        onClose={() => setToShare(null)}
      />

      {toRemove ? (
        <Card style={styles.confirmRow}>
          <Text style={styles.confirmText}>
            Remove "{toRemove.name}" from {toRemove.collectionName}?
          </Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={() => setToRemove(null)} hitSlop={12}>
              <Text style={styles.confirmCancel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirmRemove} hitSlop={12}>
              <Text style={styles.confirmDelete}>Remove</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {saves === null ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={saves}
          keyExtractor={(item) => `${item.collectionId}:${item.id}`}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState message="Nothing saved from Instagram or TikTok yet. Paste or share a post link to get started." />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelected(item)}
              accessibilityRole="button"
              accessibilityLabel={`View details for ${item.name}`}
            >
              <Card elevated>
                <View style={styles.row}>
                  {item.photo_name || item.source_image_url ? (
                    <RestaurantPhoto
                      photoName={item.photo_name}
                      fallbackUri={item.source_image_url}
                      variant="thumb"
                    />
                  ) : null}
                  <View style={styles.body}>
                    <View style={styles.header}>
                      <Text style={styles.title}>{item.name}</Text>
                      <View style={styles.actions}>
                        <Pressable
                          onPress={() => setToRemove(item)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.name} from ${item.collectionName}`}
                        >
                          <Text style={styles.remove}>Remove</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setToMove(item)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`Move ${item.name} to another list`}
                        >
                          <Text style={styles.share}>Move</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setToShare(item)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`Share ${item.name}`}
                        >
                          <Text style={styles.share}>Share</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.badge}>
                        {item.source_platform === "tiktok" ? "▶️ TikTok" : "📷 Instagram"}
                      </Text>
                      <Text style={styles.listBadge}>in {item.collectionName}</Text>
                    </View>
                    {item.address ? <Text style={styles.sub}>{item.address}</Text> : null}
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
  list: { paddingTop: spacing.base, gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  body: { flex: 1, gap: spacing.xs },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm },
  title: { ...type.subtitle, flex: 1 },
  actions: { alignItems: "flex-end", gap: 4 },
  remove: { ...type.label, color: colors.pass },
  share: { ...type.label, color: colors.primary },
  metaRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", flexWrap: "wrap" },
  badge: { ...type.label, color: colors.primary },
  listBadge: { ...type.caption, color: colors.inkTertiary },
  sub: { ...type.body, color: colors.inkSecondary },
  error: { color: colors.pass, marginTop: spacing.sm },
  feedback: { ...type.body, color: colors.yes, marginTop: spacing.sm },
  confirmRow: { gap: spacing.sm, marginTop: spacing.sm },
  confirmText: { ...type.body },
  confirmActions: { flexDirection: "row", gap: spacing.lg },
  confirmCancel: { ...type.label, color: colors.inkSecondary },
  confirmDelete: { ...type.label, color: colors.pass },
}));
