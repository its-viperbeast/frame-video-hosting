/* JW Player wiring ported from p-tape (jw-video-player.js, video-resume.js, play-gate.js). Player vendored at public/js/jwplayer.js. */

export interface JwPlayerInstance {
  setup(options: Record<string, unknown>): JwPlayerInstance;
  remove(): void;
  play(state?: boolean): Promise<void> | void;
  pause(): void;
  seek(position: number): void;
  setMute(muted: boolean): void;
  getState(): string;
  getPosition(): number;
  getDuration(): number;
  getContainer(): HTMLElement;
  on(event: string, handler: () => void): void;
  once(event: string, handler: () => void): void;
}

declare global {
  interface Window {
    jwplayer?: { (id: string): JwPlayerInstance; key?: string };
  }
}

const JW_KEY = "TBhdcQHKHY74y9vtZHV29b53/Xd4qG6Xa7AbPaIjZq8=";
const JW_BASE = "https://ssl.p.jwpcdn.com/player/v/8.30.1/";
const SEEK_STEP_S = 10;
const DOUBLE_CLICK_MS = 500;
const STORAGE_PREFIX = "iframe-video:resume:";
const SAVE_INTERVAL_MS = 5000;
const MIN_RESUME_SECONDS = 5;
const END_GRACE_SECONDS = 30;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let loadPromise: Promise<void> | null = null;

export function ensureJwPlayer(): Promise<void> {
  if (typeof window.jwplayer === "function") return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const fail = (message: string) => {
        loadPromise = null;
        reject(new Error(message));
      };
      const script = document.createElement("script");
      script.src = "/js/jwplayer.js";
      script.referrerPolicy = "origin";
      script.onload = () => {
        if (typeof window.jwplayer === "function") resolve();
        else fail("JW Player failed to initialize.");
      };
      script.onerror = () => fail("JW Player script failed to load.");
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

export interface JwSetupOptions {
  src: string;
  fileType: "hls" | "mp4";
  poster?: string;
  title?: string;
  resumeKey: string;
  onPlay?: () => void;
}

export function setupJwPlayer(
  target: HTMLElement,
  root: HTMLElement,
  { src, fileType, poster, title, resumeKey, onPlay }: JwSetupOptions,
): JwPlayerInstance {
  const api = window.jwplayer;
  if (!api || !target.id) throw new Error("JW Player is not loaded.");
  api.key = JW_KEY;

  const player = api(target.id).setup({
    file: src,
    base: JW_BASE,
    type: fileType,
    width: "100%",
    height: "100%",
    preload: "metadata",
    primary: "html5",
    playbackRateControls: true,
    stretching: "uniform",
    autostart: false,
    mute: false,
    ...(poster ? { image: poster } : {}),
    ...(title ? { title } : {}),
  });
  attachResume(player, resumeKey);
  player.on("play", () => onPlay?.());
  attachDoubleClickSeek(player, root);
  player.on("ready", () => addForwardButtons(player));
  return player;
}

export function playWithSound(player: JwPlayerInstance): void {
  const playMuted = () => {
    try {
      player.setMute(true);
      player.play(true);
    } catch {
      /* browser blocked even muted playback; JW shows its own play button */
    }
  };
  try {
    player.setMute(false);
    const started = player.play(true);
    if (started && typeof started.catch === "function") started.catch(playMuted);
  } catch {
    playMuted();
  }
}

function seekBy(player: JwPlayerInstance, delta: number): boolean {
  const duration = player.getDuration();
  if (!(duration > 0)) return false;
  player.seek(Math.min(Math.max(player.getPosition() + delta, 0), duration));
  return true;
}

// JW's rewind icon with only the arrow mirrored; digits shifted right so "10" stays readable.
const FORWARD_SVG =
  '<svg class="jw-svg-icon jw-svg-icon-rewind" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" focusable="false">' +
  '<path transform="matrix(-1 0 0 1 240 0)" d="M214.1,57.778v125.3a4.867,4.867,0,0,1-4.8,4.8H146.6v-19.3h48.2v-96.4H79.1v19.3c0,5.3-3.6,7.2-8,4.3l-41.8-27.9a6.013,6.013,0,0,1-2.7-8,5.887,5.887,0,0,1,2.7-2.7l41.8-27.9c4.4-2.9,8-1,8,4.3v19.3H209.2A4.974,4.974,0,0,1,214.1,57.778Z"></path>' +
  '<path transform="translate(82.6 0)" d="M113.2,131.078a21.589,21.589,0,0,0-17.7-10.6,21.589,21.589,0,0,0-17.7,10.6,44.769,44.769,0,0,0,0,46.3,21.589,21.589,0,0,0,17.7,10.6,21.589,21.589,0,0,0,17.7-10.6,44.769,44.769,0,0,0,0-46.3Zm-17.7,47.2c-7.8,0-14.4-11-14.4-24.1s6.6-24.1,14.4-24.1,14.4,11,14.4,24.1S103.4,178.278,95.5,178.278Zm-43.4,9.7v-51l-4.8,4.8-6.8-6.8,13-13a4.8,4.8,0,0,1,8.2,3.4v62.7l-9.6-.1Z"></path>' +
  "</svg>";

function addForwardButtons(player: JwPlayerInstance): void {
  const container = player.getContainer();
  const label = `Forward ${SEEK_STEP_S} Seconds`;

  for (const rewind of container.querySelectorAll(
    ".jw-display-icon-rewind, .jw-button-container .jw-icon-rewind",
  )) {
    const forward = rewind.cloneNode(true) as HTMLElement;
    const icon = forward.matches('[role="button"]')
      ? forward
      : forward.querySelector('[role="button"]');
    icon?.setAttribute("aria-label", label);
    const svg = forward.querySelector("svg");
    if (svg) svg.outerHTML = FORWARD_SVG;
    const tooltip = forward.querySelector(".jw-text");
    if (tooltip) tooltip.textContent = label;

    const onActivate = (e: Event) => {
      e.stopPropagation();
      seekBy(player, SEEK_STEP_S);
    };
    forward.addEventListener("click", onActivate);
    forward.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onActivate(e);
    });
    const anchor = rewind.classList.contains("jw-display-icon-rewind")
      ? container.querySelector(".jw-display-icon-display")
      : rewind;
    (anchor ?? rewind).after(forward);
  }
}

