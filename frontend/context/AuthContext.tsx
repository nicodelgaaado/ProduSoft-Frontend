'use client';

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { WorkflowApi } from '@/lib/api';
import type { AuthRole, AuthUser } from '@/types/api';

type StoredSession = AuthUser & { token: string };

type AccountSummary = AuthUser & { isActive: boolean };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  sessions: AccountSummary[];
  login: (username: string, password: string) => Promise<AuthUser>;
  signUp: (payload: { username: string; password: string; role: AuthRole }) => Promise<AuthUser>;
  switchAccount: (username: string) => AuthUser | null;
  logout: (username?: string) => AuthUser | null;
  logoutAll: () => void;
  clearError: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const storageKey = 'produSoft:auth-sessions';

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // ensure old persisted sessions are cleared so the app always starts signed out
      window.localStorage.removeItem(storageKey);
    }
    setLoading(false);
  }, [storageKey]);

  useEffect(() => {
    if (sessions.length === 0) {
      return;
    }
    if (activeUsername && sessions.some((session) => session.username === activeUsername)) {
      return;
    }
    setActiveUsername(sessions[0]?.username ?? null);
  }, [sessions, activeUsername]);

  const persistLogin = useCallback((profile: AuthUser, token: string) => {
    setSessions((prev) => {
      const filtered = prev.filter((session) => session.username !== profile.username);
      return [{ ...profile, token }, ...filtered];
    });
    setActiveUsername(profile.username);
    return profile;
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    const encoded = typeof window === 'undefined' ? '' : btoa(`${username}:${password}`);
    try {
      const profile = await WorkflowApi.me(encoded);
      return persistLogin(profile, encoded);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [persistLogin]);

  const signUp = useCallback(
    async ({ username, password, role }: { username: string; password: string; role: AuthRole }) => {
      setLoading(true);
      setError(null);
      const trimmedUsername = username.trim();
      const normalizedRole = role === 'SUPERVISOR' ? 'SUPERVISOR' : 'OPERATOR';
      const encoded = typeof window === 'undefined' ? '' : btoa(`${trimmedUsername}:${password}`);
      try {
        await WorkflowApi.signUp({ username: trimmedUsername, password, role: normalizedRole });
        const profile = await WorkflowApi.me(encoded);
        return persistLogin(profile, encoded);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sign-up failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [persistLogin],
  );

  const switchAccount = useCallback(
    (username: string) => {
      const target = sessions.find((session) => session.username === username);
      if (!target) {
        const current = sessions.find((session) => session.username === activeUsername) ?? null;
        return current ? { username: current.username, roles: current.roles } : null;
      }
      const others = sessions.filter((session) => session.username !== username);
      const updated = [target, ...others];
      setSessions(updated);
      setActiveUsername(target.username);
      return { username: target.username, roles: target.roles };
    },
    [sessions, activeUsername],
  );

  const logout = useCallback(
    (username?: string) => {
      const targetUsername = username ?? activeUsername;
      if (!targetUsername) {
        const current = sessions.find((session) => session.username === activeUsername) ?? null;
        return current ? { username: current.username, roles: current.roles } : null;
      }
      const filtered = sessions.filter((session) => session.username !== targetUsername);
      if (filtered.length === sessions.length) {
        const current = sessions.find((session) => session.username === activeUsername) ?? null;
        return current ? { username: current.username, roles: current.roles } : null;
      }
      setSessions(filtered);
      const nextActive = targetUsername === activeUsername ? filtered[0] ?? null : sessions.find((session) => session.username === activeUsername) ?? null;
      setActiveUsername(nextActive ? nextActive.username : null);
      setError(null);
      return nextActive ? { username: nextActive.username, roles: nextActive.roles } : null;
    },
    [sessions, activeUsername],
  );

  const logoutAll = useCallback(() => {
    setSessions([]);
    setActiveUsername(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const activeSession = useMemo(() => {
    if (!activeUsername) {
      return null;
    }
    return sessions.find((session) => session.username === activeUsername) ?? null;
  }, [sessions, activeUsername]);

  const user = useMemo<AuthUser | null>(() => {
    if (!activeSession) {
      return null;
    }
    return { username: activeSession.username, roles: activeSession.roles };
  }, [activeSession]);

  const token = activeSession?.token ?? null;

  const sessionSummaries = useMemo<AccountSummary[]>(
    () =>
      sessions.map((session) => ({
        username: session.username,
        roles: session.roles,
        isActive: session.username === activeUsername,
      })),
    [sessions, activeUsername],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      error,
      sessions: sessionSummaries,
      login,
      signUp,
      switchAccount,
      logout,
      logoutAll,
      clearError,
    }),
    [user, token, loading, error, sessionSummaries, login, signUp, switchAccount, logout, logoutAll, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

