import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { SecurityAlert, classifyError, type SecurityAlertType } from "@/components/security-alert";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [securityAlert, setSecurityAlert] = useState<{
    type: SecurityAlertType;
    message: string;
  } | null>(null);

  const { login, register } = useAuth();
  const { toast } = useToast();

  const [loginEmail, setLoginEmail]       = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regName, setRegName]         = useState("");
  const [regEmail, setRegEmail]       = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm]   = useState("");

  // Clear security alert when switching modes
  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setSecurityAlert(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityAlert(null);
    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err: any) {
      // Check if this is a security-classified error
      const classified = classifyError(err);
      if (classified) {
        setSecurityAlert(classified);
      } else {
        toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityAlert(null);

    // Frontend validation
    if (!regUsername || !regName || !regEmail || !regPassword) {
      toast({ title: "All fields required", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (regPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (regPassword !== regConfirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await register(regUsername, regName, regEmail, regPassword);
    } catch (err: any) {
      const classified = classifyError(err);
      if (classified) {
        setSecurityAlert(classified);
      } else {
        toast({ title: "Registration failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start pt-10 pb-8 px-4 overflow-y-auto">

      {/* Brand */}
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none" aria-label="Nexus">
            <rect width="32" height="32" rx="8" fill="hsl(221 83% 53%)" />
            <path d="M8 10h4l4 6 4-6h4L16 22 8 10Z" fill="white" />
            <circle cx="16" cy="24" r="2" fill="white" opacity="0.7" />
          </svg>
          <h1 className="text-3xl font-bold text-primary">Nexus</h1>
        </div>
        <p className="text-muted-foreground text-sm">Connect with friends and the world.</p>
      </div>

      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="pb-2 px-4 pt-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              data-testid="button-tab-login"
              className={`flex-1 h-10 text-sm font-medium transition-colors min-h-0 ${
                mode === "login"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted active:bg-muted"
              }`}
              onClick={() => switchMode("login")}
            >
              Sign In
            </button>
            <button
              data-testid="button-tab-register"
              className={`flex-1 h-10 text-sm font-medium transition-colors min-h-0 ${
                mode === "register"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted active:bg-muted"
              }`}
              onClick={() => switchMode("register")}
            >
              Create Account
            </button>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-4 pt-2 space-y-4">

          {/* Security alert banner */}
          {securityAlert && (
            <SecurityAlert
              type={securityAlert.type}
              message={securityAlert.message}
              onDismiss={() => setSecurityAlert(null)}
            />
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  data-testid="input-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  data-testid="input-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>
              <Button
                data-testid="button-login"
                type="submit"
                className="w-full h-11"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline min-h-0 min-w-0 h-auto"
                  onClick={() => switchMode("register")}
                >
                  Create one
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input
                  id="reg-name"
                  data-testid="input-full-name"
                  type="text"
                  inputMode="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-username">Username</Label>
                <Input
                  id="reg-username"
                  data-testid="input-username"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  placeholder="janesmith"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  data-testid="input-reg-email"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value.trim())}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  data-testid="input-reg-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm">Confirm Password</Label>
                <Input
                  id="reg-confirm"
                  data-testid="input-reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={regConfirm}
                  onChange={e => setRegConfirm(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button
                data-testid="button-register"
                type="submit"
                className="w-full h-11"
                disabled={loading}
              >
                {loading ? "Creating account…" : "Create Account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline min-h-0 min-w-0 h-auto"
                  onClick={() => switchMode("login")}
                >
                  Sign in
                </button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
