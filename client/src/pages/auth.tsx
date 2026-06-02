import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SecurityAlert, classifyError, type SecurityAlertType } from "@/components/security-alert";
import { AlertCircle, Eye, EyeOff, CheckCircle2, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type Mode = "login" | "register" | "forgot" | "reset";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [securityAlert, setSecurityAlert] = useState<{
    type: SecurityAlertType;
    message: string;
  } | null>(null);

  const { login, register } = useAuth();

  // Login fields
  const [loginEmail, setLoginEmail]       = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [regUsername, setRegUsername] = useState("");
  const [regName, setRegName]         = useState("");
  const [regEmail, setRegEmail]       = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode]     = useState("");      // code shown on screen
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [enteredCode, setEnteredCode] = useState("");      // code user types in
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const clearErrors = () => { setErrorMsg(null); setAlreadyExists(false); setSecurityAlert(null); };

  const switchMode = (m: Mode) => {
    setMode(m);
    clearErrors();
    setResetCode("");
    setResetUserId(null);
    setEnteredCode("");
    setNewPassword("");
    setResetSuccess(false);
  };

  // ── Login ──────────────────────────────────────────────────────────────────
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

  // ── Register ───────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    if (!regName) { setErrorMsg("Please enter your full name."); return; }
    if (!regUsername) { setErrorMsg("Please choose a username (letters, numbers, underscores only)."); return; }
    if (!regEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) {
      setErrorMsg("Please enter a valid email address."); return;
    }
    if (regPassword.length < 6) { setErrorMsg("Password must be at least 6 characters long."); return; }
    setLoading(true);
    try {
      await register(regUsername, regName, regEmail, regPassword);
    } catch (err: any) {
      const classified = classifyError(err);
      if (classified) {
        setSecurityAlert(classified);
      } else {
        const msg: string = err.message || "Could not create account. Please try again.";
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

  // ── Forgot password: request code ─────────────────────────────────────────
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      setErrorMsg("Please enter a valid email address."); return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email: forgotEmail });
      const data = await res.json();
      if (data.code) {
        setResetCode(data.code);
        setResetUserId(data.userId);
        setMode("reset");
      } else {
        // Email not found — show a neutral message
        setErrorMsg("No account found with that email address.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Reset password: submit code + new password ─────────────────────────────
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    if (enteredCode.trim() !== resetCode) {
      setErrorMsg("That code doesn't match. Please copy it exactly from above.");
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters long."); return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password", {
        userId: resetUserId,
        code: enteredCode.trim(),
        newPassword,
      });
      const data = await res.json();
      if (data.ok) {
        setResetSuccess(true);
      } else {
        setErrorMsg(data.error || "Reset failed. Please try again.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Reset failed. Please try again.");
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

        {/* ── Forgot / Reset mode: no tabs ── */}
        {(mode === "forgot" || mode === "reset") ? (
          <>
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-primary" />
                <span className="font-semibold text-base">
                  {mode === "forgot" ? "Reset your password" : "Enter your reset code"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-5 pt-3 space-y-4">

              {securityAlert && (
                <SecurityAlert type={securityAlert.type} message={securityAlert.message} onDismiss={clearErrors} />
              )}

              {/* ── Step 1: enter email ── */}
              {mode === "forgot" && (
                <form onSubmit={handleForgotRequest} className="space-y-4" noValidate>
                  <p className="text-sm text-muted-foreground">
                    Enter the email address for your account. A reset code will appear right here on screen.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      id="forgot-email"
                      data-testid="input-forgot-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={e => { setForgotEmail(e.target.value.trim()); clearErrors(); }}
                      className="h-11"
                    />
                  </div>
                  {errorMsg && (
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  <Button data-testid="button-forgot-submit" type="submit" className="w-full h-11" disabled={loading}>
                    {loading ? "Looking up account…" : "Get Reset Code"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("login")}>
                      Back to Sign In
                    </button>
                  </p>
                </form>
              )}

              {/* ── Step 2: show code, enter it, set new password ── */}
              {mode === "reset" && (
                <form onSubmit={handleResetSubmit} className="space-y-4" noValidate>

                  {resetSuccess ? (
                    <div className="flex flex-col items-center gap-3 py-2 text-center">
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                      <p className="font-semibold text-foreground">Password updated!</p>
                      <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
                      <Button
                        type="button"
                        className="w-full h-11 mt-2"
                        onClick={() => switchMode("login")}
                      >
                        Sign In
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Show the code prominently */}
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Your reset code (valid 15 min)</p>
                        <p className="text-3xl font-mono font-bold tracking-widest text-primary" data-testid="text-reset-code">
                          {resetCode}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Copy it, then type it in the box below.</p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="reset-code">Enter the code above</Label>
                        <Input
                          id="reset-code"
                          data-testid="input-reset-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="6-digit code"
                          maxLength={6}
                          value={enteredCode}
                          onChange={e => { setEnteredCode(e.target.value.replace(/\D/g, "")); clearErrors(); }}
                          className="h-11 text-center font-mono tracking-widest text-lg"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="new-password">New Password</Label>
                        <div className="relative">
                          <Input
                            id="new-password"
                            data-testid="input-new-password"
                            type={showNewPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="At least 6 characters"
                            value={newPassword}
                            onChange={e => { setNewPassword(e.target.value); clearErrors(); }}
                            className="h-11 pr-11"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={showNewPassword ? "Hide password" : "Show password"}
                          >
                            {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      {errorMsg && (
                        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <span>{errorMsg}</span>
                        </div>
                      )}

                      <Button data-testid="button-reset-submit" type="submit" className="w-full h-11" disabled={loading}>
                        {loading ? "Updating password…" : "Set New Password"}
                      </Button>
                      <p className="text-center text-sm text-muted-foreground">
                        <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("forgot")}>
                          Request a new code
                        </button>
                        {" · "}
                        <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("login")}>
                          Back to Sign In
                        </button>
                      </p>
                    </>
                  )}
                </form>
              )}
            </CardContent>
          </>
        ) : (
          /* ── Login / Register tabs ── */
          <>
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

              {securityAlert && (
                <SecurityAlert type={securityAlert.type} message={securityAlert.message} onDismiss={clearErrors} />
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Password</Label>
                      <button
                        type="button"
                        data-testid="button-forgot-password"
                        className="text-xs text-primary hover:underline"
                        onClick={() => { setForgotEmail(loginEmail); switchMode("forgot"); }}
                      >
                        Forgot password?
                      </button>
                    </div>
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

                  {errorMsg && (
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <Button data-testid="button-login" type="submit" className="w-full h-11" disabled={loading}>
                    {loading ? "Signing in…" : "Sign In"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("register")}>
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
                      autoCapitalize="words"
                      autoCorrect="off"
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
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoSave="off"
                      spellCheck={false}
                      placeholder="janesmith"
                      value={regUsername}
                      onChange={e => {
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
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="you@example.com"
                      value={regEmail}
                      onChange={e => { setRegEmail(e.target.value.trim()); clearErrors(); }}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="reg-password"
                        data-testid="input-reg-password"
                        type={showRegPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                        value={regPassword}
                        onChange={e => { setRegPassword(e.target.value); clearErrors(); }}
                        className="h-11 pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showRegPassword ? "Hide password" : "Show password"}
                      >
                        {showRegPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {errorMsg && (
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5 text-sm text-destructive">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

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

                  <Button data-testid="button-register" type="submit" className="w-full h-11" disabled={loading}>
                    {loading ? "Creating account…" : "Create Account"}
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("login")}>
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
