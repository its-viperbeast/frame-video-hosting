import "@videojs/react/video/skin.css";
import { useInsertionEffect, type CSSProperties } from "react";
import { createPlayer, pipFeature, remotePlaybackFeature } from "@videojs/react";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import { HlsVideo } from "@videojs/react/media/hls-video";
import { NO_REFERRER_HOSTS } from "../config";
import { isHlsPlaylist } from "../lib/decodeVideoUrl";

// Skin buttons render nothing when their feature is absent, so this drops the PiP and cast/AirPlay buttons.
const { Player } = createPlayer({
  features: videoFeatures.filter((f) => f !== pipFeature && f !== remotePlaybackFeature),
});

export function VideoPlayer({
  url,
  poster,
}: {
  url: string;
  poster?: string;
}) {
  const videoUrl = new URL(url);
  const noReferrer = NO_REFERRER_HOSTS.includes(videoUrl.hostname);
  const Media = isHlsPlaylist(videoUrl) ? HlsVideo : Video;

  // Insertion effects run before child media effects, so the HLS loader's first fetch already omits the referrer.
  useInsertionEffect(() => {
    if (!noReferrer) return;
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [noReferrer]);

  return (
    <Player poster={poster}>
      <VideoSkin
        style={
          {
            width: "100%",
            height: "100%",
            // Full-bleed in the host iframe: no hairline or rounded corners.
            "--media-border-color": "transparent",
            "--media-border-radius": "0",
          } as CSSProperties
        }
      >
        <Media src={url} playsInline />
      </VideoSkin>
    </Player>
  );
}
