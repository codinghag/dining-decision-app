import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { getUserId, supabase } from "./supabase";

// Register this device's Expo push token so the backend can notify the user
// when a Decide Now session starts. Best-effort and native-only:
//   - Push tokens are a native concept; on web we skip silently.
//   - We never throw into the app flow — a denied permission or a missing
//     projectId just means no push, not a broken start-up.
// Called once on cold start from the root layout.
export async function registerPushToken(): Promise<void> {
  try {
    // Push tokens don't exist on web, and simulators/emulators can't get one.
    if (Platform.OS === "web" || !Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    // Required outside Expo Go: EAS-built binaries can't reliably auto-infer
    // the project id, so read it from app.json's expo.extra.eas.projectId
    // (set by `eas init`) rather than relying on getExpoPushTokenAsync()'s
    // zero-arg auto-detection, which throws on a bare EAS/dev-client build.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("[push] no eas.projectId configured; skipping (run `eas init`)");
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    if (!token) return;

    const userId = await getUserId();
    if (!userId) return;

    // Upsert on (user_id, expo_push_token); refresh updated_at each start.
    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,expo_push_token" },
    );
    if (error) {
      console.warn("[push] failed to save push token:", error.message);
    }
  } catch (err) {
    // Never let push registration break start-up.
    console.warn("[push] registration skipped:", err);
  }
}
