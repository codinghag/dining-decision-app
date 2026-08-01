import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { listCollections, type Collection } from "../lib/db";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface MoveToListSheetProps {
  visible: boolean;
  restaurantName: string;
  excludeCollectionId: string;
  moving?: boolean;
  onPick: (collectionId: string) => void;
  onClose: () => void;
}

// Cross-platform bottom-sheet-style picker (same Modal approach as
// ConfirmDialog — RN Web's Alert is a no-op) listing every other list the
// restaurant could move into.
export function MoveToListSheet({
  visible,
  restaurantName,
  excludeCollectionId,
  moving = false,
  onPick,
  onClose,
}: MoveToListSheetProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  const [collections, setCollections] = useState<Collection[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCollections(null);
    listCollections()
      .then(setCollections)
      .catch(() => setCollections([]));
  }, [visible]);

  const options = (collections ?? []).filter((c) => c.id !== excludeCollectionId);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            Move {restaurantName}
          </Text>
          {collections === null ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : options.length === 0 ? (
            <Text style={styles.empty}>No other lists yet.</Text>
          ) : (
            options.map((c) => (
              <Pressable
                key={c.id}
                style={styles.row}
                disabled={moving}
                onPress={() => onPick(c.id)}
                accessibilityRole="button"
                accessibilityLabel={`Move to ${c.name}`}
              >
                <Text style={styles.rowText}>
                  {c.is_general ? "⚡ " : ""}
                  {c.name}
                </Text>
              </Pressable>
            ))
          )}
          {moving ? <ActivityIndicator style={{ marginTop: spacing.xs }} /> : null}
          <Pressable
            onPress={onClose}
            disabled={moving}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
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
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    boxShadow: shadow.raised,
  },
  title: { ...type.heading, marginBottom: spacing.xs },
  empty: { ...type.body, color: colors.inkSecondary, marginBottom: spacing.sm },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { ...type.subtitle },
  cancel: { paddingTop: spacing.md, alignItems: "center" as const },
  cancelText: { ...type.label, color: colors.inkSecondary },
}));
