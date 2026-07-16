import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { Restaurant } from "../lib/db";
import { shareRestaurant } from "../lib/invite";
import { buildMapsUrl } from "../lib/maps";
import { isOpenNow } from "../lib/hours";
import { logEvent } from "../lib/analytics";
import { Button } from "./Button";
import { RestaurantPhoto } from "./RestaurantPhoto";
import { RestaurantTags } from "./RestaurantTags";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface RestaurantSheetProps {
  restaurant: Restaurant | null; // null = closed
  onClose: () => void;
}

// Tap-a-restaurant detail view: photo, tags, contact info, directions, and a
// share button for sending one spot (not the whole collection) to a friend.
// A Modal "sheet" rather than a route so it works identically from any list.
export function RestaurantSheet({ restaurant, onClose }: RestaurantSheetProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!restaurant) return null;
  const r = restaurant;

  async function onShare() {
    setFeedback(null);
    const outcome = await shareRestaurant(r);
    if (outcome === "copied") setFeedback("Copied to clipboard ✓");
  }

  function onDirections() {
    logEvent("directions_opened", { restaurant_id: r.id });
    Linking.openURL(buildMapsUrl(r)).catch(() => {});
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
          <ScrollView contentContainerStyle={styles.content}>
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

            {feedback ? (
              <Text style={styles.feedback} accessibilityLiveRegion="polite">
                {feedback}
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
  actions: { flexDirection: "row" as const, gap: spacing.sm, marginTop: spacing.sm },
}));
