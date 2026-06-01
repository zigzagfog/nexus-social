import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthPage from "@/pages/auth";
import FeedPage from "@/pages/feed";
import ProfilePage from "@/pages/profile";
import FriendsPage from "@/pages/friends";
import NotificationsPage from "@/pages/notifications";
import SearchPage from "@/pages/search";
import NotFound from "@/pages/not-found";
import AppLayout from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";

function RedirectToHome() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/"); }, []);
  return null;
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="hsl(221 83% 53%)" />
            <path d="M8 10h4l4 6 4-6h4L16 22 8 10Z" fill="white" />
            <circle cx="16" cy="24" r="2" fill="white" opacity="0.7" />
          </svg>
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={FeedPage} />
        <Route path="/profile/:id" component={ProfilePage} />
        <Route path="/friends" component={FriendsPage} />
        <Route path="/notifications" component={NotificationsPage} />
        <Route path="/search" component={SearchPage} />
        {/* Redirect any unknown path (including /auth) back to feed */}
        <Route component={RedirectToHome} />
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {/* Router lives at the very top so all children share one hash location */}
          <Router hook={useHashLocation}>
            <AuthProvider>
              <AppRouter />
              <Toaster />
            </AuthProvider>
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
