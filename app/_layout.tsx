import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useShareIntent } from "expo-share-intent";
import { supabase } from "../lib/supabase";
import { ensureSession, getAuthStatus } from "../lib/auth";
import { logEvent } from "../lib/analytics";
import { registerPushToken } from "../lib/push";
import { SignInGate } from "../components/SignInGate";
import { themedStyles, useTheme } from "../lib/theme";

type Phase = "loading" | "gate" | "app";

export default function RootLayout() {
  const [phase, setPhase] = useState<Phase>("loading");
  const pathname = usePathname();
  const isPublicRoute = pathname === "/privacy";
  // The invite edge: any /collection/* route (join, browse, decide) works
  // without an account — losing a voter at the login screen is the one thing
  // that kills a voting product. An anonymous session is created on the fly;
  // the gate only guards persistence (home screen, share-target saves).
  const isGuestRoute = pathname.startsWith("/collection/");
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

  // Auth gates persistence, not participation. Guest routes (/collection/*)
  // run on an anonymous session created on demand; everything else is gated
  // on a *permanent* (email-linked) session. The gate migrates an existing
  // anonymous account in place (preserving its lists and votes) or signs a
  // new user in.
  const evaluate = useCallback(async () => {
    const { hasSession, isAnonymous } = await getAuthStatus();
    if (hasSession && !isAnonymous) {
      setPhase("app");
      return;
    }
    if (isGuestRoute) {
      try {
        await ensureSession();
        setPhase("app");
      } catch {
        // Anonymous sign-ins disabled or network down — fall back to the gate
        // rather than a dead screen.
        setPhase("gate");
      }
      return;
    }
    setPhase("gate");
  }, [isGuestRoute]);

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

  // Android share-sheet target: a post shared from Instagram/TikTok/etc.
  // arrives here. Native-module only (self-disables on web and in Expo Go);
  // held until the user is through the sign-in gate, then routed to the
  // save flow.
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (phase !== "app" || !hasShareIntent) return;
    const text = shareIntent.webUrl ?? shareIntent.text ?? "";
    const title = shareIntent.meta?.title ?? "";
    resetShareIntent();
    router.push({
      pathname: "/share-target",
      params: { text, title },
    });
  }, [phase, hasShareIntent, shareIntent, resetShareIntent, router]);

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
            <Stack.Screen name="index" options={{ title: "Saved" }} />
            <Stack.Screen
              name="collection/[id]/index"
              options={{ title: "List" }}
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
            <Stack.Screen
              name="share-target"
              options={{ title: "Save to Forked", presentation: "modal" }}
            />
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
