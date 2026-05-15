import { createContext, useContext, useMemo, useState } from 'react';
import { getAllowedKeywords, getUserProfile } from '../config/userAccess';

const SESSION_KEY = 'keydigest_current_user';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.username ? parsed : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);

  const login = async ({ username, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.details || '登录失败');
    }

    const profile = data.user || getUserProfile(username);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
    setUser(profile);
    return profile;
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const value = useMemo(() => {
    const username = user?.username;
    return {
      user,
      isAuthenticated: Boolean(user?.username),
      allowedKeywords: username ? getAllowedKeywords(username) : [],
      login,
      logout,
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
