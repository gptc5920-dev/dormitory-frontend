import { useCallback, useEffect, useState } from "react";
import { Edit3, Plus } from "lucide-react";
import { api, apiList, rows } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";
import Modal from "../components/Modal";

const blank = { code: "", title: "", category: "Conduct", description: "", severity: "medium", is_active: true };

export default function RulesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setItems(rows(await apiList("/rules/"))); } catch (err) { setError(err.message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  function open(item = null) { setEditing(item); setForm(item ? { code: item.code, title: item.title, category: item.category, description: item.description, severity: item.severity, is_active: item.is_active } : blank); setError(""); }
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try { await api(editing ? `/rules/${editing.id}/` : "/rules/", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) }); setForm(null); setEditing(null); await load(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Policy register</p><h1>Dormitory rules</h1></div><button className="button primary" onClick={() => open()}><Plus size={17} />Add rule</button></header>
    <ErrorMessage message={!form ? error : ""} />
    {loading ? <Loading /> : items.length === 0 ? <Empty title="No rules configured" /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Code</th><th>Rule</th><th>Category</th><th>Severity</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td className="mono">{item.code}</td><td><strong>{item.title}</strong><small className="cell-detail">{item.description}</small></td><td>{item.category}</td><td><span className={`severity ${item.severity}`}>{item.severity}</span></td><td><span className={`status ${item.is_active ? "verified" : "dismissed"}`}>{item.is_active ? "active" : "inactive"}</span></td><td><button className="icon-button" title="Edit rule" onClick={() => open(item)}><Edit3 size={17} /></button></td></tr>)}
    </tbody></table></div></section>}
    {form && <Modal title={editing ? `Edit ${editing.code}` : "Add dormitory rule"} onClose={() => { setForm(null); setEditing(null); }}>
      <form className="form-grid" onSubmit={save}>
        <label>Rule code<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="DR-005" required /></label>
        <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
        <label className="span-2">Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>Severity<select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label className="check-field"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active rule</label>
        <label className="span-2">Description<textarea rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label>
        <ErrorMessage message={error} />
        <div className="form-actions span-2"><button type="button" className="button subtle" onClick={() => setForm(null)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save rule"}</button></div>
      </form>
    </Modal>}
  </div>;
}
