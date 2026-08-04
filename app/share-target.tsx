import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { getOrCreateGeneralCollection, saveRestaurantToCollection } from "../lib/db";
import { getPlaceDetails, resolveMapsLink, searchPlaces, type Place, type PlaceSearchResult } from "../lib/places";
import { matchSocialLink, resolveSocialPost } from "../lib/socialImport";
import { getCurrentLocation, type Coords } from "../lib/location";
import { logEvent } from "../lib/analytics";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RestaurantTags } from "../components/RestaurantTags";
import { RestaurantPhoto } from "../components/RestaurantPhoto";
import { spacing, themedStyles, useTheme } from "../lib/theme";

// Landing screen for the Android share-sheet target (expo-share-intent):
// share an Instagram/TikTok post — or any text/link — from another app to
// Forked and it arrives here. Flow: save straight to General (no "which
// list?" prompt — that's the lowest-effort moment in the whole app, so we
// don't spend it on a decision; move it to another list later via the
// existing per-row Move action), match the post to a real restaurant via
// search, save with the post kept as the source.
export default function ShareTargetScreen() {
  const { text: sharedText, title } = useLocalSearchParams<{
    text?: string;
    title?: string;
  }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];

  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [query, setQuery] = useState(typeof title === "string" ? title : "");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [resolved, setResolved] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coords | null>(null);
  // True while/after the shared post's caption is auto-matched to places, so
  // the UI can say "Is it one of these?" instead of asking for a search.
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Some apps only populate the share's title/subject, not its text body —
  // fall back to that so a link/caption there still gets parsed.
  const rawText = typeof sharedText === "string" ? sharedText.trim() : "";
  const rawTitle = typeof title === "string" ? title.trim() : "";
  const shared = rawText || rawTitle;
  const social = matchSocialLink(shared);
  const looksLikeMapsLink = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[^\s/]+\/maps)/i.test(shared);
  // Any other shared URL (e.g. a restaurant's own website): scrape its
  // og:title the same way we do for Instagram/TikTok captions, below.
  const genericLink =
    !social && !looksLikeMapsLink ? shared.match(/https?:\/\/\S+/)?.[0] ?? null : null;

  useEffect(() => {
    getCurrentLocation().then(setLocation);
    getOrCreateGeneralCollection()
      .then((general) => setCollectionId(general.id))
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

  // Instagram/TikTok links, or any other shared URL (e.g. a restaurant's own
  // website): fetch the page/post's title or caption server-side and search
  // Places with it automatically, so saving is one tap on a match instead of
  // typing the restaurant's name from memory. Best effort — any failure just
  // leaves the manual search flow.
  useEffect(() => {
    const url = social?.url ?? genericLink;
    if (!url) return;
    let cancelled = false;
    (async () => {
      setSuggesting(true);
      try {
        const info = await resolveSocialPost(url);
        if (cancelled) return;
        setImageUrl(info.imageUrl);
        if (!info.suggestedQuery) return;
        setQuery(info.suggestedQuery);
        const loc = await getCurrentLocation();
        const found = await searchPlaces(info.suggestedQuery, loc ?? undefined);
        if (cancelled) return;
        setResults(found);
        setSuggested(found.length > 0);
      } catch {
        // silent — the manual search box is the fallback
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSearch() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setSuggested(false);
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

  // Best-effort name when we can't confidently match a real Places result:
  // whatever the user has typed/been suggested, else the post/page's own
  // label, else the link's domain. Always something better than a dead end.
  function fallbackName(): string {
    if (query.trim()) return query.trim();
    const currentSocial = matchSocialLink(shared);
    if (currentSocial) {
      return `${currentSocial.platform === "instagram" ? "Instagram" : "TikTok"} post`;
    }
    const host = (genericLink ?? "").match(/^https?:\/\/(?:www\.)?([^/\s]+)/i)?.[1];
    if (host) return host;
    // No link at all — whatever raw text Instagram/the OS handed over is
    // still more useful than a generic placeholder (often the caption).
    const trimmedShared = shared.trim();
    if (trimmedShared) return trimmedShared.slice(0, 60);
    return "Shared restaurant";
  }

  // Caption/og-tag scraping is best effort and doesn't always turn up a
  // confident Places match. Rather than leaving the user stuck on "which
  // restaurant is this?" forever, let them save with a placeholder name and
  // the source link — the existing "Find & fill details" flow on the saved
  // row lets them resolve it properly later.
  async function onSaveUnmatched() {
    if (!collectionId) return;
    setBusy(true);
    setError(null);
    try {
      const place: Parameters<typeof saveRestaurantToCollection>[1] = {
        name: fallbackName(),
        address: null,
      };
      if (!social && genericLink) place.website = genericLink;
      await saveRestaurantToCollection(
        collectionId,
        place,
        "quick_add",
        social
          ? { source_url: social.url, source_platform: social.platform, source_image_url: imageUrl }
          : undefined,
      );
      router.replace(`/collection/${collectionId}`);
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
        social
          ? { source_url: social.url, source_platform: social.platform, source_image_url: imageUrl }
          : undefined,
      );
      router.replace(`/collection/${collectionId}`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  if (collectionId === null) {
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
        <Pressable
          onPress={() => {
            const url = social?.url ?? genericLink ?? shared.match(/https?:\/\/\S+/)?.[0];
            if (url) Linking.openURL(url).catch(() => {});
          }}
          accessibilityRole="link"
          accessibilityLabel="Open the original post or link"
        >
          <Card style={styles.sourceCard}>
            {imageUrl ? (
              <RestaurantPhoto photoName={null} fallbackUri={imageUrl} variant="hero" />
            ) : null}
            <Text style={styles.sourceBadge}>
              {social
                ? `${social.platform === "instagram" ? "Instagram" : "TikTok"} post`
                : "Shared link"}{" "}
              ↗
            </Text>
            <Text style={styles.sourceUrl} numberOfLines={2}>
              {social?.url ?? shared}
            </Text>
          </Card>
        </Pressable>
      ) : null}

      {!social && !shared ? (
        <Text style={styles.debugHint}>
          No text or link came through with this share (title: "{title || "none"}
          "). If this keeps happening on video/Reel shares, that's likely the
          Android share sheet not attaching a caption — try "Copy Link" on the
          post instead and paste it into "Paste Link" in a list's Add screen.
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator style={{ marginVertical: 8 }} color={colors.primary} /> : null}

      {resolved ? (
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
          <Text style={styles.stepLabel}>
            {suggested ? "Is it one of these?" : "Which restaurant is this?"}
          </Text>
          {suggesting ? (
            <Text style={styles.suggestingHint}>
              Reading the post to find the restaurant…
            </Text>
          ) : null}
          <View style={styles.searchRow}>
            <TextField
              style={styles.searchInput}
              placeholder="Search restaurant name"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={onSearch}
              returnKeyType="search"
              autoFocus={!social}
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
          {!suggesting ? (
            <Button
              label="Can't find it? Save anyway"
              variant="outline"
              loading={busy}
              onPress={onSaveUnmatched}
            />
          ) : null}
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
  debugHint: { ...type.caption, color: colors.inkTertiary },
  sourceBadge: { ...type.label, color: colors.primary },
  sourceUrl: { ...type.caption },
  section: { gap: spacing.md },
  stepLabel: { ...type.heading, fontSize: 20 },
  searchRow: { flexDirection: "row" as const, gap: spacing.sm },
  searchInput: { flex: 1 },
  suggestingHint: { ...type.caption, color: colors.inkSecondary },
  confirmTitle: { ...type.subtitle },
  confirmSub: { ...type.body, color: colors.inkSecondary },
  error: { color: colors.pass },
}));
