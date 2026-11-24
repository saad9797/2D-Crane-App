import { DEMO_USER } from '@crane/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, setAuthFailureHandler, tokenStore, type Session, type User } from '../api/client';

type Status = 'loading' | 'authed' | 'anon';

interface AuthValue {
  user: User | null;
  status: Status;
  /** Set when a session ended on its own (expiry), so the login page can explain. */
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  demo: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(() => (tokenStore.get() ? 'loading' : 'anon'));
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);

  const accept = useCallback((s: Session) => {
    tokenStore.set(s.token);
    setNotice(null);
    setUser(s.user);
    setStatus('authed');
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anon');
  }, []);

  useEffect(() => {
    setAuthFailureHandler((code) => {
      tokenStore.clear();
      setUser(null);
      setStatus('anon');
      setNotice(code === 'token_expired' ? 'Your session expired. Please sign in again.' : 'Please sign in again.');
    });
  }, []);

  // Restore the session once: validate the stored token with /auth/me.
  useEffect(() => {
    if (started.current || !tokenStore.get()) return;
    started.current = true;
    api
      .me()
      .then(({ user: u }) => {
        setUser({ id: u.id, email: u.email, displayName: null });
        setStatus('authed');
      })
      .catch(() => {
        tokenStore.clear();
        setStatus('anon');
      });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      status,
      notice,
      login: async (email, password) => accept(await api.login(email, password)),
      register: async (email, password, displayName) => accept(await api.register(email, password, displayName)),
      demo: async () => accept(await api.login(DEMO_USER.email, DEMO_USER.password)),
      logout,
    }),
    [user, status, notice, accept, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
