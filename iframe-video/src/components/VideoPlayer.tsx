import { useEffect, useRef } from "react";
import type Hls from "hls.js";
import {
  BUFFERING_GIFS,
  DOUBLE_TAP_MS,
  HINT_ANIMATION_MS,
  IDLE_HIDE_MS,
  KEY_ACTIONS,
  NO_REFERRER_HOSTS,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  PLAYBACK_RATE_STEP,
  RESUME_END_MARGIN_SEC,
  SKIP_SECONDS,
  STORAGE_MUTED_KEY,
  STORAGE_POSITION_PREFIX,
  SYNC_EVENTS,
} from "../config";
import { isHlsPlaylist } from "../lib/decodeVideoUrl";
import { Icon } from "./icons";
import "./video-player.css";

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function storageId(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function PlayPauseIcons() {
  return (
    <>
      <Icon name="play" className="i-play fill-current" />
      <Icon name="pause" className="i-pause fill-current" />
    </>
  );
}

export function VideoPlayer({
  url,
  poster,
  title,
}: {
  url: string;
  poster?: string;
  title?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoUrl = new URL(url);
  const isHls = isHlsPlaylist(videoUrl);
  const noReferrer = NO_REFERRER_HOSTS.includes(videoUrl.hostname);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let referrerMeta: HTMLMetaElement | undefined;
    if (noReferrer) {
      referrerMeta = document.createElement("meta");
      referrerMeta.name = "referrer";
      referrerMeta.content = "no-referrer";
      document.head.appendChild(referrerMeta);
    }

    let store: Storage | Record<string, string> = {};
    try {
      store = localStorage;
    } catch {
      // Private browsing can block localStorage.
    }

    const el = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    const video = el<HTMLVideoElement>("video");
    const seek = el<HTMLInputElement>(".video-player__seek");
    const volume = el<HTMLInputElement>(".video-player__vol");
    const tip = el<HTMLElement>(".video-player__tip");
    const hint = el<HTMLElement>(".video-player__hint");
    const speed = el<HTMLElement>(".video-player__speed");
    const time = el<HTMLElement>(".video-player__time");
    const qualityBtn = el<HTMLButtonElement>(".video-player__quality-btn");
    const qualityMenu = el<HTMLElement>(".video-player__quality-menu");
    const buffering = el<HTMLImageElement>(".video-player__buffering");
    const positionKey = `${STORAGE_POSITION_PREFIX}${storageId(url)}`;

    if (noReferrer) {
      video.setAttribute("referrerpolicy", "no-referrer");
      if (!isHls) video.src = url;
    }

    let resumeAt = Number(store[positionKey]) || 0;
    let idleTimer = 0;
    let tapTimer = 0;
    let bufferingTimer = 0;
    let bufferingIndex = 0;
    let wasWaiting = false;
    let lastTapAt = 0;
    let skipAccum = 0;
    let pickedQuality = -1;
    let hls: Hls | null = null;
    let disposed = false;

    const showError = () => root.classList.add("is-error");

    const togglePlay = () => {
      if (video.paused) void video.play().catch(() => {});
      else video.pause();
    };

    const qualityLabel = (level: { height: number; bitrate: number }) =>
      level.height > 0 ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`;

    const markQualitySelection = () => {
      if (!hls) return;
      const selected = pickedQuality < 0 ? null : hls.levels[pickedQuality];
      qualityBtn.textContent = selected ? qualityLabel(selected) : "Auto";
      for (const btn of qualityMenu.querySelectorAll<HTMLElement>("[data-quality]")) {
        btn.classList.toggle("is-active", Number(btn.dataset.quality) === pickedQuality);
      }
    };

    const buildQualityMenu = () => {
      if (!hls || hls.levels.length < 2) {
        root.classList.remove("has-quality");
        qualityMenu.hidden = true;
        return;
      }

      root.classList.add("has-quality");
      const ranked = hls.levels
        .map((level, index) => ({ level, index }))
        .sort((a, b) => b.level.height - a.level.height || b.level.bitrate - a.level.bitrate);

      qualityMenu.innerHTML =
        `<button type="button" data-quality="-1">Auto</button>` +
        ranked
          .map(
            ({ level, index }) =>
              `<button type="button" data-quality="${index}">${qualityLabel(level)}</button>`,
          )
          .join("");
      markQualitySelection();
    };

    const wakeControls = () => {
      root.classList.remove("is-idle");
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        root.classList.toggle("is-idle", !video.paused);
      }, IDLE_HIDE_MS);
    };

    const skipBy = (delta: number, label = delta) => {
      if (!video.readyState) return;
      video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), video.duration);
      hint.textContent = label < 0 ? `« ${-label}s` : `${label}s »`;
      hint.dataset.side = label < 0 ? "l" : "r";
      hint.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: HINT_ANIMATION_MS,
        easing: "ease-in",
      });
    };

    const toggleFullscreen = () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return;
      }
      if (root.requestFullscreen) {
        void root
          .requestFullscreen()
          .then(() => {
            if (video.videoWidth > video.videoHeight) {
              const orientation = screen.orientation as ScreenOrientation & {
                lock?: (mode: string) => Promise<void>;
              };
              void orientation.lock?.("landscape");
            }
          })
          .catch(() => {});
        return;
      }
      (
        video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
      ).webkitEnterFullscreen?.();
    };

    const actions: Record<string, () => void> = {
      play: togglePlay,
      start: () => {
        if (!root.classList.contains("is-started") && resumeAt > 0) {
          resumeAt = 0;
          delete store[positionKey];
          video.currentTime = 0;
          root.classList.remove("has-resume");
          void video.play().catch(() => {});
          return;
        }
        togglePlay();
      },
      back: () => skipBy(-SKIP_SECONDS),
      fwd: () => skipBy(SKIP_SECONDS),
      mute: () => {
        video.muted = !video.muted;
        video.volume ||= 1;
      },
      speed: () => {
        video.playbackRate =
          video.playbackRate >= PLAYBACK_RATE_MAX
            ? PLAYBACK_RATE_MIN
            : video.playbackRate + PLAYBACK_RATE_STEP;
      },
      quality: () => {
        if (!root.classList.contains("has-quality")) return;
        qualityMenu.hidden = !qualityMenu.hidden;
      },
      fs: toggleFullscreen,
      retry: () => location.reload(),
    };

    const updateProgress = () => {
      const duration = video.duration || 0;
      const buffered = video.buffered;
      const bufferedEnd = buffered.length > 0 ? buffered.end(buffered.length - 1) : 0;
      seek.max = String(duration);
      seek.valueAsNumber = video.currentTime;
      seek.style.cssText = `--p:${(video.currentTime / duration) * 100 || 0}%;--b:${(bufferedEnd / duration) * 100 || 0}%`;
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    };

    const syncUi = () => {
      if (!video.paused) root.classList.add("is-started");

      const waiting = !video.paused && video.readyState < 3;
      root.classList.toggle("is-playing", !video.paused);
      root.classList.toggle("is-waiting", waiting);

      if (waiting !== wasWaiting) {
        wasWaiting = waiting;
        clearTimeout(bufferingTimer);
        bufferingTimer = 0;
        if (waiting) {
          bufferingIndex = 0;
          const showStep = () => {
            const step = BUFFERING_GIFS[bufferingIndex % BUFFERING_GIFS.length];
            buffering.src = step.src;
            bufferingTimer = window.setTimeout(() => {
              bufferingIndex = (bufferingIndex + 1) % BUFFERING_GIFS.length;
              showStep();
            }, step.ms);
          };
          showStep();
        } else {
          bufferingIndex = 0;
          buffering.removeAttribute("src");
        }
      }

      const muted = video.muted || !video.volume;
      root.classList.toggle("is-muted", muted);
      store[STORAGE_MUTED_KEY] = muted ? "1" : "0";
      volume.valueAsNumber = video.muted ? 0 : video.volume;
      volume.style.cssText = `--p:${volume.valueAsNumber * 100}%`;
      speed.textContent = `${video.playbackRate}x`;
      wakeControls();
    };

    if (store[STORAGE_MUTED_KEY] === "1") video.muted = true;
    else if (store[STORAGE_MUTED_KEY] === "0") video.muted = false;
    syncUi();

    root.classList.toggle("has-resume", resumeAt > 0);
    const resumeLabel = root.querySelector("[data-at]");
    if (resumeLabel) resumeLabel.textContent = formatTime(resumeAt);

    const onLoadedMetadata = () => {
      if (resumeAt < video.duration - RESUME_END_MARGIN_SEC) video.currentTime = resumeAt;
    };
    const onTimeUpdate = () => {
      store[positionKey] = String(video.currentTime | 0);
      updateProgress();
    };
    const onEnded = () => {
      delete store[positionKey];
    };
    const onFullscreenChange = () => {
      root.classList.toggle("is-fs", document.fullscreenElement === root);
    };
    const onSeekInput = () => {
      video.currentTime = seek.valueAsNumber;
      wakeControls();
    };
    const onSeekPointerMove = (event: PointerEvent) => {
      const box = seek.getBoundingClientRect();
      const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
      tip.style.left = `${ratio * 100}%`;
      tip.textContent = formatTime(ratio * video.duration);
    };
    const onVolumeInput = () => {
      video.volume = volume.valueAsNumber;
      video.muted = !video.volume;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse") wakeControls();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const action = actions[KEY_ACTIONS[event.key]];
      const target = event.target as Element;
      if (
        !action ||
        event.ctrlKey ||
        event.metaKey ||
        target === volume ||
        (event.key === " " && target.tagName === "BUTTON")
      ) {
        return;
      }
      event.preventDefault();
      wakeControls();
      action();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const qualityChoice = target.closest<HTMLElement>("[data-quality]");
      if (qualityChoice && hls) {
        pickedQuality = Number(qualityChoice.dataset.quality);
        hls.nextLevel = pickedQuality;
        qualityMenu.hidden = true;
        markQualitySelection();
        wakeControls();
        return;
      }

      const actionName = target.closest<HTMLElement>("[data-act]")?.dataset.act;
      if (actionName !== "quality") qualityMenu.hidden = true;
      if (actionName || target.closest(".video-player__bar, .video-player__error")) {
        wakeControls();
        if (actionName) actions[actionName]?.();
        return;
      }

      const isDoubleTap = event.timeStamp - lastTapAt < DOUBLE_TAP_MS;
      lastTapAt = event.timeStamp;

      if (!root.classList.contains("is-started")) {
        togglePlay();
        return;
      }

      clearTimeout(tapTimer);
      if (isDoubleTap) {
        const rect = root.getBoundingClientRect();
        const delta =
          event.clientX - rect.left < root.clientWidth / 2 ? -SKIP_SECONDS : SKIP_SECONDS;
        skipAccum = Math.sign(skipAccum) === Math.sign(delta) ? skipAccum + delta : delta;
        skipBy(delta, skipAccum);
        return;
      }

      skipAccum = 0;
      const isMouse = (event as PointerEvent).pointerType === "mouse";
      tapTimer = window.setTimeout(
        isMouse
          ? togglePlay
          : () => {
              if (video.paused || root.classList.contains("is-idle")) wakeControls();
              else root.classList.add("is-idle");
            },
        DOUBLE_TAP_MS,
      );
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("progress", updateProgress);
    video.addEventListener("durationchange", updateProgress);
    video.addEventListener("error", showError);
    for (const type of SYNC_EVENTS) video.addEventListener(type, syncUi);
    seek.addEventListener("input", onSeekInput);
    seek.addEventListener("pointermove", onSeekPointerMove);
    volume.addEventListener("input", onVolumeInput);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("click", onClick);

    if (isHls) {
      video.addEventListener(
        "play",
        () => {
          import("hls.js/light")
            .then(({ default: HlsJs }) => {
              if (disposed) return;

              if (HlsJs.isSupported()) {
                const player = new HlsJs(
                  noReferrer
                    ? {
                        fetchSetup(context, init) {
                          return new Request(context.url, {
                            ...init,
                            referrerPolicy: "no-referrer",
                          });
                        },
                      }
                    : undefined,
                );
                hls = player;
                player.on(HlsJs.Events.MANIFEST_PARSED, buildQualityMenu);
                player.on(HlsJs.Events.ERROR, (_event, data) => {
                  if (data.fatal) showError();
                });
                player.loadSource(url);
                player.attachMedia(video);
                return;
              }

              if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = url;
                return;
              }

              showError();
            })
            .catch(showError);
        },
        { once: true },
      );
    }

    return () => {
      disposed = true;
      clearTimeout(idleTimer);
      clearTimeout(tapTimer);
      clearTimeout(bufferingTimer);
      buffering.removeAttribute("src");
      referrerMeta?.remove();
      hls?.destroy();
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("progress", updateProgress);
      video.removeEventListener("durationchange", updateProgress);
      video.removeEventListener("error", showError);
      for (const type of SYNC_EVENTS) video.removeEventListener(type, syncUi);
      seek.removeEventListener("input", onSeekInput);
      seek.removeEventListener("pointermove", onSeekPointerMove);
      volume.removeEventListener("input", onVolumeInput);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("click", onClick);
    };
  }, [url, isHls, noReferrer]);

  return (
    <div
      ref={rootRef}
      className="video-player"
      tabIndex={0}
      role="region"
      aria-label={title || "Video"}
    >
      <video src={isHls || noReferrer ? undefined : url} preload="auto" playsInline />
      {poster ? (
        <img className="video-player__poster" src={poster} alt="" draggable={false} />
      ) : null}
      <img className="video-player__buffering" alt="" aria-hidden="true" draggable={false} />
      <span className="video-player__hint" aria-hidden="true" />
      {title ? <h1 className="video-player__title">{title}</h1> : null}

      <div className="video-player__center">
        <button type="button" data-act="back" aria-label={`Back ${SKIP_SECONDS} seconds`}>
          <Icon name="rotate-ccw" />
          <b>{SKIP_SECONDS}</b>
        </button>
        <button type="button" data-act="start" aria-label="Play / Pause">
          <PlayPauseIcons />
        </button>
        <button type="button" data-act="fwd" aria-label={`Forward ${SKIP_SECONDS} seconds`}>
          <Icon name="rotate-cw" />
          <b>{SKIP_SECONDS}</b>
        </button>
      </div>

      <div className="video-player__resume">
        <button type="button" className="video-player__pill is-brand" data-act="play">
          <Icon name="play" className="fill-current" />
          Resume <span data-at />
        </button>
      </div>

      <div className="video-player__bar">
        <div className="video-player__progress">
          <input
            type="range"
            className="video-player__seek"
            min={0}
            max={0}
            step={0.1}
            defaultValue={0}
            aria-label="Seek"
          />
          <span className="video-player__tip" aria-hidden="true" />
        </div>
        <button type="button" data-act="play" aria-label="Play / Pause">
          <PlayPauseIcons />
        </button>
        <div className="video-player__volume">
          <button type="button" data-act="mute" aria-label="Mute / Unmute">
            <Icon name="volume" className="i-vol" />
            <Icon name="volume-off" className="i-muted" />
          </button>
          <input
            type="range"
            className="video-player__vol"
            min={0}
            max={1}
            step={0.05}
            defaultValue={1}
            aria-label="Volume"
          />
        </div>
        <span className="video-player__time">0:00 / 0:00</span>
        <button
          type="button"
          className="video-player__speed"
          data-act="speed"
          aria-label="Playback speed"
        >
          1x
        </button>
        <div className="video-player__quality">
          <button
            type="button"
            className="video-player__quality-btn"
            data-act="quality"
            aria-label="Quality"
            aria-haspopup="menu"
          >
            Auto
          </button>
          <div className="video-player__quality-menu" role="menu" hidden />
        </div>
        <button type="button" data-act="fs" aria-label="Fullscreen">
          <Icon name="maximize" className="i-max" />
          <Icon name="minimize" className="i-min" />
        </button>
      </div>

      <div className="video-player__error" role="alert">
        <p>Playback failed. Check the link or your connection, then try again.</p>
        <button type="button" className="video-player__pill is-brand" data-act="retry">
          Try again
        </button>
      </div>
    </div>
  );
}
