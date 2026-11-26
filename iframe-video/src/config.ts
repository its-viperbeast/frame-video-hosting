export const ALLOWED_STREAM_HOSTS: readonly string[] = [
  "video.twimg.com",
  "serve.octastream.online",
  "video.sexwave.net",
  "test-videos.co.uk"
];

export const NO_REFERRER_HOSTS: readonly string[] = ["video.twimg.com"];

export const STORAGE_POSITION_PREFIX = "video-player:pos:";
export const STORAGE_MUTED_KEY = "video-player:muted";

export const BUFFERING_GIFS = [
  { src: "/buffering/1.gif", ms: 2000 },
  { src: "/buffering/2.gif", ms: 2000 },
  { src: "/buffering/3.gif", ms: 4000 },
] as const;

export const IDLE_HIDE_MS = 2500;
export const VOLUME_PANEL_MS = 2000;
export const DOUBLE_TAP_MS = 350;
export const SKIP_SECONDS = 10;
export const HINT_ANIMATION_MS = 700;
export const RESUME_END_MARGIN_SEC = 10;

export const PLAYBACK_RATE_MAX = 2;
export const PLAYBACK_RATE_MIN = 0.5;
export const PLAYBACK_RATE_STEP = 0.25;

export const SYNC_EVENTS = [
  "play",
  "pause",
  "playing",
  "waiting",
  "volumechange",
  "ratechange",
] as const;

export const KEY_ACTIONS: Record<string, string> = {
  " ": "play",
  k: "play",
  ArrowLeft: "back",
  ArrowRight: "fwd",
  m: "mute",
  f: "fs",
};
