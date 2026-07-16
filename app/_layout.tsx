import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { getAuthStatus } from "../lib/auth";
import { logEvent } from "../lib/analytics";
import { registerPushToken } from "../lib/push";
import { SignInGate } from "../components/SignInGate";
import { themedStyles, useTheme } from "../lib/theme";

type Phase = "loading" | "gate" | "app";

export default function RootLayout() {
  const [phase, setPhase] = useState<Phase>("loading");
  const pathname = usePathname();
  const isPublicRoute = pathname === "/privacy";
  const { scheme, colors } = useTheme();
  const styles = themed[scheme];
  // Status bar icons flip against the themed background; screen headers and
  // content grounds follow the palette.
  const statusBarStyle = scheme === "dark" ? "light" : "dark";
  const screenOptions = {
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.ink,
    headerTitleStyle: { fontWeight: "700" as const },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.background },
  };

  // The app is gated on a *permanent* (email-linked) session. An anonymous
  // session or no session shows the sign-in gate; the gate migrates an
  // existing anonymous account in place (preserving its collections) or signs
  // a new user in. We no longer auto-create an anonymous session on launch.
  const evaluate = useCallback(async () => {
    const { hasSession, isAnonymous } = await getAuthStatus();
    setPhase(hasSession && !isAnonymous ? "app" : "gate");
  }, []);

  useEffect(() => {
    evaluate();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      evaluate();
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  // Fire the once-per-launch app_opened + push registration when the user
  // actually reaches the app (not on the sign-in gate).
  const enteredRef = useRef(false);
  useEffect(() => {
    if (phase === "app" && !enteredRef.current) {
      enteredRef.current = true;
      logEvent("app_opened", { platform: "expo" });
      registerPushToken();
    }
  }, [phase]);

  if (isPublicRoute) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style={statusBarStyle} />
          <Stack screenOptions={screenOptions}>
            <Stack.Screen name="privacy" options={{ title: "Privacy Policy" }} />
          </Stack>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (phase === "loading") {
    return (
      <View style={styles.loading}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.loadingMark}
          accessible={false}
          importantForAccessibility="no"
        />
        <Text style={styles.loadingBrand}>Forked</Text>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Starting up…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={statusBarStyle} />
        {phase === "gate" ? (
          <SignInGate onSignedIn={evaluate} />
        ) : (
          <Stack screenOptions={screenOptions}>
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
            <Stack.Screen name="privacy" options={{ title: "Privacy Policy" }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const themed = themedStyles((colors, type) => ({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  loadingMark: { width: 72, height: 72, borderRadius: 20, marginBottom: 4 },
  loadingBrand: { ...type.title, marginBottom: 4 },
  loadingText: { ...type.body, color: colors.inkSecondary },
}));
