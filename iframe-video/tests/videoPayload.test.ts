import { expect, test } from "bun:test";
import { decodeVideoPayload, encodeVideoPayload } from "../src/lib/decodeVideoUrl";

const url = "https://serve.octastream.online/videos/sample.mp4";
const thumbnail = "https://example.com/poster.jpg";

test("generated payloads round-trip with optional metadata and Unicode titles", () => {
  expect(decodeVideoPayload(encodeVideoPayload({ url }))).toEqual({
    url,
    thumbnail: undefined,
    title: undefined,
  });
  const title = "नमस्ते | 🌅";
  const encoded = encodeVideoPayload({ url: `${url}?key=a|b`, thumbnail, title });
  expect(encoded).toMatch(/^[\w-]+$/);
  expect(decodeVideoPayload(encoded)).toEqual({ url: `${url}?key=a%7Cb`, thumbnail, title });
});

test("ASCII embeds use the existing payload format", () => {
  const title = "Sample video";
  expect(encodeVideoPayload({ url, thumbnail, title })).toBe(
    btoa(`${url}|${thumbnail}|${title}`).replace(/=+$/, ""),
  );
});

test.each(["Café", "É²"])("existing Base64 links preserve the title %s", (title) => {
  expect(decodeVideoPayload(btoa(`${url}|${thumbnail}|${title}`))).toEqual({
    url,
    thumbnail,
    title,
  });
});

test("generation requires HTTPS for HLS playlists", () => {
  const playlist = "http://serve.octastream.online/videos/sample.M3U8?quality=hd";
  expect(() => encodeVideoPayload({ url: playlist })).toThrow("HTTPS video URL");

  const securePlaylist = playlist.replace("http:", "https:");
  expect(decodeVideoPayload(encodeVideoPayload({ url: securePlaylist }))?.url).toBe(securePlaylist);
  expect(decodeVideoPayload(btoa(`${playlist}||`))?.url).toBe(playlist);

  const httpVideo = url.replace("https:", "http:");
  expect(decodeVideoPayload(encodeVideoPayload({ url: httpVideo }))?.url).toBe(httpVideo);
});

test("generation rejects unsupported video URLs and invalid thumbnail URLs", () => {
  expect(() => encodeVideoPayload({ url: "" })).toThrow("video URL");
  expect(() => encodeVideoPayload({ url: "https://example.com/sample.mp4" })).toThrow("video URL");
  expect(() => encodeVideoPayload({ url, thumbnail: "file:///poster.jpg" })).toThrow(
    "thumbnail URL",
  );
});

test("direct playback links enforce the host and protocol restrictions", () => {
  expect(
    decodeVideoPayload(btoa("https://serve.octastream.online.example.com/sample.mp4||")),
  ).toBeNull();
  expect(decodeVideoPayload(btoa("ftp://serve.octastream.online/sample.mp4||"))).toBeNull();
});
