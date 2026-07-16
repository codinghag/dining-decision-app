import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "./Button";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// RN Web's Alert.alert() is a no-op (see react-native-web/dist/exports/Alert),
// so it can't be used for confirmations on web -- this is a cross-platform
// replacement built on Modal, which react-native-web does implement.
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Dismiss dialog"
      >
        <Pressable
          style={styles.card}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <Button label="Cancel" variant="outline" flex onPress={onCancel} />
            <Button
              label={confirmLabel}
              variant={destructive ? "danger-outline" : "primary"}
              flex
              loading={loading}
              onPress={onConfirm}
            />
          </View>
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
    gap: spacing.sm,
    boxShadow: shadow.raised,
  },
  title: { ...type.heading },
  message: { ...type.body, color: colors.inkSecondary, marginBottom: spacing.sm },
  buttons: { flexDirection: "row" as const, gap: spacing.sm },
}));
