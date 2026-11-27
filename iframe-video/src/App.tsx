import type { ReactNode } from "react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { VideoPlayer } from "./components/VideoPlayer";
import { decodeVideoPayload } from "./lib/decodeVideoUrl";

function Message({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="embed-message">
      <p className="embed-message__title">{title}</p>
      <p className="embed-message__body">{body}</p>
    </div>
  );
}

function VideoPage() {
  const encoded = (useParams()["*"] ?? "").replace(/^\/+/, "");
  const payload = encoded ? decodeVideoPayload(encoded) : null;

  useEffect(() => {
    document.title = payload?.title || "Video";
  }, [payload?.title]);

  if (!encoded || !payload) {
    return (
      <Message
        title="Invalid video link"
        body={!encoded ? "Error: Unauthorized" : "Error: Forbidden"}
      />
    );
  }

  return (
    <div className="embed-shell">
      <VideoPlayer url={payload.url} poster={payload.thumbnail} title={payload.title} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Message title="Unauthorized" body="Error: Unauthorized" />} />
        <Route path="/video/*" element={<VideoPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
