import { Search } from "lucide-react";
import ResetButton from "./ResetButton";
import "./filters.css";

export default function FilterBar({ label, value, onChange, onReset, fields = [], searchLabel, count }) {
  function change(key, next) {
    const updated = { ...value, [key]: next };
    if (next && key === "date_from" && updated.date_to && next > updated.date_to) updated.date_to = next;
    if (next && key === "date_to" && updated.date_from && next < updated.date_from) updated.date_from = next;
    onChange(updated);
  }
  return <div className="module-filters" role="search" aria-label={`${label} filters`}>
    {searchLabel && <label className="module-filter-search"><span>{searchLabel}</span><div><Search size={16} aria-hidden="true" /><input type="search" value={value.search || ""} placeholder="Search..." onChange={(event) => change("search", event.target.value)} /></div></label>}
    {fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.type === "date"
      ? <input type="date" value={value[field.key] || ""} min={field.key === "date_to" ? value.date_from || undefined : undefined} max={field.key === "date_from" ? value.date_to || undefined : undefined} onChange={(event) => change(field.key, event.target.value)} />
      : <select value={value[field.key] || ""} onChange={(event) => change(field.key, event.target.value)}><option value="">{field.all || "All"}</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</label>)}
    <ResetButton filters onClick={onReset} />
    {count != null && <span className="module-filter-count" aria-live="polite">{count} shown</span>}
  </div>;
}
