import { RotateCcw } from "lucide-react";

export default function ResetButton({ onClick, disabled = false, filters = false }) {
  return <button type="button" className="button subtle" onClick={onClick} disabled={disabled}>
    <RotateCcw size={16} aria-hidden="true" />{filters ? "Reset filters" : "Reset"}
  </button>;
}
