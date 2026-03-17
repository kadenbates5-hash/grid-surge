import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface AuthCtx {
  user: Omit<User, "passwordHash" | "rememberToken"> | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthCtx["user"]>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      if (res.ok) setUser(await res.json());
      else setUser(null);
    } catch { setUser(null); }
  }, []);

  // On mount: try to restore session from cookie (no token storage needed)
  useEffect(() => {
    apiRequest("GET", "/api/auth/me")
      .then(async r => {
        if (r.ok) setUser(await r.json());
        else setUser(null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password, rememberMe });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const d = await res.json();
    setUser(d.user);
    // Session cookie is set by the server automatically
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { username, email, password });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const d = await res.json();
    setUser(d.user);
  };

  const logout = async () => {
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</Ctx.Provider>;
}
