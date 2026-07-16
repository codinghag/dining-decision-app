import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { logEvent } from "./analytics";
import { buildMapsUrl } from "./maps";
import type { Restaurant } from "./db";

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

// How the share actually resolved, so callers can show feedback. Silent
// clipboard writes looked like the Share button "did nothing" on web.
export type ShareOutcome = "shared" | "copied" | "dismissed";

async function shareMessage(message: string, url: string): Promise<ShareOutcome> {
  if (Platform.OS === "web") {
    // Web Share API where the browser has it (mobile Chrome/Safari, some
    // desktops); otherwise copy and tell the caller so the UI can say so.
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ text: message, url });
        return "shared";
      } catch {
        // User closed the sheet (AbortError) — not an error, nothing sent.
        return "dismissed";
      }
    }
    await Clipboard.setStringAsync(message);
    return "copied";
  }
  await Share.share(
    Platform.OS === "ios" ? { message, url } : { message },
  );
  return "shared";
}

// Share a collection invite; returns how it resolved so the screen can show
// "Link copied" when there was no visible share sheet.
export async function shareCollectionInvite(
  collectionId: string,
  collectionName: string,
): Promise<ShareOutcome> {
  const url = collectionInviteUrl(collectionId);
  const message = `Join my "${collectionName}" collection on Forked: ${url}`;
  const outcome = await shareMessage(message, url);
  if (outcome !== "dismissed") {
    await logEvent("invite_sent", { collection_id: collectionId, outcome });
  }
  return outcome;
}

// Share a single restaurant (name + address + a Google Maps link that works
// for anyone, app or not).
export async function shareRestaurant(r: Restaurant): Promise<ShareOutcome> {
  const url = buildMapsUrl(r);
  const parts = [r.name, r.address].filter(Boolean).join(" — ");
  const message = `${parts}\n${url}`;
  const outcome = await shareMessage(message, url);
  if (outcome !== "dismissed") {
    await logEvent("restaurant_shared", { restaurant_id: r.id, outcome });
  }
  return outcome;
}
