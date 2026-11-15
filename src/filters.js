export function matchesSearch(query, ...values) {
  const text = values.filter((value) => value != null).join(" ").toLocaleLowerCase();
  return String(query || "").trim().toLocaleLowerCase().split(/\s+/).every((word) => text.includes(word));
}

export function matchesValue(filter, value) {
  return !filter || String(value ?? "") === String(filter);
}

export function dateKey(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function inDateRange(value, from, to) {
  if (!from && !to) return true;
  const day = dateKey(value);
  return Boolean(day && (!from || day >= from) && (!to || day <= to));
}

export function optionsFor(items, value, label = value) {
  const options = new Map();
  for (const item of items) {
    const key = value(item);
    if (key != null && key !== "") options.set(String(key), String(label(item) ?? key));
  }
  return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export const activeOptions = [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }];
export const incidentStatuses = ["new", "reviewed", "verified", "assigned", "dismissed"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
export const incidentTypes = {
  person: "Person detected", bottle: "Bottle detected", possible_drinking: "Possible drinking gesture",
  possible_smoke: "Possible smoke", possible_fire: "Possible fire", manual: "Manual report", other: "Other",
};
export const incidentTypeOptions = Object.entries(incidentTypes).map(([value, label]) => ({ value, label }));

export function cameraMatches(source, filters, bindings) {
  const configured = source.source_type === "ip_camera" ? Boolean(source.has_stream_url) : source.source_type === "webcam" && Boolean(bindings[source.id]);
  return matchesSearch(filters.search, source.name, source.location, source.room_number)
    && matchesValue(filters.type, source.source_type)
    && matchesValue(filters.room, source.room ?? "none")
    && matchesValue(filters.active, source.is_enabled)
    && matchesValue(filters.configured, configured);
}

export function cameraFields(sources, includeEnabled = false) {
  return [
    { key: "type", label: "Camera type", all: "All types", options: [{ value: "webcam", label: "Browser webcam" }, { value: "ip_camera", label: "IP camera" }, ...(includeEnabled ? [{ value: "upload", label: "Uploaded video" }] : [])] },
    { key: "room", label: "Camera room", all: "All rooms", options: [{ value: "none", label: "Common area" }, ...optionsFor(sources, (item) => item.room, (item) => `Room ${item.room_number ?? item.room}`)] },
    { key: "configured", label: "Camera setup", all: "All setups", options: [{ value: "true", label: "Configured" }, { value: "false", label: "Setup needed" }] },
    ...(includeEnabled ? [{ key: "active", label: "Camera status", all: "All statuses", options: [{ value: "true", label: "Enabled" }, { value: "false", label: "Disabled" }] }] : []),
  ];
}
