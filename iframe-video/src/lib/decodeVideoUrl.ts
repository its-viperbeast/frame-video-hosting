import { ALLOWED_STREAM_HOSTS } from "../config";

export type VideoPayload = {
  url: string;
  thumbnail?: string;
  title?: string;
};

export function decodeVideoPayload(encoded: string): VideoPayload | null {
  try {
    const raw = decodeURIComponent(encoded).replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const [videoPart = "", thumbPart = "", ...titleParts] = atob(padded).split("|");

    const video = new URL(videoPart.trim());
    if (
      (video.protocol !== "http:" && video.protocol !== "https:") ||
      !ALLOWED_STREAM_HOSTS.includes(video.hostname)
    ) {
      return null;
    }

    let thumbnail: string | undefined;
    try {
      const thumb = new URL(thumbPart.trim());
      if (thumb.protocol === "http:" || thumb.protocol === "https:") {
        thumbnail = thumb.href;
      }
    } catch {}

    return {
      url: video.href,
      thumbnail,
      title: titleParts.join("|").trim() || undefined,
    };
  } catch {
    return null;
  }
}
