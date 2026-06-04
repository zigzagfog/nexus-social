import { QueryClient } from "@tanstack/react-query";
import { getSessionToken } from "./auth";

// On Render, frontend and backend are on the same server.
// If served via custom domain (nexus.jmfcool.org), point API calls directly to Render.
const API_BASE = window.location.hostname === 'nexus.jmfcool.org'
  ? 'https://nexus-social-1hbh.onrender.com'
  : '';

// 20-second timeout on all API requests — prevents the loading screen from
// hanging forever if Vercel's function doesn't respond.
const API_TIMEOUT_MS = 20_000;

export async function apiRequest(
  method: string,
  url: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  // Send in-memory token as Bearer when available.
  const token = getSessionToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error("Request timed out — server is not responding. Please try again.");
    }
    throw err;
  }
}

async function defaultQueryFn({ queryKey }: { queryKey: readonly unknown[] }) {
  const [url, ...params] = queryKey as string[];
  let fullUrl = url;
  if (params.length > 0 && typeof params[0] === "string") {
    fullUrl = `${url}/${params[0]}`;
  }
  const res = await apiRequest("GET", fullUrl);
  // Read body once as text — prevents "body stream already read" errors
  const text = await res.text();
  if (!res.ok) {
    if (text.trimStart().startsWith("<")) {
      throw new Error("Server error — please try again.");
    }
    try { throw new Error(JSON.parse(text).error || res.statusText); }
    catch { throw new Error(text || res.statusText); }
  }
  if (text.trimStart().startsWith("<")) {
    throw new Error("Server error — please try again.");
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 30_000,
      retry: false,
    },
  },
});
