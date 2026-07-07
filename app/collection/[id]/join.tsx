import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { joinCollection } from "../../../lib/decide";

// Invite landing screen. Reached by opening a collection's share link
// (/collection/<id>/join). Calls the join-collection edge function (which
// idempotently adds the visitor as a member), then forwards into the normal
// collection detail screen — where they now have full member access via RLS.
export default function JoinCollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
          <Text style={styles.error}>Couldn't join this collection.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              startedRef.current = false;
              join();
            }}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.text}>
            {name ? `Joining "${name}"…` : "Joining collection…"}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 24,
    gap: 12,
  },
  text: { color: "#666" },
  error: { color: "#c00", fontWeight: "600", fontSize: 16 },
  errorDetail: { color: "#999", textAlign: "center" },
  button: {
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
});
