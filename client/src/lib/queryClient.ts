import { QueryClient } from "@tanstack/react-query";
import { getSessionToken } from "./auth";

// On Vercel (and locally), the frontend and API are served from the same domain.
// All API calls use plain relative /api/ paths — no proxy URL needed.
const API_BASE = "";

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

  return fetch(`${API_BASE}${url}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
