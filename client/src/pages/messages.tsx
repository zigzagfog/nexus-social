import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useCrypto } from "@/lib/cryptoContext";
import { type EncryptedPayload } from "@/lib/crypto";
import { decryptMessage } from "@/lib/crypto";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Participant {
  id: number; username: string; displayName: string; avatarUrl?: string;
}
interface Conversation {
  id: number; participantIds: string; createdAt: string;
  participants: Participant[];
}
interface DM {
  id: number; conversationId: number; senderId: number;
  encryptedPayload: string; readAt: string | null; createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtConvTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Presence dot ─────────────────────────────────────────────────────────────
function PresenceDot({ status, className = "" }: { status?: string; className?: string }) {
  const s = status ?? "offline";
  const color = s === "online" ? "bg-green-500" : s === "away" ? "bg-amber-400" : "bg-muted-foreground/40";
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full border-2 border-card ${color} ${className}`}
      title={s}
    />
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ user, size = 36, status }: { user: Participant; size?: number; status?: string }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName}
          className="w-full h-full rounded-full object-cover" />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-semibold text-sm"
          style={{ background: "hsl(38 92% 54% / 0.15)", color: "hsl(38 80% 30%)" }}
        >
          {initials(user.displayName)}
        </div>
      )}
      {status !== undefined && (
        <PresenceDot status={status} className="absolute bottom-0 right-0" />
      )}
    </div>
  );
}

// ─── Messages Page ────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { user } = useAuth();
  const { presenceMap, encryptFor, decrypt, isReady } = useCrypto();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [decrypted, setDecrypted] = useState<Record<number, string>>({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/messenger/conversations"],
    enabled: !!user,
    refetchInterval: 15_000,
  });

  // Friends list for new-chat picker
  const { data: friends = [] } = useQuery<Participant[]>({
    queryKey: ["/api/friends"],
    enabled: !!user,
    select: (data: any) => data?.accepted ?? data ?? [],
  });

  // Messages for active conversation
  const { data: messages = [] } = useQuery<DM[]>({
    queryKey: ["/api/messenger/messages", activeConvId],
    queryFn: () => apiRequest("GET", `/api/messenger/messages/${activeConvId}`).then((r) => r.json()),
    enabled: !!activeConvId,
  });

  // Decrypt messages when they arrive
  useEffect(() => {
    if (!messages.length || !user || !isReady) return;
    const pending = messages.filter((m) => !decrypted[m.id]);
    if (!pending.length) return;
    (async () => {
      const updates: Record<number, string> = {};
      for (const msg of pending) {
        try {
          updates[msg.id] = await decrypt(msg.encryptedPayload);
        } catch {
          updates[msg.id] = "[encrypted — key unavailable]";
        }
      }
      setDecrypted((prev) => ({ ...prev, ...updates }));
    })();
  }, [messages, isReady, user?.id]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [decrypted, messages.length]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async ({ convId, text }: { convId: number; text: string }) => {
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) throw new Error("No conversation");
      const ids: number[] = JSON.parse(conv.participantIds);
      const encryptedPayload = await encryptFor(text, ids);
      const res = await apiRequest("POST", "/api/messenger/messages", { conversationId: convId, encryptedPayload });
      return res.json();
    },
    onSuccess: (msg: DM) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messenger/messages", msg.conversationId] });
    },
  });

  const handleSend = () => {
    if (!draft.trim() || !activeConvId || !isReady) return;
    sendMutation.mutate({ convId: activeConvId, text: draft.trim() });
    setDraft("");
  };

  // Start / open conversation
  const newConvMutation = useMutation({
    mutationFn: (otherUserId: number) =>
      apiRequest("POST", "/api/messenger/conversations", { otherUserId }).then((r) => r.json()),
    onSuccess: (conv: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/messenger/conversations"] });
      setActiveConvId(conv.id);
      setNewChatOpen(false);
      setSearchQ("");
    },
  });

  // Mark read on open
  useEffect(() => {
    if (!activeConvId || !messages.length) return;
    const unread = messages.filter((m) => m.senderId !== user?.id && !m.readAt);
    for (const msg of unread) {
      apiRequest("PATCH", `/api/messenger/messages/${msg.id}/read`, {}).catch(() => {});
    }
  }, [activeConvId, messages.length]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const otherUser = activeConv?.participants.find((p) => p.id !== user?.id);
  const otherStatus = otherUser ? presenceMap[String(otherUser.id)] : "offline";

  const filteredFriends = (friends as Participant[]).filter((f) =>
    f.displayName.toLowerCase().includes(searchQ.toLowerCase()) ||
    f.username.toLowerCase().includes(searchQ.toLowerCase())
  );

  if (!user) return null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="flex w-72 flex-col border-r border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm text-foreground">Messages</span>
          <button
            data-testid="button-new-chat"
            onClick={() => setNewChatOpen(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition"
            title="New message"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No messages yet. Start a conversation with a friend.
            </p>
          )}
          {conversations.map((c) => {
            const other = c.participants.find((p) => p.id !== user.id);
            if (!other) return null;
            const status = presenceMap[String(other.id)] ?? "offline";
            const isActive = c.id === activeConvId;
            return (
              <button
                key={c.id}
                data-testid={`conv-${c.id}`}
                onClick={() => setActiveConvId(c.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left border-b border-border/40 transition-colors ${
                  isActive ? "bg-accent" : "hover:bg-muted/50"
                }`}
              >
                <Avatar user={other} size={36} status={status} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium text-foreground truncate">{other.displayName}</p>
                    <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">{fmtConvTime(c.createdAt)}</span>
                  </div>
                  <p className={`text-xs capitalize ${
                    status === "online" ? "text-green-600 dark:text-green-400" :
                    status === "away" ? "text-amber-500 dark:text-amber-400" :
                    "text-muted-foreground"
                  }`}>{status}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* E2E badge */}
        <div className="flex justify-center border-t border-border py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-primary border border-primary/30 bg-accent px-2.5 py-1 rounded-full">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            End-to-end encrypted
          </span>
        </div>
      </aside>

      {/* ── Chat window ──────────────────────────────────────────────── */}
      {activeConvId && otherUser ? (
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card">
            <a href={`/#/profile/${otherUser.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition">
              <Avatar user={otherUser} size={36} status={otherStatus} />
              <div>
                <p className="text-sm font-semibold text-foreground">{otherUser.displayName}</p>
                <p className={`text-xs capitalize font-medium ${
                  otherStatus === "online" ? "text-green-600 dark:text-green-400" :
                  otherStatus === "away" ? "text-amber-500 dark:text-amber-400" :
                  "text-muted-foreground"
                }`}>{otherStatus ?? "offline"}</p>
              </div>
            </a>
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1 text-[11px] text-primary border border-primary/30 bg-accent px-2 py-0.5 rounded-full">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                E2E encrypted
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 py-4 bg-background">
            {messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground mt-8">
                Send a message to start the conversation.
              </p>
            )}
            {messages.map((msg) => {
              const isSent = msg.senderId === user.id;
              const text = decrypted[msg.id];
              return (
                <div key={msg.id} className={`flex flex-col ${isSent ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[72%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed word-break ${
                    isSent
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card border border-border text-foreground rounded-bl-sm"
                  } ${!text ? "opacity-60" : ""}`}>
                    {text ?? (
                      <span className="flex items-center gap-1 text-xs">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                        </svg>
                        Decrypting…
                      </span>
                    )}
                  </div>
                  <span className="mt-0.5 text-xs text-muted-foreground">{fmtTime(msg.createdAt)}</span>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="px-4 py-3 border-t border-border bg-card">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/60 transition-colors">
              <textarea
                data-testid="input-message"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={isReady ? "Write a message…" : "Setting up encryption…"}
                disabled={!isReady}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                style={{ maxHeight: 120, overflowY: "auto" }}
              />
              <button
                data-testid="button-send"
                onClick={handleSend}
                disabled={!draft.trim() || !isReady || sendMutation.isPending}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:brightness-105 disabled:opacity-40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Messages are encrypted before leaving your device
            </p>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center bg-background">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(38,92%,54%)" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-foreground">Your messages</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Private, end-to-end encrypted conversations with your Nexus friends.
            </p>
          </div>
          <button
            onClick={() => setNewChatOpen(true)}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:brightness-105 transition"
          >
            New message
          </button>
        </div>
      )}

      {/* ── New message modal ─────────────────────────────────────── */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm dark:bg-black/50">
          <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-foreground text-sm">New message</p>
              <button onClick={() => { setNewChatOpen(false); setSearchQ(""); }}
                className="text-muted-foreground hover:text-foreground transition">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              autoFocus
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search friends…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 mb-3"
            />
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {filteredFriends.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {friends.length === 0 ? "Add friends first to start a conversation." : "No friends match your search."}
                </p>
              )}
              {filteredFriends.map((f) => {
                const status = presenceMap[String(f.id)] ?? "offline";
                return (
                  <button
                    key={f.id}
                    onClick={() => newConvMutation.mutate(f.id)}
                    disabled={newConvMutation.isPending}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent transition text-left"
                  >
                    <Avatar user={f} size={32} status={status} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{f.displayName}</p>
                      <p className={`text-xs capitalize ${
                        status === "online" ? "text-green-600 dark:text-green-400" :
                        status === "away" ? "text-amber-500 dark:text-amber-400" :
                        "text-muted-foreground"
                      }`}>{status}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
