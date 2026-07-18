import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  isUniqueViolation,
  removeRestaurantFromCollection,
  saveRestaurantToCollection,
  updateRestaurantDetails,
  type Restaurant,
} from "../lib/db";
import {
  getPlaceDetails,
  searchPlaces,
  type PlaceSearchResult,
} from "../lib/places";
import { matchSocialLink, resolveSocialPost } from "../lib/socialImport";
import { getCurrentLocation } from "../lib/location";
import { shareRestaurant } from "../lib/invite";
import { buildMapsUrl } from "../lib/maps";
import { isOpenNow } from "../lib/hours";
import { logEvent } from "../lib/analytics";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { RestaurantPhoto } from "./RestaurantPhoto";
import { RestaurantTags } from "./RestaurantTags";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface RestaurantSheetProps {
  restaurant: Restaurant | null; // null = closed
  // Collection this sheet was opened from — needed by the fix-details flow to
  // relink when the matched place already exists as another (deduped) row.
  collectionId?: string;
  onClose: () => void;
  // Fired after fix-details rewrites/relinks the restaurant, with the row that
  // now represents it, so the parent list can refresh.
  onChanged?: (updated: Restaurant) => void;
}

// Tap-a-restaurant detail view: photo, tags, contact info, directions, and a
// share button for sending one spot (not the whole collection) to a friend.
// A Modal "sheet" rather than a route so it works identically from any list.
// Restaurants saved from a post keep a clickable link to the original; ones
// saved without a Google match (bare link / free text) get a fix-details flow
// that matches them to a real place and fills in the full formatting.
export function RestaurantSheet({
  restaurant,
  collectionId,
  onClose,
  onChanged,
}: RestaurantSheetProps) {
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixQuery, setFixQuery] = useState("");
  const [fixResults, setFixResults] = useState<PlaceSearchResult[]>([]);
  const [fixBusy, setFixBusy] = useState(false);

  // The sheet stays mounted across different restaurants — reset per spot.
  useEffect(() => {
    setFeedback(null);
    setError(null);
    setFixOpen(false);
    setFixQuery("");
    setFixResults([]);
  }, [restaurant?.id]);

  if (!restaurant) return null;
  const r = restaurant;
  const needsDetails = !r.google_place_id;
  const nameIsUrl = /^https?:\/\//i.test(r.name.trim());

  async function onShare() {
    setFeedback(null);
    const outcome = await shareRestaurant(r);
    if (outcome === "copied") setFeedback("Copied to clipboard ✓");
  }

  function onDirections() {
    logEvent("directions_opened", { restaurant_id: r.id });
    Linking.openURL(buildMapsUrl(r)).catch(() => {});
  }

  function onOpenSource() {
    if (!r.source_url) return;
    logEvent("source_post_opened", {
      restaurant_id: r.id,
      source_platform: r.source_platform,
    });
    Linking.openURL(r.source_url).catch(() => {});
  }

  // Open the fix flow pre-loaded: pull the post caption when we have a post
  // (or the "name" is itself a pasted link), search Places with it, and show
  // tappable matches. The query field stays editable for corrections.
  async function onStartFix() {
    setFixOpen(true);
    setFixBusy(true);
    setError(null);
    try {
      let query = nameIsUrl ? "" : r.name;
      const postUrl =
        r.source_url ?? (nameIsUrl ? matchSocialLink(r.name)?.url ?? null : null);
      if (postUrl) {
        try {
          const info = await resolveSocialPost(postUrl);
          if (info.suggestedQuery) query = info.suggestedQuery;
        } catch {
          // caption unavailable — fall through to whatever query we have
        }
      }
      setFixQuery(query);
      if (query) {
        const loc = await getCurrentLocation();
        setFixResults(await searchPlaces(query, loc ?? undefined));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setFixBusy(false);
    }
  }

  async function onFixSearch() {
    if (!fixQuery.trim()) return;
    setFixBusy(true);
    setError(null);
    try {
      const loc = await getCurrentLocation();
      setFixResults(await searchPlaces(fixQuery.trim(), loc ?? undefined));
    } catch (e) {
      setError(String(e));
    } finally {
      setFixBusy(false);
    }
  }

  async function onPickFix(match: PlaceSearchResult) {
    setFixBusy(true);
    setError(null);
    try {
      const place = await getPlaceDetails(match.google_place_id);
      let updated: Restaurant;
      try {
        updated = await updateRestaurantDetails(r.id, place);
      } catch (e) {
        // The matched place already exists as another (deduped) row: link
        // that row into this collection and drop the unresolved one.
        if (collectionId && isUniqueViolation(e)) {
          updated = await saveRestaurantToCollection(
            collectionId,
            place,
            r.source_url ? "social_import" : "search",
            r.source_url && r.source_platform
              ? { source_url: r.source_url, source_platform: r.source_platform }
              : undefined,
          );
          await removeRestaurantFromCollection(collectionId, r.id);
        } else {
          throw e;
        }
      }
      setFixOpen(false);
      setFixResults([]);
      setFeedback("Details filled in ✓");
      onChanged?.(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setFixBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close restaurant details"
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {r.photo_name ? (
              <RestaurantPhoto photoName={r.photo_name} variant="hero" />
            ) : null}
            <Text style={styles.name} accessibilityRole="header">
              {r.name}
            </Text>
            <RestaurantTags
              cuisine={r.cuisine}
              priceLevel={r.price_level}
              rating={r.rating}
              ratingCount={r.rating_count}
              openNow={isOpenNow(r.hours, r.utc_offset_minutes)}
            />
            {r.address ? <Text style={styles.detail}>{r.address}</Text> : null}
            {r.phone ? <Text style={styles.detail}>📞 {r.phone}</Text> : null}
            {r.website ? (
              <Pressable
                onPress={() => Linking.openURL(r.website!).catch(() => {})}
                accessibilityRole="link"
                accessibilityLabel={`Open website for ${r.name}`}
              >
                <Text style={styles.link} numberOfLines={1}>
                  {r.website}
                </Text>
              </Pressable>
            ) : null}
            {r.source_url ? (
              <Pressable
                onPress={onOpenSource}
                accessibilityRole="link"
                accessibilityLabel="Open the original post this spot was saved from"
              >
                <Text style={styles.link} numberOfLines={1}>
                  {r.source_platform === "tiktok"
                    ? "▶️ View the TikTok post"
                    : r.source_platform === "instagram"
                      ? "📷 View the Instagram post"
                      : "🔗 View the original post"}
                </Text>
              </Pressable>
            ) : null}

            {needsDetails ? (
              <View style={styles.fixBox}>
                <Text style={styles.fixTitle}>
                  Not matched to a real restaurant yet
                </Text>
                {!fixOpen ? (
                  <Button
                    label="Find & fill details"
                    variant="outline"
                    onPress={onStartFix}
                  />
                ) : (
                  <>
                    {fixBusy ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : null}
                    <View style={styles.fixRow}>
                      <TextField
                        style={styles.fixInput}
                        placeholder="Restaurant name"
                        value={fixQuery}
                        onChangeText={setFixQuery}
                        onSubmitEditing={onFixSearch}
                        returnKeyType="search"
                      />
                      <Button label="Go" loading={fixBusy} onPress={onFixSearch} />
                    </View>
                    {fixResults.map((match) => (
                      <Pressable
                        key={match.google_place_id}
                        style={styles.fixResult}
                        onPress={() => onPickFix(match)}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${match.name} for this spot`}
                      >
                        <Text style={styles.fixResultName}>{match.name}</Text>
                        {match.address ? (
                          <Text style={styles.fixResultSub} numberOfLines={1}>
                            {match.address}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            ) : null}

            {feedback ? (
              <Text style={styles.feedback} accessibilityLiveRegion="polite">
                {feedback}
              </Text>
            ) : null}
            {error ? (
              <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Button label="Get directions" flex onPress={onDirections} />
              <Button label="Share" variant="outline" flex onPress={onShare} />
            </View>
            <Button label="Close" variant="dark" onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const themed = themedStyles((colors, type) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end" as const,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "88%" as const,
    boxShadow: shadow.raised,
  },
  content: { padding: spacing.lg, gap: spacing.md },
  name: { ...type.heading, fontSize: 26 },
  detail: { ...type.body, color: colors.inkSecondary },
  link: { ...type.body, color: colors.primary },
  feedback: { ...type.body, color: colors.yes, textAlign: "center" as const },
  errorText: { ...type.body, color: colors.pass, textAlign: "center" as const },
  actions: { flexDirection: "row" as const, gap: spacing.sm, marginTop: spacing.sm },
  fixBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fixTitle: { ...type.label },
  fixRow: { flexDirection: "row" as const, gap: spacing.sm },
  fixInput: { flex: 1 },
  fixResult: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  fixResultName: { ...type.subtitle },
  fixResultSub: { ...type.caption },
}));
