import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface AuthCtx {
  user: Omit<User, "passwordHash" | "rememberToken"> | null;
  loading: boolean;
  isGuest: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

const GUEST_USER_KEY = 'grid_surge_guest_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthCtx["user"]>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

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
        if (r.ok) {
          setUser(await r.json());
          setIsGuest(false);
        } else {
          // Check for guest mode
          const guestData = localStorage.getItem(GUEST_USER_KEY);
          if (guestData) {
            const guestUser = JSON.parse(guestData);
            setUser(guestUser);
            setIsGuest(true);
          } else {
            setUser(null);
          }
        }
      })
      .catch(() => {
        // Check for guest mode on error
        const guestData = localStorage.getItem(GUEST_USER_KEY);
        if (guestData) {
          const guestUser = JSON.parse(guestData);
          setUser(guestUser);
          setIsGuest(true);
        } else {
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, rememberMe: boolean) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password, rememberMe });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const d = await res.json();
    setUser(d.user);
    setIsGuest(false);
    // Clear guest data on login
    localStorage.removeItem(GUEST_USER_KEY);
    // Session cookie is set by the server automatically
  };

  const register = async (username: string, email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/register", { username, email, password });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const d = await res.json();
    setUser(d.user);
    setIsGuest(false);
    // Clear guest data on register
    localStorage.removeItem(GUEST_USER_KEY);
  };

  const logout = async () => {
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
    setUser(null);
    setIsGuest(false);
    localStorage.removeItem(GUEST_USER_KEY);
  };

  const continueAsGuest = () => {
    const guestUser = {
      id: 0,
      username: 'Guest',
      email: 'guest@gridsurge.com',
      credits:5000,
      winnings: 0,
      isGuest: true
    };
    localStorage.setItem(GUEST_USER_KEY, JSON.stringify(guestUser));
    setUser(guestUser);
    setIsGuest(true);
  };

  return <Ctx.Provider value={{ user, loading, isGuest, login, register, logout, continueAsGuest, refreshUser }}>{children}</Ctx.Provider>;
}
