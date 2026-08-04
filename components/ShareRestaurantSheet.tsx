import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text } from "react-native";
import { useRouter } from "expo-router";
import type { Restaurant } from "../lib/db";
import { listFriends, shareRestaurantWithFriends, type Friend } from "../lib/friends";
import { shareRestaurant } from "../lib/invite";
import { Button } from "./Button";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface ShareRestaurantSheetProps {
  restaurant: Restaurant | null; // null = closed
  onClose: () => void;
}

// The in-app share entry point for a single restaurant — the per-restaurant
// counterpart to the list-level invite hub (app/collection/[id]/invite.tsx):
// pick friends to send it to directly, or fall back to the OS share sheet.
export function ShareRestaurantSheet({ restaurant, onClose }: ShareRestaurantSheetProps) {
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = !!restaurant;

  useEffect(() => {
    if (!visible) return;
    setFriends(null);
    setSelected(new Set());
    setSent(new Set());
    setFeedback(null);
    setError(null);
    listFriends()
      .then(setFriends)
      .catch((e) => {
        setFriends([]);
        setError(String(e));
      });
  }, [visible, restaurant?.id]);

  function toggle(userId: string) {
    if (sent.has(userId)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function onShareSelected() {
    if (!restaurant || selected.size === 0) return;
    setSharing(true);
    setError(null);
    setFeedback(null);
    try {
      const ids = [...selected];
      const count = await shareRestaurantWithFriends(restaurant.id, ids);
      setSent((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      setFeedback(`Shared with ${count} ${count === 1 ? "friend" : "friends"} ✓`);
    } catch (e) {
      setError(String(e));
    } finally {
      setSharing(false);
    }
  }

  async function onShareElsewhere() {
    if (!restaurant) return;
    setFeedback(null);
    setError(null);
    const outcome = await shareRestaurant(restaurant);
    if (outcome === "copied") setFeedback("Copied to clipboard ✓");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <ScrollView>
            <Text style={styles.title} accessibilityRole="header">
              {restaurant ? `Share "${restaurant.name}"` : "Share"}
            </Text>

            {feedback ? (
              <Text style={styles.feedback} accessibilityLiveRegion="polite">
                {feedback}
              </Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.sectionTitle}>Friends on Forked</Text>
            {friends === null ? (
              <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
            ) : friends.length === 0 ? (
              <>
                <Text style={styles.help}>
                  No friends yet — add some once and sharing becomes one tap.
                </Text>
                <Button
                  label="Go to Friends"
                  variant="outline"
                  onPress={() => {
                    onClose();
                    router.push("/friends");
                  }}
                />
              </>
            ) : (
              <>
                {friends.map((f) => {
                  const done = sent.has(f.userId);
                  const on = selected.has(f.userId);
                  return (
                    <Pressable
                      key={f.userId}
                      style={[styles.row, on && styles.rowSelected]}
                      onPress={() => toggle(f.userId)}
                      disabled={done}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: done }}
                      accessibilityLabel={`Share with ${f.displayName ?? "friend"}`}
                    >
                      <Text style={[styles.check, on && styles.checkOn]}>
                        {done ? "✓" : on ? "●" : "○"}
                      </Text>
                      <Text style={[styles.rowName, done && styles.rowNameDone]}>
                        {f.displayName ?? "Unnamed friend"}
                      </Text>
                      {done ? <Text style={styles.sentText}>Sent</Text> : null}
                    </Pressable>
                  );
                })}
                {selected.size > 0 ? (
                  <Button
                    label={`Share with ${selected.size} ${selected.size === 1 ? "friend" : "friends"}`}
                    loading={sharing}
                    onPress={onShareSelected}
                  />
                ) : null}
              </>
            )}

            <Text style={styles.sectionTitle}>Or share anywhere</Text>
            <Button label="📤 Share" variant="outline" onPress={onShareElsewhere} />

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
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
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: spacing.lg,
  },
  card: {
    width: "100%" as const,
    maxWidth: 420,
    maxHeight: "80%" as const,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    boxShadow: shadow.raised,
  },
  title: { ...type.heading, marginBottom: spacing.xs },
  sectionTitle: { ...type.label, marginTop: spacing.base, marginBottom: spacing.xs },
  help: { ...type.caption, color: colors.inkSecondary, marginTop: spacing.xs },
  feedback: { ...type.body, color: colors.yes },
  error: { color: colors.pass },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  rowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  check: { ...type.subtitle, color: colors.inkTertiary, width: 22, textAlign: "center" },
  checkOn: { color: colors.primary },
  rowName: { ...type.subtitle, flex: 1 },
  rowNameDone: { color: colors.inkTertiary },
  sentText: { ...type.caption, color: colors.yes, fontWeight: "600" },
  cancel: { paddingTop: spacing.md, alignItems: "center" as const },
  cancelText: { ...type.label, color: colors.inkSecondary },
}));
