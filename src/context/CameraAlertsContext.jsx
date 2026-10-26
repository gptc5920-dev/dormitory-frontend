import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { API_BASE } from "../api";

const CameraAlertsContext = createContext(null);
const MAX_ALERTS = 50;

function readAlerts(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && typeof item.id === "string" && typeof item.title === "string"
      && typeof item.detail === "string" && typeof item.read === "boolean"
      && Number.isFinite(Date.parse(item.createdAt))).slice(0, MAX_ALERTS);
  } catch { return []; }
}

export function CameraAlertsProvider({ userKey, children }) {
  const storageKey = `dormitory_camera_alerts:${encodeURIComponent(API_BASE)}:${encodeURIComponent(userKey)}`;
  const [alerts, setAlerts] = useState(() => readAlerts(storageKey));
  const alertsRef = useRef(alerts);

  const saveAlerts = useCallback((next) => {
    alertsRef.current = next;
    setAlerts(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep alerts available in memory. */ }
  }, [storageKey]);

  const notify = useCallback((alert) => {
    const now = Date.now();
    // Keep the cooldown across page changes and reloads as well as live scans.
    if (alertsRef.current.some((item) => item.tag === alert.tag && now - Date.parse(item.createdAt) < 60_000)) return;
    const entry = { ...alert, id: crypto.randomUUID(), createdAt: new Date(now).toISOString(), read: false };
    saveAlerts([entry, ...alertsRef.current].slice(0, MAX_ALERTS));
    if (window.Notification?.permission === "granted") {
      try { new window.Notification(alert.title, { body: alert.detail, tag: alert.tag }); } catch { /* In-app warnings remain available. */ }
    }
  }, [saveAlerts]);

  const markRead = useCallback((id) => {
    saveAlerts(alertsRef.current.map((item) => item.id === id ? { ...item, read: true } : item));
  }, [saveAlerts]);
  const markAllRead = useCallback(() => {
    saveAlerts(alertsRef.current.map((item) => ({ ...item, read: true })));
  }, [saveAlerts]);

  const value = useMemo(() => ({ alerts, notify, markRead, markAllRead }), [alerts, notify, markRead, markAllRead]);
  return <CameraAlertsContext.Provider value={value}>{children}</CameraAlertsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCameraAlerts() {
  return useContext(CameraAlertsContext);
}
