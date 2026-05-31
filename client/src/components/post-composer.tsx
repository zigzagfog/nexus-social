import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Smile, X } from "lucide-react";

const FEELINGS = [
  "😊 Happy","😢 Sad","😍 Loved","😂 Amused",
  "🎉 Excited","😤 Frustrated","🤔 Thoughtful","😴 Tired",
];

interface PostComposerProps {
  onPosted?: () => void;
}

export default function PostComposer({ onPosted }: PostComposerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [feeling, setFeeling] = useState("");
  const [showFeelings, setShowFeelings] = useState(false);
  const [posting, setPosting] = useState(false);

  const initials = user?.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  const firstName = user?.displayName?.split(" ")[0] ?? "there";

  const handlePost = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await apiRequest("POST", "/api/posts", { content, feeling });
      setContent("");
      setFeeling("");
      setExpanded(false);
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      onPosted?.();
      toast({ title: "Posted" });
    } catch {
      toast({ title: "Failed to post", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card className="shadow-sm rounded-none sm:rounded-xl border-x-0 sm:border-x">
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3">
          <Avatar className="w-9 h-9 sm:w-10 sm:h-10 shrink-0">
            <AvatarImage src={user?.avatarUrl || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {!expanded ? (
              /* Collapsed trigger — full 44px height touch target */
              <button
                data-testid="button-open-composer"
                className="w-full text-left px-4 h-11 rounded-full bg-muted text-muted-foreground text-sm hover:bg-secondary active:bg-secondary transition-colors min-h-0"
                onClick={() => setExpanded(true)}
              >
                What's on your mind, {firstName}?
              </button>
            ) : (
              <div className="space-y-3">
                {feeling && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Feeling: <span className="font-medium text-foreground">{feeling}</span>
                    </span>
                    <button
                      onClick={() => setFeeling("")}
                      className="text-muted-foreground hover:text-foreground w-6 h-6 min-h-0 min-w-0 rounded-full"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <Textarea
                  data-testid="input-post-content"
                  placeholder={`What's on your mind, ${firstName}?`}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  /* font-size 16px prevents iOS zoom — already forced in index.css */
                  className="resize-none border-0 text-base focus-visible:ring-0 bg-transparent min-h-[80px] p-0 leading-relaxed"
                  autoFocus
                  rows={3}
                />

                {showFeelings && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {FEELINGS.map(f => (
                      <button
                        key={f}
                        className={`text-left px-3 h-10 rounded-lg text-sm transition-colors min-h-0 ${
                          feeling === f ? "bg-accent text-accent-foreground" : "hover:bg-muted active:bg-muted"
                        }`}
                        onClick={() => { setFeeling(f); setShowFeelings(false); }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button
                    data-testid="button-feeling"
                    onClick={() => setShowFeelings(v => !v)}
                    title="Add feeling"
                    className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted active:bg-muted transition-colors min-h-0 min-w-0"
                  >
                    <Smile className="w-5 h-5 text-yellow-500" />
                  </button>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => { setExpanded(false); setContent(""); setFeeling(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 px-5"
                      data-testid="button-post-submit"
                      disabled={!content.trim() || posting}
                      onClick={handlePost}
                    >
                      {posting ? "Posting…" : "Post"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
