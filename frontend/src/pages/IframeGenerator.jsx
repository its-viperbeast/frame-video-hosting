import { useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { toast } from "react-toastify";
import { encodeVideoPayload } from "../../../iframe-video/src/lib/decodeVideoUrl";

const inputClass =
  "min-h-12 w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink";

export default function IframeGenerator() {
  const [result, setResult] = useState(null);
  const { iframeUrl, error } = result ?? {};
  const iframeCode =
    iframeUrl &&
    `<iframe
  src="${iframeUrl}"
  style="position:absolute;inset:0;width:100%;height:100%;border:0;"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
  allow="fullscreen; encrypted-media"
  title="Video Player"
  loading="lazy"
  allowfullscreen>
</iframe>`;

  function generateIframe(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const payload = encodeVideoPayload({
        url: formData.get("video"),
        thumbnail: formData.get("thumbnail"),
        title: formData.get("title"),
      });
      setResult({ iframeUrl: `https://iframe.octastream.online/video/${payload}` });
    } catch (err) {
      setResult({ error: err.message });
    }
  }

  async function copyToClipboard(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable. Select and copy the text from the iframe code.");
    }
  }

  return (
    <div className="mb-8 grid w-full max-w-2xl grid-cols-1 items-start gap-x-5 lg:max-w-6xl lg:grid-cols-2">
      <h1 className="font-display mt-2 mb-7 text-3xl leading-tight font-bold tracking-tight text-heading lg:col-span-2">
        Iframe generator
      </h1>
      <form
        className="grid gap-4 rounded-xl border border-line bg-surface p-4 sm:p-6"
        onSubmit={generateIframe}
        onChange={() => setResult(null)}
      >
        <label className="grid gap-2 text-sm font-medium">
          Video URL
          <input className={inputClass} name="video" type="url" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Thumbnail URL (optional)
          <input className={inputClass} name="thumbnail" type="url" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Title (optional)
          <input className={inputClass} name="title" type="text" />
        </label>
        {error && (
          <p className="text-sm text-[#d05b69]" role="alert">
            {error}
          </p>
        )}
        <button
          className="min-h-11 justify-self-start rounded-lg bg-brandsolid px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          type="submit"
        >
          Generate iframe
        </button>
      </form>
      <p className="sr-only" role="status">
        {iframeUrl && "Iframe code generated."}
      </p>
      {iframeUrl && (
        <div className="mt-5 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:p-6 lg:mt-0">
          <label className="text-sm font-semibold text-heading" htmlFor="iframe-code">
            Iframe code
          </label>
          <textarea
            className="w-full resize-y rounded-lg border border-line bg-surfacehover p-3 font-mono text-xs leading-5 text-ink"
            id="iframe-code"
            rows={10}
            value={iframeCode}
            readOnly
            spellCheck={false}
            wrap="off"
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brandsolid px-4 text-sm font-semibold text-white hover:brightness-110"
              type="button"
              onClick={() => copyToClipboard(iframeCode, "Iframe code")}
            >
              <Copy size={16} aria-hidden="true" />
              Copy iframe
            </button>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold text-brand hover:bg-surfacehover"
              type="button"
              onClick={() => copyToClipboard(iframeUrl, "Link")}
            >
              <Link2 size={16} aria-hidden="true" />
              Copy link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
