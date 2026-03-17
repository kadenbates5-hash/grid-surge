import { QueryClient } from "@tanstack/react-query";

// Detect if we're deployed behind the port proxy
const BASE = typeof window !== "undefined" && (window as any).__PORT_5000__
  ? (window as any).__PORT_5000__
  : "";

export async function apiRequest(method: string, path: string, body?: unknown) {
  const url = BASE + path;
  const res = await fetch(url, {
    method,
    credentials: "include",  // always send session cookies
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function defaultQueryFn({ queryKey }: { queryKey: readonly unknown[] }) {
  const path = queryKey[0] as string;
  const res = await apiRequest("GET", path);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 30000,
      retry: false,
    },
  },
});
