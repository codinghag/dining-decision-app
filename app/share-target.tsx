import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { listCollections, saveRestaurantToCollection, type Collection } from "../lib/db";
import { getPlaceDetails, resolveMapsLink, searchPlaces, type Place, type PlaceSearchResult } from "../lib/places";
import { matchSocialLink } from "../lib/socialImport";
import { getCurrentLocation, type Coords } from "../lib/location";
import { logEvent } from "../lib/analytics";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RestaurantTags } from "../components/RestaurantTags";
import { EmptyState } from "../components/EmptyState";
import { radius, spacing, themedStyles, useTheme } from "../lib/theme";

// Landing screen for the Android share-sheet target (expo-share-intent):
// share an Instagram/TikTok post — or any text/link — from another app to
// Forked and it arrives here. Flow: pick a collection, match the post to a
// real restaurant via search, save with the post kept as the source.
export default function ShareTargetScreen() {
  const { text: sharedText, title } = useLocalSearchParams<{
    text?: string;
    title?: string;
  }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];

  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [query, setQuery] = useState(typeof title === "string" ? title : "");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [resolved, setResolved] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coords | null>(null);

  const shared = typeof sharedText === "string" ? sharedText : "";
  const social = matchSocialLink(shared);
  const looksLikeMapsLink = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[^\s/]+\/maps)/i.test(shared);

  useEffect(() => {
    getCurrentLocation().then(setLocation);
    listCollections()
      .then((cs) => {
        setCollections(cs);
        // One collection: no need to ask.
        if (cs.length === 1) setCollectionId(cs[0].id);
      })
      .catch((e) => setError(String(e)));
    logEvent("share_target_opened", { social_platform: social?.platform ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Maps links carry the place — resolve directly instead of making the user
  // search for something the link already identifies.
  useEffect(() => {
    if (!looksLikeMapsLink) return;
    const url = shared.match(/https?:\/\/\S+/)?.[0];
    if (!url) return;
    setBusy(true);
    resolveMapsLink(url)
      .then(setResolved)
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looksLikeMapsLink]);

  async function onSearch() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchPlaces(query.trim(), location ?? undefined));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveResolved() {
    if (!collectionId || !resolved) return;
    await savePlace(resolved);
  }

  async function onPick(r: PlaceSearchResult) {
    if (!collectionId) return;
    setBusy(true);
    setError(null);
    try {
      const place = await getPlaceDetails(r.google_place_id);
      await savePlace(place);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  async function savePlace(place: Place) {
    if (!collectionId) return;
    setBusy(true);
    setError(null);
    try {
      await saveRestaurantToCollection(
        collectionId,
        place,
        "social_import",
        social ? { source_url: social.url, source_platform: social.platform } : undefined,
      );
      router.replace(`/collection/${collectionId}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  if (collections === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Save to Forked" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Save to Forked" }} />

      {social || shared ? (
        <Card style={styles.sourceCard}>
          <Text style={styles.sourceBadge}>
            {social
              ? `${social.platform === "instagram" ? "Instagram" : "TikTok"} post`
              : "Shared link"}
          </Text>
          <Text style={styles.sourceUrl} numberOfLines={2}>
            {social?.url ?? shared}
          </Text>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator style={{ marginVertical: 8 }} color={colors.primary} /> : null}

      {collections.length === 0 ? (
        <>
          <EmptyState message="You don't have a list yet. Create one first, then share this post again." />
          <Button label="Go to your lists" onPress={() => router.replace("/")} />
        </>
      ) : !collectionId ? (
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Save to which list?</Text>
          {collections.map((c) => (
            <Pressable
              key={c.id}
              style={styles.collectionRow}
              onPress={() => setCollectionId(c.id)}
              accessibilityRole="button"
              accessibilityLabel={`Save to ${c.name}`}
            >
              <Text style={styles.collectionName}>{c.name}</Text>
              <Text style={styles.collectionMeta}>
                {c.restaurant_count === 1 ? "1 spot" : `${c.restaurant_count ?? 0} spots`}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : resolved ? (
        <View style={styles.section}>
          <Card>
            <Text style={styles.confirmTitle}>{resolved.name}</Text>
            <RestaurantTags
              cuisine={resolved.cuisine}
              priceLevel={resolved.price_level}
              rating={resolved.rating}
              ratingCount={resolved.rating_count}
            />
            {resolved.address ? <Text style={styles.confirmSub}>{resolved.address}</Text> : null}
          </Card>
          <Button label="Save to list" loading={busy} onPress={saveResolved} />
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.stepLabel}>Which restaurant is this?</Text>
          <View style={styles.searchRow}>
            <TextField
              style={styles.searchInput}
              placeholder="Search restaurant name"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={onSearch}
              returnKeyType="search"
              autoFocus
            />
            <Button label="Go" loading={busy} onPress={onSearch} />
          </View>
          {results.map((r) => (
            <Pressable
              key={r.google_place_id}
              onPress={() => onPick(r)}
              accessibilityRole="button"
              accessibilityLabel={`Save ${r.name}`}
            >
              <Card>
                <Text style={styles.confirmTitle}>{r.name}</Text>
                <RestaurantTags
                  cuisine={r.cuisine}
                  priceLevel={r.price_level}
                  rating={r.rating}
                  ratingCount={r.rating_count}
                />
                {r.address ? <Text style={styles.confirmSub}>{r.address}</Text> : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const themed = themedStyles((colors, type) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.md },
  center: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.background,
  },
  sourceCard: { gap: 2 },
  sourceBadge: { ...type.label, color: colors.primary },
  sourceUrl: { ...type.caption },
  section: { gap: spacing.md },
  stepLabel: { ...type.heading, fontSize: 20 },
  collectionRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  collectionName: { ...type.subtitle },
  collectionMeta: { ...type.caption },
  searchRow: { flexDirection: "row" as const, gap: spacing.sm },
  searchInput: { flex: 1 },
  confirmTitle: { ...type.subtitle },
  confirmSub: { ...type.body, color: colors.inkSecondary },
  error: { color: colors.pass },
}));
