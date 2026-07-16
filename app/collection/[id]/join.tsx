import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { joinCollection } from "../../../lib/decide";
import { Button } from "../../../components/Button";
import { spacing, themedStyles, useTheme } from "../../../lib/theme";

// Invite landing screen. Reached by opening a collection's share link
// (/collection/<id>/join). Calls the join-collection edge function (which
// idempotently adds the visitor as a member), then forwards into the normal
// collection detail screen — where they now have full member access via RLS.
export default function JoinCollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  // Guard against double-invoking the join in React strict/dev double-render.
  const startedRef = useRef(false);

  const join = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const collection = await joinCollection(id);
      setName(collection.name);
      // Replace so the back button doesn't return to this transient screen.
      router.replace(`/collection/${id}`);
    } catch (e) {
      setError(String(e));
    }
  }, [id, router]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    join();
  }, [join]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Joining…" }} />
      {error ? (
        <>
          <Text style={styles.icon}>😕</Text>
          <Text style={styles.error}>Couldn't join this collection.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Button
            label="Try again"
            onPress={() => {
              startedRef.current = false;
              join();
            }}
          />
        </>
      ) : (
        <>
          <Text style={styles.icon}>🍽️</Text>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text}>
            {name ? `Joining "${name}"…` : "Joining collection…"}
          </Text>
        </>
      )}
    </View>
  );
}

const themed = themedStyles((colors, type) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  icon: { fontSize: 40 },
  text: { ...type.body, color: colors.inkSecondary },
  error: { ...type.heading, color: colors.pass },
  errorDetail: { ...type.caption, textAlign: "center" },
}));
