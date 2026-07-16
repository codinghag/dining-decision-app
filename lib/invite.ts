import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { logEvent } from "./analytics";

// Canonical web origin. www (not the apex) because the apex 308-redirects to
// www, and Android App Links verification doesn't follow redirects — the
// intent filter in app.json claims www, so shared links must use it too.
const WEB_ORIGIN = "https://www.outforked.com";

// Build the shareable invite link for a collection. The collection_id in the
// path IS the invite token (an unguessable UUID); opening the link routes to
// the join screen which auto-joins the visitor. One https link serves every
// recipient: Android with the app installed opens it directly via App Links
// (assetlinks.json on the domain), everyone else lands on the web app.
// (Previously this shared a diningdecision:// deep link from native, which
// was dead weight for recipients without the app.)
export function collectionInviteUrl(collectionId: string): string {
  return `${WEB_ORIGIN}/collection/${collectionId}/join`;
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
