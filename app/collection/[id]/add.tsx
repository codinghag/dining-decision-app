import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getPlaceDetails,
  resolveMapsLink,
  searchPlaces,
  type Place,
  type PlaceSearchResult,
} from "../../../lib/places";
import { saveRestaurantToCollection, type CaptureMethod } from "../../../lib/db";
import { TextField } from "../../../components/TextField";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { colors, radius, spacing, type } from "../../../lib/theme";

type Tab = "link" | "search" | "quick_add";

export default function AddRestaurantScreen() {
  const { id: collectionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("search");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Link import state
  const [link, setLink] = useState("");
  const [resolved, setResolved] = useState<Place | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);

  // Quick-add state
  const [quickName, setQuickName] = useState("");
  const [quickAddress, setQuickAddress] = useState("");

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
  async function onResolveLink() {
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    setResolved(null);
    try {
      const place = await resolveMapsLink(link.trim());
      setResolved(place);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // --- Search ------------------------------------------------------------
  async function onSearch() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await searchPlaces(query.trim());
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
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
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
            Paste a Google Maps link (including maps.app.goo.gl short links).
          </Text>
          <TextField
            placeholder="https://maps.app.goo.gl/…"
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button label="Resolve" loading={busy} onPress={onResolveLink} />

          {resolved && (
            <Card style={styles.confirm}>
              <Text style={styles.confirmTitle}>{resolved.name}</Text>
              {resolved.address ? (
                <Text style={styles.confirmSub}>{resolved.address}</Text>
              ) : null}
              <Button
                label="Save to collection"
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
            <Pressable key={r.google_place_id} onPress={() => onPickResult(r)}>
              <Card>
                <Text style={styles.confirmTitle}>{r.name}</Text>
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
          <Button
            label="Save to collection"
            loading={busy}
            disabled={!quickName.trim()}
            onPress={() =>
              save(
                {
                  name: quickName.trim(),
                  address: quickAddress.trim() || null,
                },
                "quick_add",
              )
            }
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  confirmTitle: { ...type.subtitle },
  confirmSub: { ...type.body, color: colors.inkSecondary },
  error: { color: colors.pass },
});
