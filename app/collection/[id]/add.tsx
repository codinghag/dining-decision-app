import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  getPlaceDetails,
  resolveMapsLink,
  searchPlaces,
  type Place,
  type PlaceSearchResult,
} from "../../../lib/places";
import { saveRestaurantToCollection, type CaptureMethod } from "../../../lib/db";
import {
  extractSocialLinks,
  matchSocialLink,
  resolveSocialPost,
  type SocialLink,
} from "../../../lib/socialImport";
import { getCurrentLocation, type Coords } from "../../../lib/location";
import { isOpenNow } from "../../../lib/hours";
import { RestaurantPhoto } from "../../../components/RestaurantPhoto";
import { TextField } from "../../../components/TextField";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { RestaurantTags } from "../../../components/RestaurantTags";
import { radius, spacing, themedStyles, useTheme } from "../../../lib/theme";

type Tab = "link" | "search" | "quick_add" | "import";

interface ImportRowState {
  status: "pending" | "saving" | "saved" | "skipped";
  query: string;
  results: PlaceSearchResult[];
}

export default function AddRestaurantScreen() {
  const { id: collectionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [tab, setTab] = useState<Tab>("search");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link import state. A pasted link is either a Google Maps link (resolved
  // server-side to a place) or an Instagram/TikTok post (no place data in the
  // URL — the user matches it to a restaurant via search, and the post URL is
  // saved as the source).
  const [link, setLink] = useState("");
  const [resolved, setResolved] = useState<Place | null>(null);
  const [socialLink, setSocialLink] = useState<SocialLink | null>(null);
  const [socialQuery, setSocialQuery] = useState("");
  const [socialResults, setSocialResults] = useState<PlaceSearchResult[]>([]);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);

  // Quick-add state
  const [quickName, setQuickName] = useState("");
  const [quickAddress, setQuickAddress] = useState("");
  const [quickCuisine, setQuickCuisine] = useState("");
  const [quickPriceLevel, setQuickPriceLevel] = useState<number | null>(null);

  // Best-effort device location, fetched once, used to bias Search/Import
  // results toward nearby restaurants. Never blocks the UI -- stays null
  // (unbiased search) if permission is denied or unavailable.
  const [location, setLocation] = useState<Coords | null>(null);
  useEffect(() => {
    getCurrentLocation().then(setLocation);
  }, []);

  // Import state
  const [importLinks, setImportLinks] = useState<SocialLink[]>([]);
  const [importRows, setImportRows] = useState<Record<string, ImportRowState>>({});

  function done() {
    router.back();
  }

  async function save(
    place: Parameters<typeof saveRestaurantToCollection>[1],
    method: CaptureMethod,
  ) {
    if (!collectionId) return;
    setBusy(true);
    setError(null);
    try {
      await saveRestaurantToCollection(collectionId, place, method);
      done();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // --- Link import -------------------------------------------------------
  // `input` lets other tabs hand a URL straight in (quick add intercepts
  // pasted links); button presses pass an event object, hence the typeof.
  async function onResolveLink(input?: unknown) {
    const trimmed = (typeof input === "string" ? input : link).trim();
    if (!trimmed) return;
    setError(null);
    setResolved(null);
    setSocialLink(null);
    setSocialResults([]);

    // Instagram/TikTok post? Read its caption server-side and auto-suggest
    // matching restaurants — one tap to save when it works. The post URL is
    // kept as the source either way; manual search is the fallback.
    const social = matchSocialLink(trimmed);
    if (social) {
      setSocialLink(social);
      setBusy(true);
      try {
        const info = await resolveSocialPost(social.url);
        if (info.suggestedQuery) {
          setSocialQuery(info.suggestedQuery);
          setSocialResults(
            await searchPlaces(info.suggestedQuery, location ?? undefined),
          );
        }
      } catch {
        // best effort — the manual search box below still works
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const place = await resolveMapsLink(trimmed);
      setResolved(place);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSocialSearch() {
    if (!socialQuery.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchPlaces(socialQuery.trim(), location ?? undefined);
      setSocialResults(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSocialPick(r: PlaceSearchResult) {
    if (!collectionId || !socialLink) return;
    setBusy(true);
    setError(null);
    try {
      const place = await getPlaceDetails(r.google_place_id);
      await saveRestaurantToCollection(collectionId, place, "social_import", {
        source_url: socialLink.url,
        source_platform: socialLink.platform,
      });
      done();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  // --- Search ------------------------------------------------------------
  async function onSearch() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchPlaces(query.trim(), location ?? undefined);
      setResults(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPickResult(r: PlaceSearchResult) {
    setBusy(true);
    setError(null);
    try {
      // Fetch full details (phone/website/hours) before saving.
      const place = await getPlaceDetails(r.google_place_id);
      await save(place, "search");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  // --- Import from Instagram/TikTok export --------------------------------
  function updateImportRow(url: string, patch: Partial<ImportRowState>) {
    setImportRows((prev) => ({ ...prev, [url]: { ...prev[url], ...patch } }));
  }

  async function onChooseImportFile() {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        base64: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      setBusy(true);
      const links = await extractSocialLinks(file.uri, file.name);
      setImportLinks(links);
      setImportRows(
        Object.fromEntries(
          links.map((l) => [l.url, { status: "pending", query: "", results: [] } as ImportRowState]),
        ),
      );
      if (links.length === 0) {
        setError("No Instagram or TikTok links found in that file.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImportSearch(url: string) {
    const row = importRows[url];
    if (!row?.query.trim()) return;
    updateImportRow(url, { status: "pending" });
    try {
      const results = await searchPlaces(row.query.trim(), location ?? undefined);
      updateImportRow(url, { results });
    } catch (e) {
      setError(String(e));
    }
  }

  async function onImportPick(link: SocialLink, r: PlaceSearchResult) {
    updateImportRow(link.url, { status: "saving" });
    try {
      const place = await getPlaceDetails(r.google_place_id);
      await saveRestaurantToCollection(collectionId!, place, "social_import", {
        source_url: link.url,
        source_platform: link.platform,
      });
      updateImportRow(link.url, { status: "saved" });
    } catch (e) {
      setError(String(e));
      updateImportRow(link.url, { status: "pending" });
    }
  }

  function onImportSkip(url: string) {
    updateImportRow(url, { status: "skipped" });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.tabs}>
        {(
          [
            ["link", "Paste link"],
            ["search", "Search"],
            ["quick_add", "Quick add"],
            ["import", "Import"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            accessibilityRole="button"
            accessibilityLabel={`${label} tab`}
            accessibilityState={{ selected: tab === key }}
            onPress={() => {
              setTab(key);
              setError(null);
            }}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} /> : null}

      {/* --- Paste a Google Maps link --- */}
      {tab === "link" && (
        <View style={styles.section}>
          <Text style={styles.help}>
            Paste a Google Maps, Instagram, or TikTok link.
          </Text>
          <TextField
            placeholder="https://maps.app.goo.gl/… or instagram.com/reel/…"
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button label="Resolve" loading={busy} onPress={onResolveLink} />

          {socialLink && (
            <Card style={styles.importRow}>
              <View style={styles.importRowHeader}>
                <Text style={styles.importBadge}>
                  {socialLink.platform === "instagram" ? "Instagram" : "TikTok"} post
                </Text>
                <Text style={styles.importUrl} numberOfLines={1}>
                  {socialLink.url}
                </Text>
              </View>
              <Text style={styles.help}>
                We'll save this post with the restaurant — which spot is it?
              </Text>
              <View style={styles.searchRow}>
                <TextField
                  style={styles.searchInput}
                  placeholder="What restaurant is this?"
                  value={socialQuery}
                  onChangeText={setSocialQuery}
                  onSubmitEditing={onSocialSearch}
                  returnKeyType="search"
                />
                <Button label="Go" loading={busy} onPress={onSocialSearch} />
              </View>
              {socialResults.map((r) => (
                <Pressable
                  key={r.google_place_id}
                  onPress={() => onSocialPick(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`Save ${r.name} to this list`}
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
            </Card>
          )}

          {resolved && (
            <Card style={styles.confirm}>
              {resolved.photo_name ? (
                <RestaurantPhoto photoName={resolved.photo_name} variant="hero" />
              ) : null}
              <Text style={styles.confirmTitle}>{resolved.name}</Text>
              <RestaurantTags
                cuisine={resolved.cuisine}
                priceLevel={resolved.price_level}
                rating={resolved.rating}
                ratingCount={resolved.rating_count}
                openNow={isOpenNow(resolved.hours, resolved.utc_offset_minutes)}
              />
              {resolved.address ? (
                <Text style={styles.confirmSub}>{resolved.address}</Text>
              ) : null}
              <Button
                label="Save to list"
                loading={busy}
                onPress={() => save(resolved, "link")}
              />
            </Card>
          )}
        </View>
      )}

      {/* --- Search by name --- */}
      {tab === "search" && (
        <View style={styles.section}>
          <Text style={styles.help}>Search for a restaurant by name.</Text>
          <View style={styles.searchRow}>
            <TextField
              style={styles.searchInput}
              placeholder="e.g. Blue Bottle Coffee"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={onSearch}
              returnKeyType="search"
            />
            <Button label="Go" loading={busy} onPress={onSearch} />
          </View>

          {results.map((r) => (
            <Pressable
              key={r.google_place_id}
              onPress={() => onPickResult(r)}
              accessibilityRole="button"
              accessibilityLabel={`Save ${r.name} to this list`}
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

      {/* --- Quick add free text fallback --- */}
      {tab === "quick_add" && (
        <View style={styles.section}>
          <Text style={styles.help}>
            Can’t find it? Add it manually. Only a name is required.
          </Text>
          <TextField
            placeholder="Restaurant name"
            value={quickName}
            onChangeText={setQuickName}
          />
          <TextField
            placeholder="Address (optional)"
            value={quickAddress}
            onChangeText={setQuickAddress}
          />
          <TextField
            placeholder="Cuisine, e.g. Thai, Pizza (optional)"
            value={quickCuisine}
            onChangeText={setQuickCuisine}
          />
          <Text style={styles.priceLabel}>Price range (optional)</Text>
          <View style={styles.priceRow}>
            {[1, 2, 3, 4].map((level) => (
              <Pressable
                key={level}
                style={[styles.priceOption, quickPriceLevel === level && styles.priceOptionActive]}
                accessibilityRole="button"
                accessibilityLabel={`Price level ${level} of 4`}
                accessibilityState={{ selected: quickPriceLevel === level }}
                onPress={() => setQuickPriceLevel(quickPriceLevel === level ? null : level)}
              >
                <Text
                  style={[
                    styles.priceOptionText,
                    quickPriceLevel === level && styles.priceOptionTextActive,
                  ]}
                >
                  {"$".repeat(level)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            label="Save to list"
            loading={busy}
            disabled={!quickName.trim()}
            onPress={() => {
              const trimmed = quickName.trim();
              // A pasted link isn't a name — route it through the link flow,
              // which resolves it to a real place (and reads post captions),
              // instead of saving a dead URL string as the restaurant.
              if (/^https?:\/\//i.test(trimmed)) {
                setLink(trimmed);
                setQuickName("");
                setTab("link");
                onResolveLink(trimmed);
                return;
              }
              save(
                {
                  name: trimmed,
                  address: quickAddress.trim() || null,
                  cuisine: quickCuisine.trim() || null,
                  price_level: quickPriceLevel,
                },
                "quick_add",
              );
            }}
          />
        </View>
      )}

      {/* --- Import saved posts from an Instagram/TikTok data export --- */}
      {tab === "import" && (
        <View style={styles.section}>
          <Text style={styles.help}>
            Request your data export from Instagram or TikTok ("Download Your
            Data"), then upload the file here — .zip or .json both work.
            We'll pull out any saved post links so you can match each one to
            a real restaurant.
          </Text>
          <Button label="Choose export file" loading={busy} onPress={onChooseImportFile} />

          {importLinks.map((link) => {
            const row = importRows[link.url];
            if (!row) return null;
            return (
              <Card key={link.url} style={styles.importRow}>
                <View style={styles.importRowHeader}>
                  <Text style={styles.importBadge}>
                    {link.platform === "instagram" ? "Instagram" : "TikTok"}
                  </Text>
                  <Text style={styles.importUrl} numberOfLines={1}>
                    {link.url}
                  </Text>
                </View>

                {row.status === "saved" ? (
                  <Text style={styles.importSaved}>✓ Added to list</Text>
                ) : row.status === "skipped" ? (
                  <Text style={styles.importSkipped}>Skipped</Text>
                ) : (
                  <>
                    <View style={styles.searchRow}>
                      <TextField
                        style={styles.searchInput}
                        placeholder="What restaurant is this?"
                        value={row.query}
                        onChangeText={(q) => updateImportRow(link.url, { query: q })}
                        onSubmitEditing={() => onImportSearch(link.url)}
                        returnKeyType="search"
                      />
                      <Button
                        label="Go"
                        loading={row.status === "saving"}
                        onPress={() => onImportSearch(link.url)}
                      />
                    </View>
                    {row.results.map((r) => (
                      <Pressable
                        key={r.google_place_id}
                        onPress={() => onImportPick(link, r)}
                        accessibilityRole="button"
                        accessibilityLabel={`Save ${r.name} to this list`}
                      >
                        <Card>
                          <Text style={styles.confirmTitle}>{r.name}</Text>
                          <RestaurantTags
                            cuisine={r.cuisine}
                            priceLevel={r.price_level}
                            rating={r.rating}
                            ratingCount={r.rating_count}
                          />
                          {r.address ? (
                            <Text style={styles.confirmSub}>{r.address}</Text>
                          ) : null}
                        </Card>
                      </Pressable>
                    ))}
                    <Button
                      label="Skip"
                      variant="outline"
                      onPress={() => onImportSkip(link.url)}
                    />
                  </>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const themed = themedStyles((colors, type) => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.base, gap: spacing.md },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface, boxShadow: "0px 1px 4px rgba(36,31,27,0.08)" },
  tabText: { ...type.label },
  tabTextActive: { color: colors.primary },
  section: { gap: spacing.md },
  help: { ...type.caption, color: colors.inkSecondary },
  searchRow: { flexDirection: "row", gap: spacing.sm },
  searchInput: { flex: 1 },
  confirm: { gap: spacing.sm, marginTop: spacing.xs },
  priceLabel: { ...type.label, color: colors.inkSecondary, marginTop: -spacing.xs },
  priceRow: { flexDirection: "row", gap: spacing.sm },
  priceOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  priceOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  priceOptionText: { ...type.subtitle, color: colors.inkSecondary },
  priceOptionTextActive: { color: colors.primaryDark },
  confirmTitle: { ...type.subtitle },
  confirmSub: { ...type.body, color: colors.inkSecondary },
  error: { color: colors.pass },
  importRow: { gap: spacing.sm },
  importRowHeader: { gap: 2 },
  importBadge: { ...type.label, color: colors.primary },
  importUrl: { ...type.caption },
  importSaved: { ...type.body, color: colors.yes, fontWeight: "600" },
  importSkipped: { ...type.body, color: colors.inkTertiary },
}));
