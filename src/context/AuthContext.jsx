import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dormitory_user"));
    } catch {
      return null;
    }
  });

  const clearSession = () => {
    localStorage.removeItem("dormitory_token");
    localStorage.removeItem("dormitory_user");
    setUser(null);
  };

  useEffect(() => {
    const onUnauthorized = () => clearSession();
    window.addEventListener("dormitory:unauthorized", onUnauthorized);
    return () => window.removeEventListener("dormitory:unauthorized", onUnauthorized);
  }, []);

  const value = useMemo(() => ({
    user,
    async login(username, password) {
      const data = await api("/auth/login/", { method: "POST", body: JSON.stringify({ username, password }) });
      localStorage.setItem("dormitory_token", data.token);
      localStorage.setItem("dormitory_user", JSON.stringify(data.user));
      setUser(data.user);
    },
    async logout() {
      try {
        await api("/auth/logout/", { method: "POST" });
      } finally {
        clearSession();
      }
    },
  }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
