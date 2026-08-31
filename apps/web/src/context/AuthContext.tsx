import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";
import { User } from "../api/types";

interface Organization {
  id: string;
  name: string;
  currency?: string;
}

interface AuthContextValue {
  user: User | null;
  organization: Organization | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (organizationName: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
        setOrganization(res.data.organization);
      })
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    setOrganization(res.data.organization);
  }

  async function register(organizationName: string, name: string, email: string, password: string) {
    const res = await api.post("/auth/register", { organizationName, name, email, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    setOrganization(res.data.organization);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setOrganization(null);
  }

  return (
    <AuthContext.Provider value={{ user, organization, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
