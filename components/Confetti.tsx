import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";

// A lightweight confetti burst built on reanimated (already a dependency via
// the swipe deck), so there's no new native module to keep version-matched.
// Works on web and native. Purely decorative -- rendered as a pointer-events
// -none overlay so it never blocks the buttons underneath.

const PIECE_COLORS = [
  colors.primary,
  colors.yes,
  colors.pass,
  "#F5C542", // gold
  "#4B9CE2", // blue
];

interface PieceParams {
  startXRatio: number; // 0..1 across the width
  driftX: number; // horizontal travel in px
  size: number;
  color: string;
  rotation: number; // total degrees
  delay: number; // ms before it starts falling
  duration: number; // ms fall time
}

function randomPiece(): PieceParams {
  return {
    startXRatio: Math.random(),
    driftX: (Math.random() - 0.5) * 120,
    size: 6 + Math.random() * 8,
    color: PIECE_COLORS[Math.floor(Math.random() * PIECE_COLORS.length)],
    rotation: (Math.random() - 0.5) * 720,
    delay: Math.random() * 400,
    duration: 1600 + Math.random() * 1200,
  };
}

function ConfettiPiece({
  params,
  fallHeight,
  width,
}: {
  params: PieceParams;
  fallHeight: number;
  width: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(params.delay, withTiming(1, { duration: params.duration }));
  }, [progress, params.delay, params.duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: params.driftX * progress.value },
      { translateY: -20 + (fallHeight + 40) * progress.value },
      { rotate: `${params.rotation * progress.value}deg` },
    ],
    opacity: interpolate(progress.value, [0, 0.8, 1], [1, 1, 0]),
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: params.startXRatio * width,
          width: params.size,
          height: params.size * 0.6,
          backgroundColor: params.color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ count = 28 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  // Stable per-mount random params (regenerating every render would restart the
  // animation each frame). The useState initializer runs exactly once; a `key`
  // change on the parent remounts this for a replay.
  const [pieces] = useState(() => Array.from({ length: count }, randomPiece));

  return (
    <View style={styles.overlay}>
      {pieces.map((params, i) => (
        <ConfettiPiece key={i} params={params} fallHeight={height} width={width} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    pointerEvents: "none",
  },
  piece: {
    position: "absolute",
    top: 0,
    borderRadius: 2,
  },
});
