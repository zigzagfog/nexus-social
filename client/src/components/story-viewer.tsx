/**
 * StoryViewer — full-screen modal that auto-advances through a user's stories.
 * Progress bar at top, tap left/right to navigate, X to close.
 * Nexus palette throughout.
 */
import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

interface StoryUser {
  id: number;
  username: string;
  avatar: string | null;
}

interface Story {
  id: number;
  userId: number;
  type: string;
  mediaUrl: string | null;
  content: string | null;
  bgColor: string;
  expiresAt: string;
  createdAt: string;
  user: StoryUser | null;
}

interface StoryGroup {
  user: StoryUser;
  stories: Story[];
}

interface Props {
  group: StoryGroup;
  onClose: () => void;
}

const STORY_DURATION = 5000; // 5 seconds per story

export default function StoryViewer({ group, onClose }: Props) {
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const story = group.stories[index];
  const isOwn = group.user.id === user?.id;

  // Mark viewed
  useEffect(() => {
    if (story) {
      apiRequest("POST", `/api/stories/${story.id}/view`).catch(() => {});
    }
  }, [story?.id]);

  // Progress timer
  useEffect(() => {
    setProgress(0);
    if (paused) return;

    const step = 100 / (STORY_DURATION / 50);
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          advance();
          return 0;
        }
        return p + step;
      });
    }, 50);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [index, paused]);

  function advance() {
    if (index < group.stories.length - 1) {
      setIndex(i => i + 1);
    } else {
      onClose();
    }
  }

  function prev() {
    if (index > 0) setIndex(i => i - 1);
  }

  function formatTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    return `${h}h ago`;
  }

  if (!story) return null;

  const bg = story.type === "image" && story.mediaUrl
    ? undefined
    : story.bgColor ?? "#F6A61E";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(12,16,23,0.95)" }}
    >
      <div
        className="relative w-full max-w-sm h-[calc(100dvh-32px)] max-h-[700px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: bg ?? "#0C1017" }}
      >
        {/* Background image */}
        {story.type === "image" && story.mediaUrl && (
          <img
            src={story.mediaUrl}
            alt="story"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

        {/* Progress bars */}
        <div className="relative z-10 flex gap-1 px-3 pt-3">
          {group.stories.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-[3px] rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.3)" }}
            >
              <div
                className="h-full rounded-full transition-none"
                style={{
                  background: "#F6A61E",
                  width: i < index ? "100%" : i === index ? `${progress}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3 px-3 pt-3 pb-2">
          <div
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ background: "#F0EDE9" }}
          >
            {group.user.avatar ? (
              <img src={group.user.avatar} alt={group.user.username} className="w-full h-full object-cover" />
            ) : (
              <span className="font-bold text-sm" style={{ color: "#F6A61E" }}>
                {group.user.username[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">{group.user.username}</p>
            <p className="text-white/60 text-xs">{formatTime(story.createdAt)}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Text content */}
        {story.content && (
          <div className="relative z-10 flex-1 flex items-center justify-center px-6">
            <p
              className="text-center text-xl font-semibold leading-snug"
              style={{
                color: story.type === "text" ? "#161210" : "#fff",
                textShadow: story.type === "image" ? "0 1px 4px rgba(0,0,0,0.8)" : "none",
              }}
            >
              {story.content}
            </p>
          </div>
        )}

        {/* Tap zones */}
        <div className="absolute inset-0 z-20 flex">
          <div className="flex-1 cursor-pointer" onMouseDown={() => setPaused(true)} onMouseUp={() => { setPaused(false); prev(); }} onTouchStart={() => setPaused(true)} onTouchEnd={() => { setPaused(false); prev(); }} />
          <div className="flex-1 cursor-pointer" onMouseDown={() => setPaused(true)} onMouseUp={() => { setPaused(false); advance(); }} onTouchStart={() => setPaused(true)} onTouchEnd={() => { setPaused(false); advance(); }} />
        </div>

        {/* Nav arrows (desktop hint) */}
        {index > 0 && (
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 text-white/70 hover:text-white bg-black/20 rounded-full p-1"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {index < group.stories.length - 1 && (
          <button
            onClick={advance}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 text-white/70 hover:text-white bg-black/20 rounded-full p-1"
          >
            <ChevronRight size={20} />
          </button>
        )}

        {/* View count for own stories */}
        {isOwn && (
          <div className="relative z-10 flex items-center gap-1 px-4 pb-4 mt-auto">
            <Eye size={14} className="text-white/60" />
            <span className="text-white/60 text-xs">Tap to see viewers</span>
          </div>
        )}
      </div>
    </div>
  );
}
