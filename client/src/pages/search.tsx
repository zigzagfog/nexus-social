import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, UserPlus, UserCheck, UserMinus } from "lucide-react";

export default function SearchPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const res = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(q)}`);
      const data = await res.text().then(t => JSON.parse(t));
      setResults(data);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    const v = e.target.value;
    const t = setTimeout(() => search(v), 350);
    return () => clearTimeout(t);
  };

  const sendRequest = async (userId: number) => {
    try {
      await apiRequest("POST", `/api/friends/request/${userId}`);
      setResults(prev => prev.map(u => u.id === userId ? { ...u, requestSent: true, friendStatus: "pending" } : u));
      toast({ title: "Friend request sent" });
    } catch (err: any) {
      toast({ title: "Could not send request", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="px-4 pt-4 sm:pt-6 pb-3 sm:pb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6 text-primary" />
          Search
        </h1>
      </div>

      {/* Search input — full-width, 44px tall, 16px font to prevent iOS zoom */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-search-query"
            placeholder="Search for people by name or username…"
            value={query}
            onChange={handleInput}
            className="pl-10 rounded-full h-11 text-base"
            style={{ fontSize: "16px" }}
            inputMode="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center text-sm text-muted-foreground py-6">Searching…</div>
      )}

      {/* No results */}
      {!loading && searched && results.length === 0 && (
        <div className="px-4">
          <Card className="rounded-xl">
            <CardContent className="p-10 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-semibold text-base mb-1">No results for "{query}"</p>
              <p className="text-sm text-muted-foreground">Try a different name or username.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results — edge-to-edge on mobile */}
      {results.length > 0 && (
        <div className="space-y-0 sm:space-y-3 sm:px-4">
          {results.map((u: any) => {
            const initials = u.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
            return (
              <Card
                key={u.id}
                className="rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm"
                data-testid={`search-result-${u.id}`}
              >
                <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                  {/* Avatar */}
                  <a href={`/#/profile/${u.id}`} className="shrink-0">
                    <Avatar className="w-12 h-12 cursor-pointer">
                      <AvatarImage src={u.avatarUrl || ""} />
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                  </a>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <a href={`/#/profile/${u.id}`}>
                      <p className="font-semibold text-sm hover:underline cursor-pointer truncate leading-tight">{u.displayName}</p>
                    </a>
                    <p className="text-xs text-muted-foreground">@{u.username}</p>
                    {u.bio && <p className="text-xs text-muted-foreground truncate mt-0.5">{u.bio}</p>}
                  </div>

                  {/* Action buttons — stacked on very small, row on sm+ */}
                  <div className="flex flex-col xs:flex-row gap-2 shrink-0">
                    <a href={`/#/profile/${u.id}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] min-w-[44px] px-3 w-full xs:w-auto"
                        data-testid={`button-view-${u.id}`}
                      >
                        View
                      </Button>
                    </a>
                    {!u.isFriend && !u.requestSent && (
                      <Button
                        size="sm"
                        className="gap-1 min-h-[44px] min-w-[44px] px-3"
                        onClick={() => sendRequest(u.id)}
                        data-testid={`button-add-${u.id}`}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Add</span>
                      </Button>
                    )}
                    {(u.isFriend || u.friendStatus === "accepted") && (
                      <Button size="sm" variant="secondary" className="gap-1 min-h-[44px] px-3" disabled>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Friends</span>
                      </Button>
                    )}
                    {u.requestSent && !u.isFriend && (
                      <Button size="sm" variant="secondary" className="gap-1 min-h-[44px] px-3" disabled>
                        <UserMinus className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">Pending</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty prompt */}
      {!searched && !loading && (
        <div className="text-center py-12 px-4">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-sm text-muted-foreground">Type a name to find people on Nexus.</p>
        </div>
      )}
    </div>
  );
}
