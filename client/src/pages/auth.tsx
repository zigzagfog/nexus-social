import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SecurityAlert, classifyError, type SecurityAlertType } from "@/components/security-alert";
import { AlertCircle } from "lucide-react";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  // Persistent error (shown under the button, never disappears on its own)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false); // show "switch to sign in" hint
  const [securityAlert, setSecurityAlert] = useState<{
    type: SecurityAlertType;
    message: string;
  } | null>(null);

  const { login, register } = useAuth();

  const [loginEmail, setLoginEmail]       = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regName, setRegName]         = useState("");
  const [regEmail, setRegEmail]       = useState("");
  const [regPassword, setRegPassword] = useState("");

  const clearErrors = () => { setErrorMsg(null); setAlreadyExists(false); setSecurityAlert(null); };

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    clearErrors();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (!loginEmail || !loginPassword) {
      setErrorMsg("Please fill in both fields.");
      return;
    }

    setLoading(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err: any) {
      const classified = classifyError(err);
      if (classified) {
        setSecurityAlert(classified);
      } else {
        setErrorMsg(err.message || "Sign in failed. Please check your email and password.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (!regName) {
      setErrorMsg("Please enter your full name.");
      return;
    }
    if (!regUsername) {
      setErrorMsg("Please choose a username (letters, numbers, underscores only).");
      return;
    }
    if (!regEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (regPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters long.");
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
        const msg: string = err.message || "Could not create account. Please try again.";
        // Detect "already taken" / "already registered" — offer to switch to sign in
        const isDupe = /already|taken|registered|exists/i.test(msg);
        setAlreadyExists(isDupe);
        setErrorMsg(isDupe
          ? "This email or username already has an account. Tap \"Switch to Sign In\" below."
          : msg === "Unexpected response from server. Please try again."
            ? "Connection error — please wait a moment and try again."
            : msg);
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
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              data-testid="button-tab-login"
              className={`flex-1 h-11 text-sm font-medium transition-colors ${
                mode === "login"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => switchMode("login")}
            >
              Sign In
            </button>
            <button
              data-testid="button-tab-register"
              className={`flex-1 h-11 text-sm font-medium transition-colors ${
                mode === "register"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => switchMode("register")}
            >
              Create Account
            </button>
          </div>
        </CardHeader>

        <CardContent className="px-4 pb-5 pt-3 space-y-4">

          {/* Security alert (stays visible until dismissed) */}
          {securityAlert && (
            <SecurityAlert
              type={securityAlert.type}
              message={securityAlert.message}
              onDismiss={clearErrors}
            />
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
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
                  onChange={e => { setLoginEmail(e.target.value); clearErrors(); }}
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
                  onChange={e => { setLoginPassword(e.target.value); clearErrors(); }}
                  className="h-11"
                />
              </div>

              {/* Error message — always visible, never auto-hides */}
              {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

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
                  className="text-primary font-medium hover:underline"
                  onClick={() => switchMode("register")}
                >
                  Create one
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input
                  id="reg-name"
                  data-testid="input-full-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Smith"
                  value={regName}
                  onChange={e => { setRegName(e.target.value); clearErrors(); }}
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="janesmith"
                  value={regUsername}
                  onChange={e => {
                    // Only allow letters, numbers, underscores — no email characters
                    setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
                    clearErrors();
                  }}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Letters, numbers, and underscores only. Not your email address.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  data-testid="input-reg-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={e => { setRegEmail(e.target.value.trim()); clearErrors(); }}
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
                  placeholder="At least 6 characters"
                  value={regPassword}
                  onChange={e => { setRegPassword(e.target.value); clearErrors(); }}
                  className="h-11"
                />
              </div>

              {/* Error message — always visible, never auto-hides */}
              {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* If account already exists, show a prominent switch button */}
              {alreadyExists && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 border-primary text-primary font-semibold"
                  onClick={() => switchMode("login")}
                >
                  Switch to Sign In
                </Button>
              )}

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
                  className="text-primary font-medium hover:underline"
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
