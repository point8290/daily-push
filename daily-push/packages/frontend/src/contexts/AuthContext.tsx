import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User { id: string; email: string; name: string; }

interface AuthContextValue {
  user: User | null;
  token: string | null;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('dp_token');
    const u = localStorage.getItem('dp_user');
    if (t && u) {
      setToken(t);
      setUser(JSON.parse(u));
    }
    setLoading(false);
  }, []);

  const signIn = (t: string, u: User) => {
    localStorage.setItem('dp_token', t);
    localStorage.setItem('dp_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };

  const signOut = () => {
    localStorage.removeItem('dp_token');
    localStorage.removeItem('dp_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
