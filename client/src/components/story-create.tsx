/**
 * StoryCreate — modal for composing a new story.
 * Two tabs: Text card (pick bg color + write text) or Image (upload URL or file).
 * Nexus palette.
 */
import { useState } from "react";
import { X, Type, Image, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const BG_COLORS = [
  "#F6A61E", // amber (brand)
  "#161210", // dark
  "#1a1a2e", // midnight blue
  "#16213e", // deep navy
  "#0f3460", // ocean
  "#533483", // purple
  "#e94560", // red
  "#2d6a4f", // forest green
  "#f0ede9", // warm white (text on dark)
];

export default function StoryCreate({ onClose, onCreated }: Props) {
  const [tab, setTab] = useState<"text" | "image">("text");
  const [content, setContent] = useState("");
  const [bgColor, setBgColor] = useState("#F6A61E");
  const [mediaUrl, setMediaUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const textColor = bgColor === "#f0ede9" ? "#161210" : "#ffffff";

  async function handleSubmit() {
    if (tab === "text" && !content.trim()) {
      setError("Write something first.");
      return;
    }
    if (tab === "image" && !mediaUrl.trim()) {
      setError("Paste an image URL.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest("POST", "/api/stories", {
        type: tab,
        content: content.trim() || null,
        mediaUrl: tab === "image" ? mediaUrl.trim() : null,
        bgColor,
      });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Failed to post story.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(12,16,23,0.85)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#ffffff" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #E0DCD7" }}
        >
          <h2 className="text-base font-bold" style={{ color: "#161210" }}>
            Create Story
          </h2>
          <button onClick={onClose} style={{ color: "#746A61" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid #E0DCD7" }}>
          {(["text", "image"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
              style={{
                color: tab === t ? "#F6A61E" : "#746A61",
                borderBottom: tab === t ? "2px solid #F6A61E" : "2px solid transparent",
              }}
            >
              {t === "text" ? <Type size={15} /> : <Image size={15} />}
              {t === "text" ? "Text" : "Image"}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="px-5 pt-4">
          <div
            className="w-full h-40 rounded-xl flex items-center justify-center overflow-hidden relative"
            style={{ background: bgColor }}
          >
            {tab === "image" && mediaUrl ? (
              <img src={mediaUrl} alt="preview" className="w-full h-full object-cover" onError={() => setError("Could not load that image URL.")} />
            ) : (
              <p
                className="text-center text-lg font-semibold px-4 leading-snug"
                style={{ color: textColor }}
              >
                {content || "Your story preview..."}
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {tab === "text" && (
            <>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="What's on your mind?"
                maxLength={200}
                rows={3}
                className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                style={{
                  background: "#F7F4F1",
                  border: "1px solid #E0DCD7",
                  color: "#161210",
                  // @ts-ignore
                  "--tw-ring-color": "#F6A61E",
                }}
              />
              {/* Color picker */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium" style={{ color: "#746A61" }}>Background:</span>
                {BG_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setBgColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: c,
                      borderColor: bgColor === c ? "#F6A61E" : "transparent",
                      outline: bgColor === c ? "2px solid #F6A61E" : "none",
                      outlineOffset: "2px",
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {tab === "image" && (
            <input
              value={mediaUrl}
              onChange={e => setMediaUrl(e.target.value)}
              placeholder="Paste image URL (https://...)"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                background: "#F7F4F1",
                border: "1px solid #E0DCD7",
                color: "#161210",
              }}
            />
          )}

          {error && (
            <p className="text-xs" style={{ color: "#e94560" }}>{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: "#F6A61E", color: "#fff" }}
          >
            <Send size={15} />
            {submitting ? "Posting..." : "Share Story"}
          </button>

          <p className="text-center text-xs" style={{ color: "#746A61" }}>
            Stories disappear after 24 hours
          </p>
        </div>
      </div>
    </div>
  );
}
