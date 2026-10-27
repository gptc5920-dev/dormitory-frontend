import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [signInMessage, setSignInMessage] = useState("");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dormitory_user"));
    } catch {
      return null;
    }
  });

  const clearSession = useCallback(() => {
    localStorage.removeItem("dormitory_token");
    localStorage.removeItem("dormitory_user");
    setUser(null);
  }, []);

  const updateUser = useCallback((account) => {
    localStorage.setItem("dormitory_user", JSON.stringify(account));
    setUser(account);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => clearSession();
    window.addEventListener("dormitory:unauthorized", onUnauthorized);
    return () => window.removeEventListener("dormitory:unauthorized", onUnauthorized);
  }, [clearSession]);

  const value = useMemo(() => ({
    user,
    signInMessage,
    updateUser,
    async updateAccount(changes) {
      const account = await api("/auth/me/", { method: "PATCH", body: JSON.stringify(changes) });
      updateUser(account);
      return account;
    },
    async changePassword(passwords) {
      await api("/auth/change-password/", { method: "POST", body: JSON.stringify(passwords) });
      setSignInMessage("Password updated. Sign in with your new password.");
      clearSession();
    },
    async login(username, password) {
      const data = await api("/auth/login/", { method: "POST", body: JSON.stringify({ username, password }) });
      localStorage.setItem("dormitory_token", data.token);
      updateUser(data.user);
      setSignInMessage("");
    },
    async logout() {
      try {
        await api("/auth/logout/", { method: "POST" });
      } finally {
        clearSession();
      }
    },
  }), [user, signInMessage, clearSession, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
