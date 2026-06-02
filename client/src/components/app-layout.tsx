import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, Users, Bell, Search, LogOut, User, Moon, Sun, Globe } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };
  return (
    <button
      onClick={toggle}
      data-testid="button-theme-toggle"
      aria-label="Toggle theme"
      className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
    >
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

function NexusLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="Nexus Social logo" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="hsl(221 83% 53%)" />
      <path d="M8 10h4l4 6 4-6h4L16 22 8 10Z" fill="white" />
      <circle cx="16" cy="24" r="2" fill="white" opacity="0.7" />
    </svg>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const { data: unreadData } = useQuery({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const unreadCount = (unreadData as any)?.count ?? 0;

  const navItems = [
    { path: "/#/",             hashPath: "/",             icon: Home,  label: "Home" },
    { path: "/#/friends",      hashPath: "/friends",      icon: Users, label: "Friends" },
    { path: "/#/notifications",hashPath: "/notifications",icon: Bell,  label: "Alerts", badge: unreadCount },
    { path: "/#/search",       hashPath: "/search",       icon: Search,label: "Search" },
  ];

  const initials = user?.displayName?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Nav ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm"
        style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-4">

          {/* Logo */}
          <a href="/#/" className="flex items-center gap-2 shrink-0 min-h-0 min-w-0">
            <NexusLogo />
            <span className="font-bold text-base text-foreground hidden sm:block">Nexus</span>
          </a>

          {/* Search bar — visible on desktop only (mobile uses bottom nav tab) */}
          <div className="hidden sm:flex flex-1 max-w-xs">
            <a href="/#/search" className="w-full min-h-0 min-w-0">
              <div
                data-testid="input-search"
                className="flex items-center gap-2 px-3 h-9 w-full rounded-full bg-muted text-muted-foreground text-sm cursor-pointer hover:bg-secondary transition-colors"
              >
                <Search className="w-4 h-4 shrink-0" />
                <span>Search Nexus</span>
              </div>
            </a>
          </div>

          {/* Center nav — desktop only */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {navItems.filter(i => i.hashPath !== "/search").map(item => (
              <a key={item.hashPath} href={item.path} className="min-h-0 min-w-0">
                <div
                  data-testid={`button-nav-${item.label.toLowerCase()}`}
                  className={`relative flex items-center justify-center w-24 h-10 transition-colors cursor-pointer ${
                    location === item.hashPath
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg"
                  }`}
                >
                  <item.icon className="w-6 h-6" />
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute top-0.5 right-2 bg-destructive text-destructive-foreground text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-1 ml-auto">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="button-user-menu"
                  className="rounded-full hover:bg-muted p-1 transition-colors min-h-0 min-w-0 w-10 h-10"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user?.avatarUrl || ""} alt={user?.displayName} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="font-semibold text-sm truncate">{user?.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">@{user?.username}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={`/#/profile/${user?.id}`} className="min-h-0 min-w-0 w-full cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    View Profile
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={logout}
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href="https://www.jmfcool.org" target="_blank" className="min-h-0 min-w-0 w-full cursor-pointer">
                    <Globe className="w-4 h-4 mr-2" />
                    Home
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────── */}
      {/* pb-safe-nav adds bottom-nav height + safe-area + extra padding on mobile */}
      <main className="pb-safe-nav md:pb-6">
        {children}
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <div className="flex items-stretch justify-around h-14">
          {navItems.map(item => {
            const active = location === item.hashPath;
            return (
              <a
                key={item.hashPath}
                href={item.path}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative min-h-0 min-w-0 active:bg-muted/50 transition-colors"
                data-testid={`button-mobile-nav-${item.label.toLowerCase()}`}
              >
                <item.icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[10px] leading-none font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
                {(item.badge ?? 0) > 0 && (
                  <span className="absolute top-1 left-[calc(50%+8px)] bg-destructive text-destructive-foreground text-[10px] rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-0.5 leading-none">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </a>
            );
          })}
          {/* Profile tab */}
          <a
            href={`/#/profile/${user?.id}`}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-0 min-w-0 active:bg-muted/50 transition-colors"
          >
            <Avatar className="w-6 h-6">
              <AvatarImage src={user?.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-[10px] leading-none font-medium text-muted-foreground">Me</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
