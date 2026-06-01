import { useState, useEffect } from "react";
import { ShieldAlert, X } from "lucide-react";

export type SecurityAlertType =
  | "token_forgery"
  | "rate_limited"
  | "account_locked"
  | "suspicious_login"
  | "validation_error";

interface SecurityAlertProps {
  type: SecurityAlertType;
  message: string;
  onDismiss?: () => void;
}

const ALERT_CONFIG: Record<SecurityAlertType, { label: string; color: string }> = {
  token_forgery:     { label: "Security Warning",    color: "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200" },
  rate_limited:      { label: "Too Many Attempts",   color: "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200" },
  account_locked:    { label: "Account Protected",   color: "border-red-500 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200" },
  suspicious_login:  { label: "Suspicious Activity", color: "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200" },
  validation_error:  { label: "Validation Error",    color: "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200" },
};

export function SecurityAlert({ type, message, onDismiss }: SecurityAlertProps) {
  const [visible, setVisible] = useState(true);
  const config = ALERT_CONFIG[type];

  if (!visible) return null;

  return (
    <div
      role="alert"
      data-testid={`alert-security-${type}`}
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${config.color}`}
    >
      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{config.label}</p>
        <p className="mt-0.5 text-xs opacity-90">{message}</p>
      </div>
      <button
        onClick={() => { setVisible(false); onDismiss?.(); }}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
        data-testid="button-dismiss-security-alert"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * useSecurityAlert — maps API error responses to SecurityAlertType.
 * Call this after any auth mutation to detect server-flagged security events.
 */
export function classifyError(err: Error | unknown): {
  type: SecurityAlertType;
  message: string;
} | null {
  if (!err) return null;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (msg.includes("timed out") || msg.includes("timeout")) {
    return {
      type: "validation_error",
      message: "The server is taking too long to respond. Please try again in a moment.",
    };
  }
  if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
    return {
      type: "rate_limited",
      message: "Too many attempts from your device. Please wait 15 minutes before trying again.",
    };
  }
  if (msg.includes("blocked") || msg.includes("banned") || msg.includes("suspicious")) {
    return {
      type: "suspicious_login",
      message: "Unusual activity was detected on this account. If this is you, please try again later.",
    };
  }
  if (msg.includes("token") || msg.includes("forged") || msg.includes("invalid session")) {
    return {
      type: "token_forgery",
      message: "An invalid session token was detected. Your IP address has been logged for security review.",
    };
  }
  if (msg.includes("locked")) {
    return {
      type: "account_locked",
      message: "This account has been temporarily locked due to too many failed login attempts.",
    };
  }
  return null;
}
