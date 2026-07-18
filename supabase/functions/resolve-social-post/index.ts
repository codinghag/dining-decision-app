// resolve-social-post: best-effort extraction of the caption from a shared
// Instagram/TikTok post URL, so the share-target screen can auto-suggest
// matching restaurants instead of making the user type a name from memory.
//
// TikTok has a public oEmbed endpoint (no key, no login wall) that returns
// the caption directly. Instagram serves og:title/og:description meta tags
// to link-preview crawlers (that's how iMessage/WhatsApp previews work), so
// we fetch with a crawler User-Agent and parse them out. Both are best
// effort: on any failure we return nulls and the app falls back to manual
// search — never an error the user has to see.
//
// Request:  POST { "url": string }
// Response: { "caption": string | null, "suggestedQuery": string | null }
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

// Instagram (and most sites) serve full og meta tags to link-preview bots.
const CRAWLER_UA = "facebookexternalhit/1.1";

// Cap how much HTML we parse; og tags live in <head>.
const MAX_HTML_BYTES = 500_000;

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

// <meta property="og:title" content="..."> in either attribute order.
function metaContent(html: string, prop: string): string | null {
  const a = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const b = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(a) ?? html.match(b);
  return m && m[1] ? decodeEntities(m[1]) : null;
}

// Instagram wraps the caption in quotes inside its meta text, e.g.
//   og:title:       Joe's Pizza on Instagram: "Best slice in the city 📍..."
//   og:description: 1,234 likes, 56 comments - joespizza on July 1: "..."
// Pull out the quoted caption when present; otherwise use the text as is.
function captionFrom(text: string | null): string | null {
  if (!text) return null;
  const quoted = text.match(/:\s*[“"]([\s\S]+?)[”"]\s*$/) ??
    text.match(/[“"]([\s\S]{10,})[”"]/);
  const out = (quoted ? quoted[1] : text).trim();
  return out || null;
}

function cleanForSearch(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\w.]+/g, " ") // hashtags and @mentions
    .replace(/[\p{Extended_Pictographic}️]/gu, " ")
    .replace(/["“”|•·]+/g, " ") // keep apostrophes — "Joe's Pizza"
    .replace(/\s+/g, " ")
    .trim();
}

// Pages that didn't give up a real caption (login walls, bare site titles)
// must yield null, not a junk search query.
const JUNK_TEXT =
  /^(instagram|tiktok|login|log in|sign up|create an account)\b|•\s*instagram$|log ?in to instagram|tiktok - make your day/i;

function meaningful(text: string | null): string | null {
  if (!text) return null;
  return JUNK_TEXT.test(text.trim()) ? null : text;
}

// Turn caption-ish text into a Places text-search query. Food posts very
// often name the spot after a 📍 pin — trust that first. Otherwise the first
// line of the caption, cleaned and capped, is a decent query (Places text
// search tolerates extra words).
function buildSuggestedQuery(texts: (string | null)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const pin = t.match(/📍\s*([^\n#|•·—]+)/u);
    if (pin) {
      const q = cleanForSearch(pin[1]);
      if (q) return q.split(/\s+/).slice(0, 8).join(" ");
    }
  }
  for (const t of texts) {
    if (!t) continue;
    const q = cleanForSearch(t.split(/\n/)[0]);
    if (q.length >= 3) return q.split(/\s+/).slice(0, 10).join(" ");
  }
  return null;
}

// Instagram serves real og tags to residential/link-preview IPs but a login
// wall to data-center IPs (which is where this function runs). The
// /embed/captioned/ endpoint still server-renders the caption — but only for
// the crawler UA; a browser UA gets an empty React shell. So this is the
// working Instagram path in practice: embed URL + CRAWLER_UA.
function instagramEmbedUrl(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  return `https://www.instagram.com/${m[1]}/${m[2]}/embed/captioned/`;
}

function captionFromInstagramEmbed(html: string): string | null {
  // Preferred: the JSON blob's "caption":"..." (JSON-unescape it).
  const j = html.match(/"caption"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (j) {
    try {
      const s = JSON.parse(`"${j[1]}"`).trim();
      if (s) return s;
    } catch (_e) {
      // malformed escape — fall through to the markup path
    }
  }
  // Fallback: the rendered <div class="Caption">…</div> markup. It opens with
  // the poster's username link then <br><br>, so drop through the first <br>
  // run before stripping tags — otherwise the "caption" is just the username.
  const d = html.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/) ??
    html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);
  if (d) {
    const inner = d[1].replace(/^[\s\S]*?<br\s*\/?>(?:\s*<br\s*\/?>)*/i, "");
    const s = decodeEntities(
      inner.replace(/<br[^>]*\/?>/gi, "\n").replace(/<[^>]+>/g, " "),
    ).replace(/[ \t]+/g, " ").trim();
    if (s) return s;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return jsonResponse({ error: "url (string) is required" }, 400);
    }

    let title: string | null = null;
    let description: string | null = null;

    if (/tiktok\.com/i.test(url)) {
      try {
        const res = await fetch(
          `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (typeof data.title === "string") title = data.title;
        }
      } catch (_e) {
        // fall through to the og-tag scrape below
      }
    }

    if (!title) {
      try {
        const res = await fetch(url, {
          redirect: "follow",
          headers: { "User-Agent": CRAWLER_UA, "Accept-Language": "en" },
        });
        const html = (await res.text()).slice(0, MAX_HTML_BYTES);
        title = metaContent(html, "og:title") ?? metaContent(html, "twitter:title");
        description = metaContent(html, "og:description") ??
          metaContent(html, "description");
      } catch (_e) {
        // best effort — return nulls, the app falls back to manual search
      }
    }

    title = meaningful(title);
    description = meaningful(description);
    let caption = meaningful(captionFrom(description) ?? captionFrom(title));

    // Instagram from a data-center IP: og tags were a login wall — go to the
    // embed endpoint instead.
    if (!caption) {
      const embedUrl = instagramEmbedUrl(url);
      if (embedUrl) {
        try {
          const res = await fetch(embedUrl, {
            redirect: "follow",
            headers: { "User-Agent": CRAWLER_UA, "Accept-Language": "en" },
          });
          const html = (await res.text()).slice(0, MAX_HTML_BYTES);
          caption = meaningful(captionFromInstagramEmbed(html));
        } catch (_e) {
          // best effort — return whatever we have
        }
      }
    }

    const suggestedQuery = buildSuggestedQuery([caption, title, description]);
    return jsonResponse({ caption, suggestedQuery });
  } catch (err) {
    console.error("[resolve-social-post] unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
