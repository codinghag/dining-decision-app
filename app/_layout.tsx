import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ensureAnonymousSession } from "../lib/supabase";
import { logEvent } from "../lib/analytics";
import { registerPushToken } from "../lib/push";
import { colors, type } from "../lib/theme";

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
      // Register this device's Expo push token (native only, best-effort) so the
      // backend can notify members when a Decide Now session starts. Fire after
      // marking ready so a permission prompt never blocks first paint.
      registerPushToken();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingLogo}>🍽️</Text>
        <Text style={styles.loadingBrand}>Forked</Text>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Starting up…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: "700" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Collections" }} />
          <Stack.Screen
            name="collection/[id]/index"
            options={{ title: "Collection" }}
          />
          <Stack.Screen
            name="collection/[id]/add"
            options={{ title: "Add Restaurant", presentation: "modal" }}
          />
          <Stack.Screen
            name="collection/[id]/stats"
            options={{ title: "Group Stats" }}
          />
          <Stack.Screen
            name="collection/[id]/join"
            options={{ title: "Joining…" }}
          />
          <Stack.Screen
            name="collection/[id]/decide/[sessionId]"
            options={{ title: "Let's Decide" }}
          />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingLogo: { fontSize: 44, marginBottom: 4 },
  loadingBrand: { ...type.title, marginBottom: 4 },
  loadingText: { ...type.body, color: colors.inkSecondary },
});
