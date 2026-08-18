import React, { createContext, useContext, useState, useCallback } from "react";
import { getToken, setToken, clearToken } from "@/api/http";
import { authApi, type AuthResponse } from "@/api/auth-endpoints";

interface AuthState {
  user: AuthResponse["user"] | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerFirst: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthResponse["user"] | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      setToken(res.accessToken);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const registerFirst = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await authApi.registerFirst(email, password);
      setToken(res.accessToken);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        isAuthenticated: !!getToken(),
        loading,
        login,
        registerFirst,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
