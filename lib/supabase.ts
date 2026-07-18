import "react-native-url-polyfill/auto";
import {
  createClient,
  FunctionsHttpError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced loudly in dev so a missing .env is obvious rather than a silent
  // "network error" later.
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "Copy .env.example to .env and fill them in.",
  );
}

// On web, supabase-js uses window.localStorage by default. On native there is no
// localStorage, so we hand it AsyncStorage. This is the standard supabase-js +
// Expo cross-platform pattern.
const storage = Platform.OS === "web" ? undefined : AsyncStorage;

export const supabase: SupabaseClient = createClient(
  supabaseUrl ?? "http://localhost",
  supabaseAnonKey ?? "public-anon-key",
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      // URL-based session detection only makes sense in the browser.
      detectSessionInUrl: Platform.OS === "web",
    },
  },
);

// Sessions must survive until an explicit sign-out (refresh tokens never
// expire; only access tokens do, hourly). On native, supabase-js's refresh
// timer doesn't fire while the app is backgrounded or killed, so a long-idle
// app can come back with a stale token and look signed out. The standard
// Supabase + Expo pattern: drive token refresh from AppState — refresh
// aggressively while foregrounded, pause when backgrounded.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// supabase-js nulls `data` and throws FunctionsHttpError (with the raw
// Response in `.context`) on any non-2xx reply — which is how every edge
// function in this app reports an error — so the `{ error: "..." }` message
// they craft has to be unwrapped from the thrown error, not read off `data`
// (a `data?.error` check there is unreachable dead code).
export async function invokeEdgeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const message: string | undefined = await error.context
        .json()
        .then((b: { error?: string }) => b?.error)
        .catch(() => undefined);
      if (message) throw new Error(message);
    }
    throw error;
  }
  return data as T;
}
