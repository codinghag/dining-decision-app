import { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "../lib/theme";

const URGENT_MS = 10_000;

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface CountdownTimerProps {
  deadlineMs: number; // epoch ms; shared by all members via the session row
  running: boolean;
  onExpire: () => void;
}

// Owns its own 500ms clock so the twice-a-second tick re-renders only this
// pill — not the parent screen with its gesture deck, photo, and tallies
// (which is what an inlined `setNowMs` in the screen used to do).
export const CountdownTimer = memo(function CountdownTimer({
  deadlineMs,
  running,
  onExpire,
}: CountdownTimerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  const remainingMs = Math.max(0, deadlineMs - nowMs);

  useEffect(() => {
    if (running && deadlineMs > 0 && remainingMs === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
    }
  }, [running, deadlineMs, remainingMs, onExpire]);

  const urgent = remainingMs <= URGENT_MS;
  return (
    <View style={styles.row}>
      <View style={[styles.timer, urgent && styles.timerUrgent]}>
        <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
          ⏱ {formatCountdown(remainingMs)}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { alignItems: "center" },
  timer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerUrgent: { backgroundColor: colors.passLight, borderColor: colors.pass },
  timerText: { ...type.subtitle, color: colors.inkSecondary },
  timerTextUrgent: { color: colors.pass },
});
