import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import PostComposer from "@/components/post-composer";
import PostCard from "@/components/post-card";
import StoriesBar from "@/components/stories-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function PeopleYouMayKnow() {
  const { toast } = useToast();
  const { data: suggestions = [] } = useQuery({ queryKey: ["/api/suggestions"] });

  const sendRequest = async (userId: number) => {
    try {
      await apiRequest("POST", `/api/friends/request/${userId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/suggestions"] });
      toast({ title: "Friend request sent" });
    } catch {
      toast({ title: "Could not send request", variant: "destructive" });
    }
  };

  if (!suggestions || (suggestions as any[]).length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <h3 className="font-semibold text-xs mb-3 text-muted-foreground uppercase tracking-wide">
          People You May Know
        </h3>
        <div className="space-y-3">
          {(suggestions as any[]).slice(0, 5).map((u: any) => {
            const initials = u.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
            return (
              <div key={u.id} className="flex items-center gap-3" data-testid={`suggestion-user-${u.id}`}>
                <a href={`/#/profile/${u.id}`} className="shrink-0 min-h-0 min-w-0">
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={u.avatarUrl || ""} />
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </a>
                <div className="flex-1 min-w-0">
                  <a href={`/#/profile/${u.id}`} className="min-h-0 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">{u.displayName}</p>
                  </a>
                  <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs h-8 px-3 min-w-0"
                  data-testid={`button-add-friend-${u.id}`}
                  onClick={() => sendRequest(u.id)}
                >
                  Add
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <Card key={i} className="shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full skeleton-shimmer" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32 skeleton-shimmer" />
                <Skeleton className="h-3 w-20 skeleton-shimmer" />
              </div>
            </div>
            <Skeleton className="h-4 w-full skeleton-shimmer" />
            <Skeleton className="h-4 w-4/5 skeleton-shimmer" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const { user } = useAuth();
  const { data: posts, isLoading } = useQuery({ queryKey: ["/api/feed"] });
  const initials = user?.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  return (
    /* Mobile: single column, full-width, small horizontal padding
       Desktop: 3-column grid with sidebars */
    <div className="max-w-6xl mx-auto px-0 sm:px-4 py-0 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6">

        {/* Left sidebar — desktop only */}
        <aside className="hidden lg:block lg:col-span-3">
          <Card className="shadow-sm sticky top-20">
            <CardContent className="p-4">
              <a href={`/#/profile/${user?.id}`} className="flex items-center gap-3 mb-3 cursor-pointer group min-h-0 min-w-0">
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={user?.avatarUrl || ""} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate group-hover:underline">{user?.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
                </div>
              </a>
              {user?.bio && <p className="text-xs text-muted-foreground">{user.bio}</p>}
            </CardContent>
          </Card>
        </aside>

        {/* Main feed — full width on mobile */}
        <div className="lg:col-span-6 space-y-3 sm:space-y-4">
          {/* Stories */}
          <div className="rounded-none sm:rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #E0DCD7" }}>
            <StoriesBar />
          </div>
          <PostComposer />
          {isLoading ? (
            <FeedSkeleton />
          ) : !posts || (posts as any[]).length === 0 ? (
            <Card className="shadow-sm rounded-none sm:rounded-xl">
              <CardContent className="p-12 text-center">
                <div className="text-4xl mb-3">🌐</div>
                <h3 className="font-semibold text-base mb-1">Your feed is empty</h3>
                <p className="text-sm text-muted-foreground">Connect with friends or share something.</p>
              </CardContent>
            </Card>
          ) : (
            (posts as any[]).map((p: any) => (
              <PostCard
                key={p.id}
                post={p}
                onUpdate={() => queryClient.invalidateQueries({ queryKey: ["/api/feed"] })}
              />
            ))
          )}
        </div>

        {/* Right sidebar — desktop only */}
        <aside className="hidden lg:block lg:col-span-3">
          <div className="sticky top-20 space-y-4">
            <PeopleYouMayKnow />
          </div>
        </aside>
      </div>
    </div>
  );
}
