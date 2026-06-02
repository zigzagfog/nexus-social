import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, MoreHorizontal, Trash2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REACTIONS = [
  { key: "like",  emoji: "👍", label: "Like" },
  { key: "love",  emoji: "❤️", label: "Love" },
  { key: "haha",  emoji: "😂", label: "Haha" },
  { key: "wow",   emoji: "😮", label: "Wow" },
  { key: "sad",   emoji: "😢", label: "Sad" },
  { key: "angry", emoji: "😡", label: "Angry" },
];

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString();
}

interface PostCardProps {
  post: any;
  onUpdate?: () => void;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localPost, setLocalPost] = useState(post);

  const author = localPost.author;
  const initials  = author?.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  const myInitials = user?.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const handleReaction = async (reaction: string) => {
    setShowReactions(false);
    try {
      const res = await apiRequest("POST", `/api/posts/${localPost.id}/like`, { reaction });
      const updated = await res.text().then(t => JSON.parse(t));
      setLocalPost(updated);
      onUpdate?.();
    } catch {
      toast({ title: "Failed to react", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await apiRequest("DELETE", `/api/posts/${localPost.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/posts`] });
      onUpdate?.();
      toast({ title: "Post deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/posts/${localPost.id}/comments`, { content: newComment });
      const comment = await res.text().then(t => JSON.parse(t));
      setLocalPost((prev: any) => ({
        ...prev,
        comments: [comment, ...(prev.comments || [])],
        commentCount: (prev.commentCount || 0) + 1,
      }));
      setNewComment("");
    } catch {
      toast({ title: "Failed to comment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const activeReaction = REACTIONS.find(r => r.key === localPost.userReaction);
  const liked = !!localPost.userReaction;

  // Hover helpers — desktop only; mobile uses long-press / tap toggle
  const openReactions  = () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); reactionTimer.current = setTimeout(() => setShowReactions(true), 450); };
  const closeReactions = () => { if (reactionTimer.current) clearTimeout(reactionTimer.current); reactionTimer.current = setTimeout(() => setShowReactions(false), 300); };

  return (
    <Card className="shadow-sm rounded-none sm:rounded-xl border-x-0 sm:border-x" data-testid={`card-post-${localPost.id}`}>
      <CardContent className="p-3 sm:p-4">

        {/* Author row */}
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <a href={`/#/profile/${author?.id}`} className="shrink-0 min-h-0 min-w-0">
              <Avatar className="w-10 h-10">
                <AvatarImage src={author?.avatarUrl || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </a>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <a href={`/#/profile/${author?.id}`} className="min-h-0 min-w-0">
                  <span className="font-semibold text-sm hover:underline leading-tight">{author?.displayName}</span>
                </a>
                {localPost.feeling && (
                  <span className="text-xs text-muted-foreground">— {localPost.feeling}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{timeAgo(localPost.createdAt)}</p>
            </div>
          </div>

          {author?.id === user?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:bg-muted transition-colors shrink-0 min-h-0 min-w-0"
                  data-testid={`button-post-menu-${localPost.id}`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={handleDelete}
                  data-testid={`button-delete-post-${localPost.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete post
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Content */}
        {localPost.content ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap mb-3" data-testid={`text-post-content-${localPost.id}`}>
            {localPost.content}
          </p>
        ) : null}

        {/* Post image */}
        {localPost.imageUrl ? (
          <div className="mb-3 -mx-3 sm:-mx-4 sm:rounded-none overflow-hidden">
            <img
              src={localPost.imageUrl}
              alt="Post image"
              className="w-full max-h-[500px] object-cover"
              data-testid={`img-post-${localPost.id}`}
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Stats row */}
        {(localPost.likeCount > 0 || localPost.commentCount > 0) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1 pb-2 border-b border-border">
            {localPost.likeCount > 0 && (
              <span data-testid={`text-like-count-${localPost.id}`}>
                {Object.entries(localPost.likeBreakdown || {}).slice(0, 3).map(([k]) =>
                  REACTIONS.find(r => r.key === k)?.emoji ?? ""
                ).join("")} {localPost.likeCount}
              </span>
            )}
            {localPost.commentCount > 0 && (
              <button
                className="hover:underline ml-auto h-auto min-h-0 min-w-0 p-0 text-xs"
                onClick={() => setShowComments(v => !v)}
                data-testid={`button-comment-count-${localPost.id}`}
              >
                {localPost.commentCount} comment{localPost.commentCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-0 -mx-1">

          {/* Like button — desktop: hover for picker; mobile: tap cycles */}
          <div
            className="relative flex-1"
            onMouseEnter={openReactions}
            onMouseLeave={closeReactions}
          >
            {/* Reaction picker — shown on hover (desktop) or long-press (mobile via state) */}
            {showReactions && (
              <div
                className="reaction-picker absolute bottom-full left-0 mb-2 z-20"
                onMouseEnter={() => { if (reactionTimer.current) clearTimeout(reactionTimer.current); }}
                onMouseLeave={closeReactions}
              >
                {REACTIONS.map(r => (
                  <button
                    key={r.key}
                    className="reaction-btn"
                    title={r.label}
                    onClick={() => handleReaction(r.key)}
                    data-testid={`button-reaction-${r.key}-${localPost.id}`}
                  >
                    {r.emoji}
                  </button>
                ))}
              </div>
            )}

            <button
              className={`flex items-center justify-center gap-1.5 w-full h-10 rounded-lg text-sm font-medium transition-colors min-h-0 min-w-0 active:bg-muted ${
                liked ? "text-primary" : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => handleReaction(localPost.userReaction || "like")}
              data-testid={`button-like-${localPost.id}`}
            >
              <span className="text-base leading-none">{activeReaction?.emoji ?? "👍"}</span>
              <span>{activeReaction?.label ?? "Like"}</span>
            </button>
          </div>

          <button
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted active:bg-muted transition-colors min-h-0 min-w-0"
            onClick={() => setShowComments(v => !v)}
            data-testid={`button-toggle-comments-${localPost.id}`}
          >
            <MessageCircle className="w-4 h-4" />
            Comment
          </button>
        </div>

        {/* Comments */}
        {showComments && (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            {/* Comment input */}
            <form onSubmit={handleComment} className="flex items-center gap-2">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarImage src={user?.avatarUrl || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{myInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 flex gap-2 min-w-0">
                <Input
                  data-testid={`input-comment-${localPost.id}`}
                  placeholder="Write a comment…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  className="rounded-full text-sm h-10 min-h-0"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  data-testid={`button-submit-comment-${localPost.id}`}
                  className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50 active:opacity-80 min-h-0 min-w-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Comment list */}
            {localPost.comments?.map((c: any) => {
              const cInit = c.author?.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
              return (
                <div key={c.id} className="flex gap-2" data-testid={`comment-${c.id}`}>
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={c.author?.avatarUrl || ""} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">{cInit}</AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-2xl px-3 py-2 max-w-[85%]">
                    <a href={`/#/profile/${c.author?.id}`} className="min-h-0 min-w-0 h-auto">
                      <span className="text-xs font-semibold hover:underline">{c.author?.displayName}</span>
                    </a>
                    <p className="text-sm mt-0.5 leading-snug">{c.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
