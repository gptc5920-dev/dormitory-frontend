export const API_BASE = (import.meta.env?.VITE_API_URL || "/api").replace(/\/$/, "");

const inFlightGets = new Map();

function errorMessages(value, field = "") {
  if (Array.isArray(value)) return value.flatMap((item) => errorMessages(item, field));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      errorMessages(item, key === "non_field_errors" ? field : field ? `${field}.${key}` : key));
  }
  return [`${field ? `${field}: ` : ""}${String(value)}`];
}

function describeError(body, fallback) {
  if (!body) return fallback;
  if (typeof body === "string") return body;
  if (body.detail) return body.detail;
  return errorMessages(body).join(" ");
}

async function request(path, options) {
  const token = localStorage.getItem("dormitory_token");
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Token ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The request was cancelled.");
    throw new Error("Unable to reach the server. Check that the backend is running and try again.");
  }
  const text = response.status === 204 ? "" : await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("dormitory:unauthorized"));
    throw new Error(describeError(body, `Request failed (${response.status})`));
  }
  return body;
}

export function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" || options.signal) return request(path, options);

  const token = localStorage.getItem("dormitory_token") || "anonymous";
  const key = `${token}:${path}`;
  if (inFlightGets.has(key)) return inFlightGets.get(key);
  const pending = request(path, options).finally(() => {
    if (inFlightGets.get(key) === pending) inFlightGets.delete(key);
  });
  inFlightGets.set(key, pending);
  return pending;
}

export function rows(payload) {
  return payload?.results || payload || [];
}

export async function apiList(path) {
  const result = [];
  const visited = new Set();
  while (path) {
    if (visited.has(path)) throw new Error("The server returned a repeated pagination link.");
    visited.add(path);
    const payload = await api(path);
    result.push(...rows(payload));
    if (!payload?.next) break;
    const base = new URL(`${API_BASE}/`, window.location.origin);
    const next = new URL(payload.next, new URL(`${API_BASE}${path}`, window.location.origin));
    if (next.origin !== base.origin || !next.pathname.startsWith(base.pathname)) {
      throw new Error("The server returned an invalid pagination link.");
    }
    path = `${next.pathname.slice(base.pathname.length - 1)}${next.search}`;
  }
  return result;
}

export function formatDate(value, withTime = true) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const options = withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" };
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function assetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//.test(value)) return value;
  return `${API_BASE.replace(/\/api$/, "")}${value}`;
}
