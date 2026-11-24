import { ALLOWED_STREAM_HOSTS } from "../config";

// The first field of a legacy payload is an absolute video URL.
const UTF8_PREFIX = "utf8|";

export type VideoPayload = {
  url: string;
  thumbnail?: string;
  title?: string;
};

function parseHttpUrl(value?: string): URL | undefined {
  try {
    const input = value?.trim();
    if (!input) return undefined;
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function requireVideoUrl(value: string): URL {
  const url = parseHttpUrl(value);
  if (!url || !ALLOWED_STREAM_HOSTS.includes(url.hostname)) {
    throw new Error(`Enter an HTTP or HTTPS video URL from ${ALLOWED_STREAM_HOSTS.join(", ")}.`);
  }
  return url;
}

export function isHlsPlaylist(url: URL): boolean {
  return url.pathname.toLowerCase().endsWith(".m3u8");
}

export function encodeVideoPayload({ url, thumbnail, title }: VideoPayload): string {
  const video = requireVideoUrl(url);
  if (video.protocol === "http:" && isHlsPlaylist(video)) {
    throw new Error("Use an HTTPS video URL for HLS playlists.");
  }
  const poster = parseHttpUrl(thumbnail);
  if (!poster && thumbnail?.trim()) throw new Error("Enter an HTTP or HTTPS thumbnail URL.");

  // Escape URL pipes to preserve the payload delimiters.
  const payload = [
    video.href.replaceAll("|", "%7C"),
    poster?.href.replaceAll("|", "%7C") ?? "",
    title?.trim() ?? "",
  ].join("|");
  let binaryPayload = payload;
  if (/\P{ASCII}/u.test(payload)) {
    const bytes = new TextEncoder().encode(payload);
    binaryPayload = UTF8_PREFIX + Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  }
  return btoa(binaryPayload).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeVideoPayload(encoded: string): VideoPayload | null {
  try {
    const base64 = decodeURIComponent(encoded).replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    let payload = atob(padded);
    if (payload.startsWith(UTF8_PREFIX)) {
      const bytes = Uint8Array.from(payload.slice(UTF8_PREFIX.length), (character) =>
        character.charCodeAt(0),
      );
      payload = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    const [videoPart, thumbnailPart, ...titleParts] = payload.split("|");

    return {
      url: requireVideoUrl(videoPart).href,
      thumbnail: parseHttpUrl(thumbnailPart)?.href,
      title: titleParts.join("|").trim() || undefined,
    };
  } catch {
    return null;
  }
}
