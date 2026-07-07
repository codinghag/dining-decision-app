import { Platform, Share } from "react-native";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { logEvent } from "./analytics";

// Build the shareable invite link for a collection. The collection_id in the
// path IS the invite token (an unguessable UUID); opening the link routes to
// the join screen which auto-joins the visitor. Linking.createURL produces a
// native deep link (diningdecision://...) on iOS/Android and an absolute web
// URL (https://host/...) on web, so one call covers all platforms.
export function collectionInviteUrl(collectionId: string): string {
  return Linking.createURL(`/collection/${collectionId}/join`);
}

// Open the native share sheet (iOS/Android) or copy to clipboard (web), then
// log invite_sent. We log optimistically — we can't verify the OS share sheet
// was actually completed, which is an acceptable approximation for v1.
export async function shareCollectionInvite(
  collectionId: string,
  collectionName: string,
): Promise<void> {
  const url = collectionInviteUrl(collectionId);
  const message = `Join my "${collectionName}" dining collection: ${url}`;

  if (Platform.OS === "web") {
    await Clipboard.setStringAsync(url);
  } else {
    await Share.share({ message, url });
  }

  await logEvent("invite_sent", { collection_id: collectionId });
}
