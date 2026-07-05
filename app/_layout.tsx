import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureAnonymousSession } from "../lib/supabase";
import { logEvent } from "../lib/analytics";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Bootstrap an anonymous session before rendering any data screen, and
      // fire the once-per-cold-start app_opened event.
      await ensureAnonymousSession();
      await logEvent("app_opened", { platform: "expo" });
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Starting up…</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: "#fff" } }}>
        <Stack.Screen name="index" options={{ title: "Collections" }} />
        <Stack.Screen
          name="collection/[id]/index"
          options={{ title: "Collection" }}
        />
        <Stack.Screen
          name="collection/[id]/add"
          options={{ title: "Add Restaurant", presentation: "modal" }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    gap: 12,
  },
  loadingText: { color: "#666" },
});
