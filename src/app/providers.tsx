"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@/types/auth";
import { ToastProvider } from "@/components/ui/toast";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type ProvidersProps = {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de Providers");
  }
  return context;
};

export default function Providers({ children, initialUser }: ProvidersProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(false);
  const idleTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (!response.ok) {
        setUser(null);
        return;
      }
      const data = await response.json();
      setUser(data?.user ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialUser === undefined) {
      refresh();
    }
  }, [initialUser, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { ok: false, error: data?.error ?? "No se pudo iniciar sesion" };
    }

    setUser(data?.user ?? null);
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }, []);

  useEffect(() => {
    if (!user) {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      return;
    }

    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

    const resetIdleTimer = () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
      idleTimeoutRef.current = setTimeout(() => {
        logout();
      }, IDLE_TIMEOUT_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "focus",
    ];

    resetIdleTimer();
    for (const event of events) {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, resetIdleTimer);
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    };
  }, [user, logout]);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      login,
      logout,
    }),
    [user, loading, refresh, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      <ToastProvider>{children}</ToastProvider>
    </AuthContext.Provider>
  );
}
