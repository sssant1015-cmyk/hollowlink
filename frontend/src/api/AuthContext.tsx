import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiClientError } from './client';
import type { FullUser, SessionUser } from '../types/api';

interface AuthState {
  user: FullUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: { username: string; email: string; password: string; displayName: string; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: FullUser) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
  setUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<FullUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: FullUser }>('/auth/me');
      setUserState(data.user);
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const data = await api.post<{ user: SessionUser }>('/auth/login', { identifier, password });
      await refresh();
      void data;
    },
    [refresh],
  );

  const register = useCallback(
    async (data: { username: string; email: string; password: string; displayName: string; inviteCode?: string }) => {
      await api.post('/auth/register', data);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // clearing local state regardless
    }
    setUserState(null);
  }, []);

  const setUser = useCallback((u: FullUser) => setUserState(u), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { ApiClientError };
