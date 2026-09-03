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
  /** OWNER or ADMIN — sees administration. */
  isAdmin: boolean;
  /** Everyone but VIEWER — may create, edit and delete. */
  canEdit: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (organizationName: string, name: string, email: string, password: string) => Promise<void>;
  /** Swap the stored token (after a password change the old one is void). */
  replaceToken: (token: string) => void;
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
      .catch((err) => {
        // Only a rejected token means "signed out"; a network blip during a
        // deploy must not throw the user back to the login screen.
        if (err?.response?.status === 401) localStorage.removeItem("token");
      })
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

  function replaceToken(token: string) {
    localStorage.setItem("token", token);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    setOrganization(null);
  }

  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";
  const canEdit = Boolean(user) && user?.role !== "VIEWER";

  return (
    <AuthContext.Provider value={{ user, organization, loading, isAdmin, canEdit, login, register, replaceToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
