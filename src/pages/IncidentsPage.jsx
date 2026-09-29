import { useCallback, useEffect, useState } from "react";
import { Check, Eye, Link2, Plus, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api, apiList, assetUrl, formatDate, rows } from "../api";
import { Empty, ErrorMessage, Loading, SuccessMessage } from "../components/Feedback";
import Modal from "../components/Modal";

const typeLabels = { person: "Person detected", bottle: "Bottle detected", possible_smoke: "Possible smoke", possible_fire: "Possible fire", manual: "Manual report", other: "Other" };

export default function IncidentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedIncident = searchParams.get("incident");
  const [items, setItems] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [filters, setFilters] = useState({ status: "", type: "" });
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [manual, setManual] = useState({ incident_type: "manual", details: "", room: "" });
  const [assign, setAssign] = useState({ tenant: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const [incidentData, tenantData, roomData] = await Promise.all([apiList(`/incidents/?${query}`), apiList("/tenants/?active=true&page_size=200"), apiList("/rooms/?active=true&page_size=200")]);
      setItems(rows(incidentData)); setTenants(rows(tenantData)); setRooms(rows(roomData));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = Number(linkedIncident);
    if (!linkedIncident || !Number.isSafeInteger(id) || id < 1) return undefined;
    let active = true;
    api(`/incidents/${id}/`).then((item) => {
      if (active) { setSelected(item); setModal("detail"); setError(""); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [linkedIncident]);

  async function action(item, name, payload = {}) {
    setError(""); setSuccess("");
    try {
      const updated = await api(`/incidents/${item.id}/${name}/`, { method: "POST", body: JSON.stringify(payload) });
      setSelected(updated); setSuccess(`${updated.reference} updated.`); await load();
    } catch (err) { setError(err.message); }
  }

  async function createManual(event) {
    event.preventDefault();
    try {
      await api("/incidents/", { method: "POST", body: JSON.stringify({ ...manual, room: manual.room ? Number(manual.room) : null }) });
      setModal(null); setManual({ incident_type: "manual", details: "", room: "" }); setSuccess("Manual incident recorded."); await load();
    } catch (err) { setError(err.message); }
  }

  async function assignTenant(event) {
    event.preventDefault();
    await action(selected, "assign", { tenant: Number(assign.tenant), notes: assign.notes });
    setModal("detail"); setAssign({ tenant: "", notes: "" });
  }

  function inspect(item) {
    if (linkedIncident) setSearchParams((current) => { const next = new URLSearchParams(current); next.delete("incident"); return next; }, { replace: true });
    setSelected(item); setModal("detail"); setError("");
  }

  function closeDetail() {
    setModal(null);
    if (linkedIncident) setSearchParams((current) => { const next = new URLSearchParams(current); next.delete("incident"); return next; }, { replace: true });
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Review queue</p><h1>Incidents</h1></div><button className="button primary" onClick={() => setModal("manual")}><Plus size={17} />Manual incident</button></header>
    <div className="toolbar filter-bar"><Search size={17} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="verified">Verified</option><option value="assigned">Assigned</option><option value="dismissed">Dismissed</option></select><select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All detection types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span>{items.length} incidents</span></div>
    <ErrorMessage message={!modal ? error : ""} /><SuccessMessage message={success} />
    {loading ? <Loading /> : items.length === 0 ? <Empty title="No incidents found" detail="The selected queue is clear." /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Reference</th><th>Incident</th><th>Source / room</th><th>Confidence</th><th>Occurred</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td className="mono">{item.reference}</td><td><strong>{typeLabels[item.incident_type]}</strong><small className="cell-detail">{item.details}</small></td><td>{item.room_number ? `Room ${item.room_number}` : item.source_display}</td><td>{item.confidence == null ? "-" : `${Math.round(item.confidence * 100)}%`}</td><td>{formatDate(item.occurred_at)}</td><td><span className={`status ${item.status}`}>{item.status}</span></td><td><button className="icon-button" title="Review incident" onClick={() => inspect(item)}><Eye size={17} /></button></td></tr>)}
    </tbody></table></div></section>}

    {modal === "manual" && <Modal title="Record manual incident" onClose={() => setModal(null)}><form className="form-grid" onSubmit={createManual}>
      <label>Incident type<select value={manual.incident_type} onChange={(e) => setManual({ ...manual, incident_type: e.target.value })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Room<select value={manual.room} onChange={(e) => setManual({ ...manual, room: e.target.value })}><option value="">No room</option>{rooms.map((room) => <option key={room.id} value={room.id}>Room {room.number}</option>)}</select></label>
      <label className="span-2">Details<textarea rows="5" value={manual.details} onChange={(e) => setManual({ ...manual, details: e.target.value })} required /></label><ErrorMessage message={error} />
      <div className="form-actions span-2"><button className="button subtle" type="button" onClick={() => setModal(null)}>Cancel</button><button className="button primary">Record incident</button></div>
    </form></Modal>}

    {modal === "detail" && selected && <Modal title={`Review ${selected.reference}`} onClose={closeDetail} wide>
      <div className="incident-detail">
        <div className="evidence-frame">{selected.snapshot ? <img src={assetUrl(selected.snapshot)} alt={`Evidence for ${selected.reference}`} /> : <div className="empty-image"><Eye size={24} /><span>No snapshot attached</span></div>}</div>
        <div className="detail-list"><div><span>Detection</span><strong>{typeLabels[selected.incident_type]}</strong></div><div><span>Status</span><strong><span className={`status ${selected.status}`}>{selected.status}</span></strong></div><div><span>Source</span><strong>{selected.source_display}</strong></div><div><span>Room</span><strong>{selected.room_number || "Not specified"}</strong></div><div><span>Occurred</span><strong>{formatDate(selected.occurred_at)}</strong></div><div><span>Assigned tenant</span><strong>{selected.assigned_tenant_name || "Not assigned"}</strong></div></div>
      </div>
      <div className="detail-notes"><strong>Incident details</strong><p>{selected.details || "No additional details."}</p>{selected.review_notes && <><strong>Review notes</strong><p>{selected.review_notes}</p></>}</div>
      <ErrorMessage message={error} />
      <div className="workflow-actions">
        {selected.status === "new" && <button className="button subtle" onClick={() => action(selected, "review", { notes: "Reviewed in incident queue." })}><Eye size={17} />Mark reviewed</button>}
        {["new", "reviewed"].includes(selected.status) && <button className="button success-button" onClick={() => action(selected, "verify", { notes: "Manager verified evidence." })}><Check size={17} />Verify incident</button>}
        {["new", "reviewed", "verified"].includes(selected.status) && <button className="button danger-button" onClick={() => action(selected, "dismiss", { notes: "Dismissed by manager." })}><X size={17} />Dismiss</button>}
        {selected.status === "verified" && <button className="button primary" onClick={() => setModal("assign")}><Link2 size={17} />Assign tenant</button>}
      </div>
    </Modal>}

    {modal === "assign" && selected && <Modal title={`Assign ${selected.reference}`} onClose={() => setModal("detail")}><form className="form-stack" onSubmit={assignTenant}><label>Tenant<select value={assign.tenant} onChange={(e) => setAssign({ ...assign, tenant: e.target.value })} required><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.reference} · {tenant.full_name} · Room {tenant.room_number}</option>)}</select></label><label>Assignment notes<textarea rows="3" value={assign.notes} onChange={(e) => setAssign({ ...assign, notes: e.target.value })} /></label><ErrorMessage message={error} /><div className="form-actions"><button type="button" className="button subtle" onClick={() => setModal("detail")}>Back</button><button className="button primary">Assign incident</button></div></form></Modal>}
  </div>;
}
