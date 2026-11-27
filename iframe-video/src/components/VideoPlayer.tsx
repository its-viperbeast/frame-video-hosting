import { useEffect, useId, useInsertionEffect, useRef, useState } from "react";
import { NO_REFERRER_HOSTS } from "../config";
import { isHlsPlaylist } from "../lib/decodeVideoUrl";
import {
  clearResumePosition,
  ensureJwPlayer,
  getResumePosition,
  playWithSound,
  setupJwPlayer,
  type JwPlayerInstance,
} from "../lib/jwPlayer";

const PLAY_PATH = "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z";
const RESTART_PATH =
  "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z";

function formatTimestamp(seconds: number): string {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
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
  const videoUrl = new URL(url);
  const noReferrer = NO_REFERRER_HOSTS.includes(videoUrl.hostname);
  const fileType = isHlsPlaylist(videoUrl) ? "hls" : "mp4";
  const targetId = `embed-jw-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<JwPlayerInstance | null>(null);
  const [gateVisible, setGateVisible] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [resumePosition] = useState(() => getResumePosition(url));

  // Insertion effects run before the player's first fetch, so the HLS loader already omits the referrer.
  useInsertionEffect(() => {
    if (!noReferrer) return;
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [noReferrer]);

  useEffect(() => {
    let cancelled = false;
    ensureJwPlayer()
      .then(() => {
        if (cancelled || !targetRef.current || !rootRef.current) return;
        const player = setupJwPlayer(targetRef.current, rootRef.current, {
          src: url,
          fileType,
          poster,
          title,
          resumeKey: url,
          onPlay: () => setGateVisible(false),
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.remove();
      } catch {
        /* player already torn down */
      }
      playerRef.current = null;
    };
    // The payload is fixed for the page; a new URL remounts through the router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dismiss first so the click counts as a user gesture, then play with sound.
  const handleGateClick = () => {
    setGateVisible(false);
    if (playerRef.current) playWithSound(playerRef.current);
  };
  const handleStartOver = () => {
    clearResumePosition(url);
    handleGateClick();
  };

  if (loadFailed) {
    return (
      <div className="embed-message">
        <p className="embed-message__title">Player failed to load</p>
        <p className="embed-message__body">Check your connection and reload the page.</p>
      </div>
    );
  }

  const gateBackdrop = (
    <>
      {poster && (
        <img
          src={poster}
          alt=""
          loading="eager"
          decoding="async"
          draggable="false"
          className="embed-play-gate__poster"
        />
      )}
      <span className="embed-play-gate__scrim" aria-hidden="true" />
    </>
  );


  return (
    <div ref={rootRef} className="embed-player-root">
      <div ref={targetRef} id={targetId} className="embed-player" aria-label={title} />
      {gateVisible &&
        (resumePosition === null ? (
          <button
            type="button"
            className="embed-play-gate"
            onClick={handleGateClick}
            aria-label={title ? `Play ${title}` : "Play video"}
          >
            {gateBackdrop}
            <span className="embed-play-gate__play" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d={PLAY_PATH} />
              </svg>
            </span>
          </button>
        ) : (
          <div className="embed-play-gate embed-play-gate--choices">
            {gateBackdrop}
            <div className="embed-play-gate__choices">
              <button
                type="button"
                className="embed-play-gate__choice embed-play-gate__choice--primary"
                onClick={handleGateClick}
                aria-label={title ? `Resume ${title}` : "Resume video"}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d={PLAY_PATH} />
                </svg>
                Resume {formatTimestamp(resumePosition)}
              </button>
              <button
                type="button"
                className="embed-play-gate__choice embed-play-gate__choice--secondary"
                onClick={handleStartOver}
                aria-label={title ? `Play ${title} from the beginning` : "Play from the beginning"}
              >
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d={RESTART_PATH} />
                </svg>
                Start over
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
