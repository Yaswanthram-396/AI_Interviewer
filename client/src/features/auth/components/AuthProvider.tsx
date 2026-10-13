"use client";

import { createContext, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { authSession } from "../services/authSession.instance";
import type { AuthState, AuthUser, LoginInput, RegisterInput } from "../types/auth.types";

export interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const SERVER_STATE: AuthState = { status: "loading", user: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(authSession.subscribe, authSession.getState, () => SERVER_STATE);

  // Silent sign-in from the refresh cookie.
  useEffect(() => {
    void authSession.restore();
  }, []);

  const login = useCallback((input: LoginInput) => authSession.login(input), []);
  const register = useCallback((input: RegisterInput) => authSession.register(input), []);
  const logout = useCallback(() => authSession.logout(), []);

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
