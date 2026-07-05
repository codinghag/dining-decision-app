import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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

// Ensure there is always a signed-in (anonymous) user. Called once on cold
// start from the root layout. Anonymous users keep a stable auth.users.id, so
// they can later "claim"/upgrade to a permanent account without losing data.
export async function ensureAnonymousSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    return data.session.user.id;
  }
  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn("[supabase] anonymous sign-in failed:", error.message);
    return null;
  }
  return signInData.user?.id ?? null;
}

export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
