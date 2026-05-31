import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserCheck, UserX, Users } from "lucide-react";

function FriendCard({ user }: { user: any }) {
  const initials = user.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
  return (
    <Card
      className="rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm hover-elevate"
      data-testid={`card-friend-${user.id}`}
    >
      <CardContent className="p-3 sm:p-4 flex items-center gap-3">
        <a href={`/#/profile/${user.id}`} className="shrink-0">
          <Avatar className="w-12 h-12 cursor-pointer">
            <AvatarImage src={user.avatarUrl || ""} />
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </a>
        <div className="flex-1 min-w-0">
          <a href={`/#/profile/${user.id}`}>
            <p className="font-semibold text-sm hover:underline cursor-pointer truncate leading-tight">{user.displayName}</p>
          </a>
          <p className="text-xs text-muted-foreground">@{user.username}</p>
          {user.bio && <p className="text-xs text-muted-foreground truncate mt-0.5">{user.bio}</p>}
        </div>
        <a href={`/#/profile/${user.id}`} className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] min-w-[44px] px-3"
            data-testid={`button-view-friend-${user.id}`}
          >
            View
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}

function RequestCard({ request }: { request: any }) {
  const { toast } = useToast();
  const initials = request.requester?.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const accept = async () => {
    try {
      await apiRequest("POST", `/api/friends/accept/${request.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({ title: "Friend request accepted" });
    } catch {
      toast({ title: "Failed to accept", variant: "destructive" });
    }
  };

  const decline = async () => {
    try {
      await apiRequest("POST", `/api/friends/decline/${request.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      toast({ title: "Request declined" });
    } catch {
      toast({ title: "Failed to decline", variant: "destructive" });
    }
  };

  return (
    <Card
      className="rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm"
      data-testid={`card-request-${request.id}`}
    >
      <CardContent className="p-3 sm:p-4 flex items-center gap-3">
        <a href={`/#/profile/${request.requester?.id}`} className="shrink-0">
          <Avatar className="w-12 h-12 cursor-pointer">
            <AvatarImage src={request.requester?.avatarUrl || ""} />
            <AvatarFallback className="bg-secondary text-secondary-foreground font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </a>
        <div className="flex-1 min-w-0">
          <a href={`/#/profile/${request.requester?.id}`}>
            <p className="font-semibold text-sm hover:underline cursor-pointer truncate leading-tight">{request.requester?.displayName}</p>
          </a>
          <p className="text-xs text-muted-foreground">@{request.requester?.username}</p>
        </div>
        {/* Stack buttons vertically on very small screens, side-by-side on sm+ */}
        <div className="flex flex-col xs:flex-row gap-2 shrink-0">
          <Button
            size="sm"
            className="gap-1 min-h-[44px] min-w-[44px] px-3"
            onClick={accept}
            data-testid={`button-accept-${request.id}`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Accept</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 min-h-[44px] min-w-[44px] px-3"
            onClick={decline}
            data-testid={`button-decline-${request.id}`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Decline</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FriendsPage() {
  const { data: friends = [], isLoading: friendsLoading } = useQuery({ queryKey: ["/api/friends"] });
  const { data: requests = [], isLoading: requestsLoading } = useQuery({ queryKey: ["/api/friends/requests"] });

  const pendingCount = (requests as any[]).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header — flush on mobile, padded on sm+ */}
      <div className="px-4 sm:px-4 pt-4 sm:pt-6 pb-3 sm:pb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" />
          Friends
        </h1>
      </div>

      <Tabs defaultValue="friends">
        {/* TabsList — flush left on mobile */}
        <div className="px-4 sm:px-4 mb-1">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="friends" className="flex-1 sm:flex-none" data-testid="tab-all-friends">
              All Friends
              {(friends as any[]).length > 0 && (
                <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {(friends as any[]).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 sm:flex-none" data-testid="tab-requests">
              Requests
              {pendingCount > 0 && (
                <span className="ml-1.5 text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="friends" className="mt-0">
          {friendsLoading ? (
            <div className="space-y-0 sm:space-y-3 sm:px-4 sm:pt-3">
              {[1, 2, 3, 4].map(i => (
                <Card key={i} className="rounded-none sm:rounded-xl border-x-0 sm:border-x">
                  <CardContent className="p-3 sm:p-4">
                    <Skeleton className="h-12 w-full skeleton-shimmer" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (friends as any[]).length === 0 ? (
            <div className="px-4 pt-3">
              <Card className="rounded-xl">
                <CardContent className="p-10 text-center">
                  <div className="text-4xl mb-3">👥</div>
                  <h3 className="font-semibold text-base mb-1">No friends yet</h3>
                  <p className="text-sm text-muted-foreground">Search for people to connect with.</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Edge-to-edge list on mobile, two-column grid on sm+ */
            <div className="space-y-0 sm:space-y-0 sm:px-4 sm:pt-3 sm:grid sm:grid-cols-2 sm:gap-3">
              {(friends as any[]).map((f: any) => <FriendCard key={f.id} user={f} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-0">
          {requestsLoading ? (
            <div className="space-y-0 sm:space-y-3 sm:px-4 sm:pt-3">
              {[1, 2].map(i => (
                <Card key={i} className="rounded-none sm:rounded-xl border-x-0 sm:border-x">
                  <CardContent className="p-3 sm:p-4">
                    <Skeleton className="h-12 w-full skeleton-shimmer" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (requests as any[]).length === 0 ? (
            <div className="px-4 pt-3">
              <Card className="rounded-xl">
                <CardContent className="p-10 text-center">
                  <div className="text-4xl mb-3">🤝</div>
                  <h3 className="font-semibold text-base mb-1">No pending requests</h3>
                  <p className="text-sm text-muted-foreground">When someone sends you a friend request, it'll show up here.</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-0 sm:space-y-3 sm:px-4 sm:pt-3">
              {(requests as any[]).map((r: any) => <RequestCard key={r.id} request={r} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
