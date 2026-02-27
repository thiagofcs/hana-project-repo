'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { API_BASE } from '@/lib/config';

export interface AuthSession {
  token: string;
  user:  string;
  host:  string;
  port:  string;
}

interface AuthContextValue {
  session:  AuthSession | null;
  isLoaded: boolean;
  login:    (info: AuthSession) => void;
  logout:   () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session:  null,
  isLoaded: false,
  login:    () => {},
  logout:   () => {},
});

function clearAuthStorage(): void {
  localStorage.removeItem('hana_session');
  document.cookie = 'hana_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,  setSession]  = useState<AuthSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('hana_session');
    if (!stored) {
      setIsLoaded(true);
      return;
    }

    let parsed: AuthSession | null = null;
    try {
      parsed = JSON.parse(stored);
    } catch {
      localStorage.removeItem('hana_session');
      setIsLoaded(true);
      return;
    }

    if (!parsed?.token) {
      setIsLoaded(true);
      return;
    }

    // Verify the token is still valid on the server (e.g. after a backend restart)
    fetch(`${API_BASE}/auth/me`, {
      headers: { 'x-session-token': parsed.token },
    })
      .then(res => {
        if (res.ok) {
          setSession(parsed);
        } else {
          clearAuthStorage();
        }
      })
      .catch(() => {
        // Network error — keep session rather than forcing re-login
        setSession(parsed);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  const login = (info: AuthSession) => {
    localStorage.setItem('hana_session', JSON.stringify(info));
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `hana_token=${info.token}; path=/; SameSite=Lax${secure}`;
    setSession(info);
  };

  const logout = () => {
    clearAuthStorage();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, isLoaded, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
