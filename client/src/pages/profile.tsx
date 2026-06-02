import { useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import PostCard from "@/components/post-card";
import PostComposer from "@/components/post-composer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Globe, UserPlus, UserCheck, UserMinus, Edit2, Users, FileText, Camera, ImagePlus, Loader2 } from "lucide-react";

// ── Shared image resize helper (same as post-composer) ────────────────────────
function resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Edit Profile Dialog ───────────────────────────────────────────────────────
function EditProfileDialog({ user, onSaved }: { user: any; onSaved: (u: any) => void }) {
  const { toast } = useToast();
  const { updateUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    displayName: user.displayName || "",
    bio: user.bio || "",
    location: user.location || "",
    website: user.website || "",
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/users/me", form);
      const updated = await res.text().then(t => JSON.parse(t));
      updateUser(updated);
      onSaved(updated);
      setOpen(false);
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9" data-testid="button-edit-profile">
          <Edit2 className="w-4 h-4" />
          Edit Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md mx-4 sm:mx-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} data-testid="input-display-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} data-testid="input-bio" placeholder="Tell us about yourself…" className="resize-none" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} data-testid="input-location" placeholder="City, Country" />
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} data-testid="input-website" placeholder="https://…" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="button-save-profile">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Profile Page ─────────────────────────────────────────────────────────
export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const profileId = parseInt(params.id);
  const { user: me, updateUser } = useAuth();
  const { toast } = useToast();
  const [profileData, setProfileData] = useState<any>(null);

  // Photo upload state
  const [avatarUploading, setAvatarUploading]  = useState(false);
  const [coverUploading,  setCoverUploading]   = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef  = useRef<HTMLInputElement>(null);

  const { data: fetchedProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["/api/users", String(profileId)],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${profileId}`);
      if (!res.ok) throw new Error("User not found");
      const data = await res.text().then(t => JSON.parse(t));
      setProfileData(data);
      return data;
    },
  });

  const profile = profileData ?? fetchedProfile;

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: [`/api/users/${profileId}/posts`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${profileId}/posts`);
      return res.text().then(t => JSON.parse(t));
    },
  });

  // ── Save a single photo field to the API ─────────────────────────────────
  const savePhoto = async (field: "avatarUrl" | "coverUrl", dataUrl: string) => {
    const res = await apiRequest("PATCH", "/api/users/me", { [field]: dataUrl });
    const updated = await res.text().then(t => JSON.parse(t));
    updateUser(updated);
    setProfileData((p: any) => ({ ...p, [field]: dataUrl }));
    queryClient.invalidateQueries({ queryKey: ["/api/users", String(profileId)] });
  };

  // ── Avatar picker ─────────────────────────────────────────────────────────
  const handleAvatarPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeImage(file, 400, 400);
      await savePhoto("avatarUrl", dataUrl);
      toast({ title: "Profile photo updated" });
    } catch {
      toast({ title: "Could not update photo", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  };

  // ── Cover picker ──────────────────────────────────────────────────────────
  const handleCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const dataUrl = await resizeImage(file, 1200, 480);
      await savePhoto("coverUrl", dataUrl);
      toast({ title: "Cover photo updated" });
    } catch {
      toast({ title: "Could not update cover", variant: "destructive" });
    } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  };

  const handleFriendAction = async () => {
    if (!profile) return;
    try {
      if (profile.isFriend) {
        await apiRequest("DELETE", `/api/friends/${profileId}`);
        setProfileData((p: any) => ({ ...p, isFriend: false, friendStatus: null, friendshipId: null }));
        toast({ title: "Unfriended" });
      } else if (profile.friendStatus === "pending" && profile.friendshipId) {
        if (profile.requestReceived) {
          await apiRequest("POST", `/api/friends/accept/${profile.friendshipId}`);
          setProfileData((p: any) => ({ ...p, isFriend: true, friendStatus: "accepted" }));
          toast({ title: "Request accepted" });
        } else {
          await apiRequest("DELETE", `/api/friends/${profileId}`);
          setProfileData((p: any) => ({ ...p, friendStatus: null, friendshipId: null }));
          toast({ title: "Request cancelled" });
        }
      } else {
        await apiRequest("POST", `/api/friends/request/${profileId}`);
        setProfileData((p: any) => ({ ...p, friendStatus: "pending" }));
        toast({ title: "Friend request sent" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users", String(profileId)] });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  const initials = profile?.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  const isMe = profile?.isMe;

  if (profileLoading || !profile) {
    return (
      <div className="max-w-4xl mx-auto px-0 sm:px-4 py-0 sm:py-6 space-y-4">
        <Skeleton className="h-40 sm:h-56 w-full sm:rounded-xl skeleton-shimmer" />
        <div className="flex gap-4 px-4">
          <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-full skeleton-shimmer" />
          <div className="space-y-2 pt-2 flex-1">
            <Skeleton className="h-5 w-40 skeleton-shimmer" />
            <Skeleton className="h-4 w-28 skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-0 sm:px-4 py-0 sm:py-6">

      {/* ── Cover + avatar ── */}
      <div className="relative mb-16 sm:mb-20">

        {/* Cover photo */}
        <div className="relative h-36 sm:h-56 w-full sm:rounded-xl cover-gradient overflow-hidden group">
          {profile.coverUrl
            ? <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover" data-testid="img-cover" />
            : null
          }

          {/* Tap-to-change overlay — own profile only */}
          {isMe && (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={coverUploading}
              data-testid="button-change-cover"
              className="absolute inset-0 flex items-end justify-end p-3 bg-black/0 hover:bg-black/25 active:bg-black/30 transition-colors"
              aria-label="Change cover photo"
            >
              <span className="flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-colors">
                {coverUploading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ImagePlus className="w-3.5 h-3.5" />
                }
                {coverUploading ? "Uploading…" : "Change cover"}
              </span>
            </button>
          )}
        </div>

        {/* Avatar — straddles cover/content */}
        <div className="absolute -bottom-10 sm:-bottom-12 left-4 sm:left-6">
          <div className="relative story-ring inline-block rounded-full">
            <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-4 border-card">
              <AvatarImage src={profile.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xl sm:text-2xl font-bold">{initials}</AvatarFallback>
            </Avatar>

            {/* Camera button — own profile only */}
            {isMe && (
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                data-testid="button-change-avatar"
                className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full flex items-center justify-center shadow-md transition-colors border-2 border-card"
                aria-label="Change profile photo"
              >
                {avatarUploading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Camera className="w-3.5 h-3.5" />
                }
              </button>
            )}
          </div>
        </div>

        {/* Hidden file inputs */}
        {isMe && (
          <>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" data-testid="input-avatar-file" onChange={handleAvatarPick} />
            <input ref={coverInputRef}  type="file" accept="image/*" className="hidden" data-testid="input-cover-file"  onChange={handleCoverPick}  />
          </>
        )}
      </div>

      {/* Profile info card */}
      <Card className="shadow-sm mb-4 rounded-none sm:rounded-xl border-x-0 sm:border-x">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold leading-tight">{profile.displayName}</h1>
              <p className="text-muted-foreground text-sm">@{profile.username}</p>
              {profile.bio && <p className="text-sm mt-1.5 max-w-lg leading-snug">{profile.bio}</p>}

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />{profile.location}
                  </span>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline min-h-0 min-w-0 h-auto">
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    {profile.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 shrink-0" />{profile.friendCount} friends
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 shrink-0" />{profile.postCount} posts
                </span>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              {isMe ? (
                <EditProfileDialog user={profile} onSaved={setProfileData} />
              ) : (
                <Button
                  variant={profile.isFriend ? "outline" : "default"}
                  size="sm"
                  className="gap-1.5 h-9"
                  onClick={handleFriendAction}
                  data-testid="button-friend-action"
                >
                  {profile.isFriend
                    ? <><UserCheck className="w-4 h-4" />Friends</>
                    : profile.friendStatus === "pending"
                      ? <><UserMinus className="w-4 h-4" />Pending</>
                      : <><UserPlus className="w-4 h-4" />Add Friend</>
                  }
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-6">
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">
          {isMe && <PostComposer />}
          {postsLoading ? (
            <Card className="rounded-none sm:rounded-xl border-x-0 sm:border-x">
              <CardContent className="p-8 text-center">
                <Skeleton className="h-4 w-48 mx-auto skeleton-shimmer" />
              </CardContent>
            </Card>
          ) : !posts || (posts as any[]).length === 0 ? (
            <Card className="shadow-sm rounded-none sm:rounded-xl border-x-0 sm:border-x">
              <CardContent className="p-10 text-center">
                <div className="text-3xl mb-2">✍️</div>
                <p className="text-sm text-muted-foreground">No posts yet.</p>
              </CardContent>
            </Card>
          ) : (
            (posts as any[]).map((p: any) => (
              <PostCard key={p.id} post={p} onUpdate={() => {
                queryClient.invalidateQueries({ queryKey: [`/api/users/${profileId}/posts`] });
              }} />
            ))
          )}
        </div>

        {/* About sidebar — desktop only */}
        <aside className="hidden lg:block">
          <Card className="shadow-sm sticky top-20">
            <CardContent className="p-4">
              <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-3">About</h3>
              <div className="space-y-2 text-sm">
                {profile.bio
                  ? <p className="leading-snug">{profile.bio}</p>
                  : <p className="text-muted-foreground italic">No bio provided.</p>
                }
                {profile.location && (
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="w-4 h-4 shrink-0" />{profile.location}
                  </p>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:underline min-h-0 min-w-0 h-auto">
                    <Globe className="w-4 h-4 shrink-0" />{profile.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
                <p className="text-muted-foreground pt-1">
                  Joined {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
