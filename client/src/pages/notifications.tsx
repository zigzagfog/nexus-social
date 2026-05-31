import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bell } from "lucide-react";
import { useEffect } from "react";

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function notifText(type: string) {
  switch (type) {
    case "like":            return "reacted to your post";
    case "comment":         return "commented on your post";
    case "friend_request":  return "sent you a friend request";
    case "friend_accepted": return "accepted your friend request";
    case "post":            return "shared a new post";
    default:                return "did something";
  }
}

function notifEmoji(type: string) {
  switch (type) {
    case "like":            return "👍";
    case "comment":         return "💬";
    case "friend_request":  return "🤝";
    case "friend_accepted": return "✅";
    case "post":            return "📝";
    default:                return "🔔";
  }
}

export default function NotificationsPage() {
  const { data: notifs = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/notifications"],
    // Always refetch when this page is mounted
    staleTime: 0,
  });

  // Mark all as read when page is viewed, then sync both caches
  useEffect(() => {
    apiRequest("POST", "/api/notifications/read")
      .then(() => {
        // Invalidate both so unread badge clears and list shows read state
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="px-4 pt-4 sm:pt-6 pb-3 sm:pb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6 text-primary" />
          Notifications
        </h1>
        {/* Manual refresh for stale data */}
        <button
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2"
          data-testid="button-refresh-notifications"
        >
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-0 sm:space-y-2 sm:px-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="rounded-none sm:rounded-xl border-x-0 sm:border-x">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (notifs as any[]).length === 0 ? (
        <div className="px-4">
          <Card className="rounded-xl">
            <CardContent className="p-10 text-center">
              <div className="text-4xl mb-3">🔔</div>
              <h3 className="font-semibold text-base mb-1">No notifications yet</h3>
              <p className="text-sm text-muted-foreground">
                When friends like your posts or send you requests, you'll see them here.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-0 sm:space-y-2 sm:px-4">
          {(notifs as any[]).map((n: any) => {
            // Actor name — fall back gracefully if enrichment is missing
            const actorName = n.actor?.displayName ?? n.actor?.username ?? "Someone";
            const actorUsername = n.actor?.username ?? "";
            const actorAvatar = n.actor?.avatarUrl ?? "";
            const actorId = n.actor?.id ?? n.actorId;
            const initials = actorName
              .split(" ")
              .map((x: string) => x[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <Card
                key={n.id}
                className={`rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm transition-colors ${
                  !n.read ? "border-l-2 border-l-primary bg-accent/20" : ""
                }`}
                data-testid={`notification-${n.id}`}
              >
                <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                  {/* Avatar with emoji badge */}
                  <a
                    href={`/#/profile/${actorId}`}
                    className="relative shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Avatar className="w-11 h-11 cursor-pointer">
                      <AvatarImage src={actorAvatar} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-1 -right-1 text-base leading-none select-none">
                      {notifEmoji(n.type)}
                    </span>
                  </a>

                  {/* Text body */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      <a href={`/#/profile/${actorId}`}>
                        <span className="font-semibold hover:underline cursor-pointer">
                          {actorName}
                        </span>
                      </a>
                      {actorUsername && actorUsername !== actorName && (
                        <span className="text-muted-foreground text-xs ml-1">@{actorUsername}</span>
                      )}{" "}
                      <span className="text-muted-foreground">{notifText(n.type)}</span>
                    </p>
                    {n.createdAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                    )}
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0 ml-1" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
