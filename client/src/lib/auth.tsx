import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiRequest, queryClient } from "./queryClient";

interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  location: string;
  website: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (data: Partial<AuthUser>) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// In-memory session token — works across cross-origin proxy deployments
// where httpOnly cookies are stripped by the browser.
let _sessionToken: string | null = null;
export function getSessionToken() { return _sessionToken; }

// Safe JSON parse — if the server returns HTML (proxy error page, expired session),
// this throws a clean human-readable error instead of "Unexpected token '<'".
function parseJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Detect HTML proxy error page
    if (text.trimStart().startsWith("<")) {
      throw new Error("Server error — please try again.");
    }
    throw new Error("Unexpected response from server. Please try again.");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 5-second timeout — if the API never responds (Vercel cold start hang),
    // we still show the app instead of spinning forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const meBase = window.location.hostname === 'nexus.jmfcool.org' ? 'https://nexus-social-1hbh.onrender.com' : '';
    fetch(`${meBase}/api/auth/me`, {
      headers: _sessionToken ? { Authorization: `Bearer ${_sessionToken}` } : {},
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const data = parseJSON(await res.text());
          if (data._token) _sessionToken = data._token;
          const { _token: _t, ...safeUser } = data;
          setUser(safeUser);
        }
      })
      .catch(() => {
        // Timeout or network error — just show the app unauthenticated
      })
      .finally(() => {
        clearTimeout(timer);
        setIsLoading(false);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = parseJSON(await res.text());
    if (!res.ok) throw new Error(data.error || "Login failed");
    _sessionToken = data.token ?? null;
    setUser(data.user);
  };

  const register = async (
    username: string,
    displayName: string,
    email: string,
    password: string,
  ) => {
    const res = await apiRequest("POST", "/api/auth/register", {
      username,
      displayName,
      email,
      password,
    });
    const data = parseJSON(await res.text());
    if (!res.ok) throw new Error(data.error || "Registration failed");
    _sessionToken = data.token ?? null;
    setUser(data.user);
  };

  const logout = () => {
    _sessionToken = null;
    apiRequest("POST", "/api/auth/logout").catch(() => {});
    setUser(null);
    queryClient.clear();
  };

  const updateUser = (data: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...data } : null));
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
