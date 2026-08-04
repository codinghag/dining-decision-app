import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { formatTimeOption } from "../lib/time";
import { parseCustomSlot, quickTimeSlots } from "../lib/timeSlots";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { radius, shadow, spacing, themedStyles, useTheme } from "../lib/theme";

interface ProposeTimesSheetProps {
  visible: boolean;
  starting?: boolean;
  onStart: (isoTimes: string[]) => void;
  onClose: () => void;
}

// Reached from "Let's Decide" -- the organizer picks 1+ candidate date/time
// slots before the session starts. The group later approves as many of these
// as work for them (see the decide screen), majority wins alongside the
// restaurant winner. Quick-pick chips + a custom date/time pair cover the
// common cases without a native date-time-picker dependency.
export function ProposeTimesSheet({
  visible,
  starting = false,
  onStart,
  onClose,
}: ProposeTimesSheetProps) {
  const { scheme } = useTheme();
  const styles = themed[scheme];
  const quick = useState(() => quickTimeSlots())[0];
  const [selected, setSelected] = useState<string[]>([]);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    setCustomDate("");
    setCustomTime("");
    setCustomError(null);
  }, [visible]);

  function toggle(iso: string) {
    setSelected((prev) =>
      prev.includes(iso) ? prev.filter((x) => x !== iso) : [...prev, iso],
    );
  }

  function onAddCustom() {
    const iso = parseCustomSlot(customDate, customTime);
    if (!iso) {
      setCustomError("Use YYYY-MM-DD and HH:MM (24h)");
      return;
    }
    setCustomError(null);
    if (!selected.includes(iso)) setSelected((prev) => [...prev, iso]);
    setCustomDate("");
    setCustomTime("");
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
              Propose a time
            </Text>
            <Text style={styles.help}>
              Pick one or more options — the group will vote on which works.
            </Text>

            <Text style={styles.sectionTitle}>Quick picks</Text>
            {quick.map((slot) => {
              const on = selected.includes(slot.iso);
              return (
                <Pressable
                  key={slot.iso}
                  style={[styles.row, on && styles.rowSelected]}
                  onPress={() => toggle(slot.iso)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={slot.label}
                >
                  <Text style={[styles.check, on && styles.checkOn]}>{on ? "●" : "○"}</Text>
                  <Text style={styles.rowName}>{slot.label}</Text>
                </Pressable>
              );
            })}

            {selected.some((iso) => !quick.some((s) => s.iso === iso)) ? (
              <>
                <Text style={styles.sectionTitle}>Custom</Text>
                {selected
                  .filter((iso) => !quick.some((s) => s.iso === iso))
                  .map((iso) => (
                    <Pressable
                      key={iso}
                      style={[styles.row, styles.rowSelected]}
                      onPress={() => toggle(iso)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: true }}
                      accessibilityLabel={formatTimeOption(iso)}
                    >
                      <Text style={[styles.check, styles.checkOn]}>●</Text>
                      <Text style={styles.rowName}>{formatTimeOption(iso)}</Text>
                    </Pressable>
                  ))}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Add a custom time</Text>
            {customError ? <Text style={styles.error}>{customError}</Text> : null}
            <View style={styles.customRow}>
              <TextField
                style={styles.customDate}
                placeholder="YYYY-MM-DD"
                value={customDate}
                onChangeText={setCustomDate}
              />
              <TextField
                style={styles.customTime}
                placeholder="HH:MM"
                value={customTime}
                onChangeText={setCustomTime}
              />
              <Button
                label="Add"
                variant="outline"
                disabled={!customDate.trim() || !customTime.trim()}
                onPress={onAddCustom}
              />
            </View>

            <Button
              label={starting ? "Starting…" : `Start (${selected.length} time${selected.length === 1 ? "" : "s"})`}
              variant="dark"
              loading={starting}
              disabled={selected.length === 0}
              onPress={() => onStart(selected)}
            />
            <Pressable
              onPress={onClose}
              disabled={starting}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
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
    maxHeight: "85%" as const,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    boxShadow: shadow.raised,
  },
  title: { ...type.heading, marginBottom: spacing.xs },
  help: { ...type.caption, color: colors.inkSecondary },
  sectionTitle: { ...type.label, marginTop: spacing.base, marginBottom: spacing.xs },
  error: { color: colors.pass, marginBottom: spacing.xs },
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
  customRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  customDate: { flex: 1.3 },
  customTime: { flex: 1 },
  cancel: { paddingTop: spacing.md, alignItems: "center" as const },
  cancelText: { ...type.label, color: colors.inkSecondary },
}));
