import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Smile, X, ImagePlus, Loader2 } from "lucide-react";

// Resize an image file to max 1200px wide, returns base64 data URL
function resizeImage(file: File, maxWidth = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

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
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please pick an image file", variant: "destructive" }); return;
    }
    setImageUploading(true);
    try {
      const dataUrl = await resizeImage(file);
      setImagePreview(dataUrl);
    } catch {
      toast({ title: "Could not load image", variant: "destructive" });
    } finally {
      setImageUploading(false);
      // Reset input so same file can be re-selected
      e.target.value = "";
    }
  };

  const removeImage = () => setImagePreview(null);

  const initials = user?.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  const firstName = user?.displayName?.split(" ")[0] ?? "there";

  const handlePost = async () => {
    if (!content.trim() && !imagePreview) return;
    setPosting(true);
    try {
      let imageUrl = "";
      // Upload image if one is attached
      if (imagePreview) {
        const res = await apiRequest("POST", "/api/upload", { dataUrl: imagePreview });
        const data = await res.json();
        imageUrl = data.url ?? imagePreview; // fallback: store data URL directly
      }
      await apiRequest("POST", "/api/posts", { content: content.trim(), feeling, imageUrl });
      setContent("");
      setFeeling("");
      setImagePreview(null);
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

                {/* Image preview */}
                {imagePreview && (
                  <div className="relative rounded-xl overflow-hidden border border-border">
                    <img
                      src={imagePreview}
                      alt="Attached"
                      className="w-full max-h-72 object-cover"
                      data-testid="img-post-preview"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                      aria-label="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="input-image-file"
                  onChange={handleImagePick}
                />

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-1">
                    <button
                      data-testid="button-feeling"
                      onClick={() => setShowFeelings(v => !v)}
                      title="Add feeling"
                      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted active:bg-muted transition-colors min-h-0 min-w-0"
                    >
                      <Smile className="w-5 h-5 text-yellow-500" />
                    </button>
                    <button
                      type="button"
                      data-testid="button-add-photo"
                      onClick={() => fileInputRef.current?.click()}
                      title="Add photo"
                      disabled={imageUploading}
                      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted active:bg-muted transition-colors min-h-0 min-w-0 disabled:opacity-50"
                    >
                      {imageUploading
                        ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        : <ImagePlus className="w-5 h-5 text-green-500" />}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => { setExpanded(false); setContent(""); setFeeling(""); setImagePreview(null); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 px-5"
                      data-testid="button-post-submit"
                      disabled={(!content.trim() && !imagePreview) || posting || imageUploading}
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
