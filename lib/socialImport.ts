import { strFromU8, unzipSync } from "fflate";

export type SocialPlatform = "instagram" | "tiktok";

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

// Neither Instagram nor TikTok exposes their "Download Your Data" export
// schema as a stable, documented format -- it has changed shape more than
// once. Rather than parsing exact key paths (fragile, breaks silently on the
// next format change), we scan all text content in the file for URLs
// matching the known post-link shapes. Works regardless of whether the
// export is JSON, HTML, or something else entirely.
const LINK_PATTERNS: { platform: SocialPlatform; re: RegExp }[] = [
  {
    platform: "instagram",
    re: /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels)\/[A-Za-z0-9_-]+/g,
  },
  {
    platform: "tiktok",
    re: /https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[\w.-]+\/video\/\d+|[A-Za-z0-9]+)/g,
  },
];

// Cap total text scanned so a huge "download everything" export (which can
// include media file listings etc.) can't blow up memory on-device.
const MAX_SCAN_BYTES = 20 * 1024 * 1024;

function extractFromText(text: string): SocialLink[] {
  const found: SocialLink[] = [];
  for (const { platform, re } of LINK_PATTERNS) {
    for (const match of text.matchAll(re)) {
      found.push({ platform, url: match[0] });
    }
  }
  return found;
}

// Match a single pasted/shared URL (or text containing one) against the
// known Instagram/TikTok post shapes. Used by the paste-link tab and the
// Android share-sheet target, not just bulk export parsing.
export function matchSocialLink(text: string): SocialLink | null {
  return extractFromText(text)[0] ?? null;
}

function isTextLikeEntry(filename: string): boolean {
  return /\.(json|html?|txt)$/i.test(filename);
}

// Parse an uploaded Instagram/TikTok "Download Your Data" export -- either a
// raw .json/.html file, or the .zip both platforms actually deliver -- and
// return the deduped list of saved-post links found inside.
export async function extractSocialLinks(
  fileUri: string,
  fileName: string,
): Promise<SocialLink[]> {
  const res = await fetch(fileUri);
  const buffer = new Uint8Array(await res.arrayBuffer());

  let combinedText: string;

  if (/\.zip$/i.test(fileName)) {
    const entries = unzipSync(buffer, {
      filter: (file) => isTextLikeEntry(file.name),
    });
    let text = "";
    for (const bytes of Object.values(entries)) {
      if (text.length >= MAX_SCAN_BYTES) break;
      text += strFromU8(bytes) + "\n";
    }
    combinedText = text.slice(0, MAX_SCAN_BYTES);
  } else {
    combinedText = strFromU8(buffer).slice(0, MAX_SCAN_BYTES);
  }

  const links = extractFromText(combinedText);

  // Dedupe by URL.
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}
