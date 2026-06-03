/**
 * StoriesBar — horizontal scrollable row of story avatars.
 * Sits at the top of the home feed, above the post composer.
 * Nexus palette: amber primary, warm off-white background.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import StoryViewer from "./story-viewer";
import StoryCreate from "./story-create";

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

export default function StoriesBar() {
  const { user } = useAuth();
  const [viewingGroup, setViewingGroup] = useState<StoryGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: stories = [], refetch } = useQuery<Story[]>({
    queryKey: ["/api/stories"],
  });

  // Group by user
  const groups: StoryGroup[] = [];
  const seen = new Set<number>();
  for (const s of stories) {
    if (!s.user) continue;
    if (!seen.has(s.userId)) {
      seen.add(s.userId);
      groups.push({ user: s.user, stories: stories.filter(x => x.userId === s.userId) });
    }
  }

  // Put self first if no self story exists
  const hasSelf = groups.some(g => g.user.id === user?.id);

  return (
    <>
      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 px-1 py-2 min-w-max">

          {/* "Add Story" button — always first */}
          <button
            onClick={() => setCreating(true)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="relative">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 border-dashed transition-colors"
                style={{ borderColor: "#E0DCD7", background: "#F0EDE9" }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="you" className="w-full h-full object-cover opacity-60" />
                ) : (
                  <span className="text-xl font-bold" style={{ color: "#746A61" }}>
                    {user?.username?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>
              <div
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center shadow"
                style={{ background: "#F6A61E" }}
              >
                <Plus size={14} color="#fff" strokeWidth={3} />
              </div>
            </div>
            <span className="text-xs font-medium" style={{ color: "#746A61" }}>
              {hasSelf ? "Your story" : "Add story"}
            </span>
          </button>

          {/* Story groups */}
          {groups.map((group) => {
            const isOwn = group.user.id === user?.id;
            return (
              <button
                key={group.user.id}
                onClick={() => setViewingGroup(group)}
                className="flex flex-col items-center gap-1 group"
              >
                <div
                  className="w-16 h-16 rounded-full p-[2px]"
                  style={{
                    background: isOwn
                      ? "linear-gradient(135deg, #F6A61E, #f0c060)"
                      : "linear-gradient(135deg, #F6A61E 0%, #e85d04 100%)",
                  }}
                >
                  <div
                    className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                    style={{ background: "#F0EDE9" }}
                  >
                    {group.user.avatar ? (
                      <img src={group.user.avatar} alt={group.user.username} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold" style={{ color: "#F6A61E" }}>
                        {group.user.username[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="text-xs font-medium max-w-[64px] truncate"
                  style={{ color: "#161210" }}
                >
                  {isOwn ? "You" : group.user.username}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Story Viewer */}
      {viewingGroup && (
        <StoryViewer
          group={viewingGroup}
          onClose={() => setViewingGroup(null)}
        />
      )}

      {/* Story Creator */}
      {creating && (
        <StoryCreate
          onClose={() => setCreating(false)}
          onCreated={() => { refetch(); setCreating(false); }}
        />
      )}
    </>
  );
}