function showSeekFlash(container: Element, side: -1 | 1, e: MouseEvent): void {
  container.querySelector(".seek-flash")?.remove();
  const flash = document.createElement("div");
  flash.className = "seek-flash";
  flash.dataset.side = side < 0 ? "back" : "fwd";
  flash.setAttribute("aria-hidden", "true");
  flash.innerHTML = `<span class="seek-flash__ripple"></span><span class="seek-flash__arrows"><i></i><i></i><i></i></span><span class="seek-flash__label">${SEEK_STEP_S} seconds</span>`;
  container.append(flash);

  const rect = flash.getBoundingClientRect();
  const ripple = flash.firstElementChild as HTMLElement;
  ripple.style.left = `${e.clientX - rect.left}px`;
  ripple.style.top = `${e.clientY - rect.top}px`;
  setTimeout(() => flash.remove(), 750);
}

// Capture phase swallows the second click so JW never sees its own
// double-click (fullscreen toggle); pre-click play state is restored.
function attachDoubleClickSeek(player: JwPlayerInstance, root: HTMLElement): void {
  let lastClick = 0;
  let lastSide = 0;
  let stateBefore = "";

  root.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(e instanceof MouseEvent) || !(target instanceof Element)) return;
      if (target.closest('.jw-controlbar, .jw-settings-menu, button, [role="button"], a')) return;

      const container = player.getContainer();
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const side = x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0;
      const now = Date.now();

      if (side === 0 || side !== lastSide || now - lastClick > DOUBLE_CLICK_MS) {
        lastClick = now;
        lastSide = side;
        stateBefore = player.getState();
        return;
      }

      lastClick = now;
      if (!seekBy(player, side * SEEK_STEP_S)) return;

      e.stopPropagation();
      showSeekFlash(container, side, e);
      if (stateBefore === "playing" || stateBefore === "buffering") player.play();
      else if (stateBefore === "paused") player.pause();
    },
    true,
  );
}

export function getResumePosition(key: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const data = JSON.parse(raw) as { t?: unknown; ts?: unknown };
    const position = Number(data?.t);
    if (!Number.isFinite(position) || position <= MIN_RESUME_SECONDS) return null;
    if (typeof data?.ts === "number" && Date.now() - data.ts > MAX_AGE_MS) {
      clearResumePosition(key);
      return null;
    }
    return position;
  } catch {
    return null;
  }
}

export function clearResumePosition(key: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

// The saved position is read at play time, not setup time: the gate's
// "Start over" clears it between setup and play.
function attachResume(player: JwPlayerInstance, key: string): void {
  let saved: number | null = null;
  let resumed = false;
  let lastSave = 0;
  let lastSeekTry = 0;
  // True while a seek we triggered is in flight; a user seek ends auto-resume.
  let selfSeek = false;

  const persist = () => {
    const current = player.getPosition();
    if (!Number.isFinite(current) || current <= MIN_RESUME_SECONDS) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ t: current, ts: Date.now() }));
    } catch {
      /* storage full or privacy mode: resume stays disabled */
    }
  };
  const seekToSaved = () => {
    if (saved === null) return;
    selfSeek = true;
    player.seek(saved);
  };

  player.once("play", () => {
    saved = getResumePosition(key);
    if (saved === null) {
      resumed = true;
      return;
    }
    const duration = player.getDuration();
    if (duration > 0 && saved >= duration - END_GRACE_SECONDS) {
      resumed = true;
      clearResumePosition(key);
      return;
    }
    seekToSaved();
  });
  player.on("seek", () => {
    if (selfSeek) selfSeek = false;
    else if (saved !== null) resumed = true;
  });
  player.on("time", () => {
    const now = Date.now();
    if (!resumed && saved !== null) {
      if (player.getPosition() >= saved - 2) resumed = true;
      else if (now - lastSeekTry >= 1000) {
        lastSeekTry = now;
        seekToSaved();
        return;
      }
    }
    if (now - lastSave < SAVE_INTERVAL_MS) return;
    lastSave = now;
    persist();
  });
  player.on("pause", persist);
  const onPageHide = () => persist();
  window.addEventListener("pagehide", onPageHide);
  player.on("remove", () => window.removeEventListener("pagehide", onPageHide));
  player.on("complete", () => clearResumePosition(key));
}
