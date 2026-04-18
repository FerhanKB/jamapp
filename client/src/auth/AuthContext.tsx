import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "../api/client";

export interface User {
  user_id: string;
  username: string;
}

interface AuthResponse {
  token: string;
  user_id: string;
  username: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signup: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tok = getToken();
    if (!tok) {
      setLoading(false);
      return;
    }
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function signup(username: string, password: string) {
    const res = await api<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      auth: false,
    });
    setToken(res.token);
    setUser({ user_id: res.user_id, username: res.username });
  }

  async function login(username: string, password: string) {
    const res = await api<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
      auth: false,
    });
    setToken(res.token);
    setUser({ user_id: res.user_id, username: res.username });
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
