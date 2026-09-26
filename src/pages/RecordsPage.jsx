import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, BellRing, FilePlus2, Plus } from "lucide-react";
import { api, apiList, assetUrl, formatDate, rows } from "../api";
import { Empty, ErrorMessage, Loading, SuccessMessage } from "../components/Feedback";
import Modal from "../components/Modal";

const blankWarning = { tenant: "", rule: "", incident: "", message: "" };
const blankViolation = { tenant: "", rule: "", incident: "", description: "", action_taken: "", evidence: null };

export default function RecordsPage() {
  const [tab, setTab] = useState("warnings");
  const [warnings, setWarnings] = useState([]);
  const [violations, setViolations] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [rules, setRules] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [modal, setModal] = useState(null);
  const [warningForm, setWarningForm] = useState(blankWarning);
  const [violationForm, setViolationForm] = useState(blankViolation);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const [warningData, violationData, tenantData, ruleData, incidentData] = await Promise.all([
        apiList("/warnings/?page_size=200"), apiList("/violations/?page_size=200"), apiList("/tenants/?active=true&page_size=200"), apiList("/rules/?active=true&page_size=200"), apiList("/incidents/?status=assigned&page_size=200"),
      ]);
      setWarnings(rows(warningData)); setViolations(rows(violationData)); setTenants(rows(tenantData)); setRules(rows(ruleData)); setIncidents(rows(incidentData));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function chooseIncident(form, setter, incidentId) {
    const incident = incidents.find((item) => item.id === Number(incidentId));
    setter({ ...form, incident: incidentId, tenant: incident?.assigned_tenant || form.tenant });
  }

  async function createWarning(event) {
    event.preventDefault(); setError("");
    try {
      const payload = { ...warningForm, tenant: Number(warningForm.tenant), rule: Number(warningForm.rule), incident: warningForm.incident ? Number(warningForm.incident) : null };
      await api("/warnings/", { method: "POST", body: JSON.stringify(payload) });
      setWarningForm(blankWarning); setModal(null); setSuccess("Warning issued with a rule reference."); await load();
    } catch (err) { setError(err.message); }
  }

  async function createViolation(event) {
    event.preventDefault(); setError("");
    const body = new FormData();
    body.append("tenant", violationForm.tenant); body.append("rule", violationForm.rule);
    if (violationForm.incident) body.append("incident", violationForm.incident);
    body.append("description", violationForm.description); body.append("action_taken", violationForm.action_taken);
    if (violationForm.evidence) body.append("evidence", violationForm.evidence);
    try {
      await api("/violations/", { method: "POST", body });
      setViolationForm(blankViolation); setModal(null); setSuccess("Violation and evidence recorded."); await load();
    } catch (err) { setError(err.message); }
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Disciplinary register</p><h1>Warnings & violations</h1></div><button className="button primary" onClick={() => setModal(tab === "warnings" ? "warning" : "violation")}><Plus size={17} />{tab === "warnings" ? "Issue warning" : "Record violation"}</button></header>
    <div className="segmented"><button className={tab === "warnings" ? "active" : ""} onClick={() => setTab("warnings")}><BellRing size={17} />Warnings <span>{warnings.length}</span></button><button className={tab === "violations" ? "active" : ""} onClick={() => setTab("violations")}><AlertOctagon size={17} />Violations <span>{violations.length}</span></button></div>
    <ErrorMessage message={!modal ? error : ""} /><SuccessMessage message={success} />
    {loading ? <Loading /> : tab === "warnings" ? (warnings.length === 0 ? <Empty title="No warnings issued" /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Reference</th><th>Tenant</th><th>Rule</th><th>Message</th><th>Issued</th><th>Status</th></tr></thead><tbody>
      {warnings.map((item) => <tr key={item.id}><td className="mono">{item.reference}</td><td><strong>{item.tenant_name}</strong><small className="cell-detail">{item.tenant_reference}</small></td><td><span className="mono">{item.rule_code}</span><small className="cell-detail">{item.rule_title}</small></td><td>{item.message}</td><td>{formatDate(item.issued_at)}</td><td><span className={`status ${item.acknowledged ? "verified" : "reviewed"}`}>{item.acknowledged ? "acknowledged" : "issued"}</span></td></tr>)}
    </tbody></table></div></section>) : (violations.length === 0 ? <Empty title="No violations recorded" /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Reference</th><th>Tenant</th><th>Rule</th><th>Description</th><th>Action</th><th>Evidence</th><th>Recorded</th></tr></thead><tbody>
      {violations.map((item) => <tr key={item.id}><td className="mono">{item.reference}</td><td><strong>{item.tenant_name}</strong><small className="cell-detail">{item.tenant_reference}</small></td><td><span className="mono">{item.rule_code}</span><small className="cell-detail">{item.rule_title}</small></td><td>{item.description}</td><td>{item.action_taken || "-"}</td><td>{item.evidence ? <a className="evidence-link" href={assetUrl(item.evidence)} target="_blank" rel="noreferrer"><FilePlus2 size={16} />View</a> : "-"}</td><td>{formatDate(item.recorded_at)}</td></tr>)}
    </tbody></table></div></section>)}

    {modal === "warning" && <Modal title="Issue warning" onClose={() => setModal(null)}><form className="form-stack" onSubmit={createWarning}>
      <label>Verified incident (optional)<select value={warningForm.incident} onChange={(e) => chooseIncident(warningForm, setWarningForm, e.target.value)}><option value="">No linked incident</option>{incidents.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.assigned_tenant_name}</option>)}</select></label>
      <label>Tenant<select value={warningForm.tenant} onChange={(e) => setWarningForm({ ...warningForm, tenant: e.target.value })} required><option value="">Select tenant</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.full_name}</option>)}</select></label>
      <label>Dormitory rule<select value={warningForm.rule} onChange={(e) => setWarningForm({ ...warningForm, rule: e.target.value })} required><option value="">Select rule</option>{rules.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
      <label>Warning message<textarea rows="4" value={warningForm.message} onChange={(e) => setWarningForm({ ...warningForm, message: e.target.value })} required /></label><ErrorMessage message={error} /><div className="form-actions"><button type="button" className="button subtle" onClick={() => setModal(null)}>Cancel</button><button className="button primary">Issue warning</button></div>
    </form></Modal>}

    {modal === "violation" && <Modal title="Record violation" onClose={() => setModal(null)}><form className="form-stack" onSubmit={createViolation}>
      <label>Verified incident (optional)<select value={violationForm.incident} onChange={(e) => chooseIncident(violationForm, setViolationForm, e.target.value)}><option value="">No linked incident</option>{incidents.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.assigned_tenant_name}</option>)}</select></label>
      <label>Tenant<select value={violationForm.tenant} onChange={(e) => setViolationForm({ ...violationForm, tenant: e.target.value })} required><option value="">Select tenant</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.full_name}</option>)}</select></label>
      <label>Dormitory rule<select value={violationForm.rule} onChange={(e) => setViolationForm({ ...violationForm, rule: e.target.value })} required><option value="">Select rule</option>{rules.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
      <label>Description<textarea rows="4" value={violationForm.description} onChange={(e) => setViolationForm({ ...violationForm, description: e.target.value })} required /></label>
      <label>Action taken<input value={violationForm.action_taken} onChange={(e) => setViolationForm({ ...violationForm, action_taken: e.target.value })} /></label>
      <label>Evidence image<input type="file" accept="image/*" onChange={(e) => setViolationForm({ ...violationForm, evidence: e.target.files[0] || null })} /></label><ErrorMessage message={error} /><div className="form-actions"><button type="button" className="button subtle" onClick={() => setModal(null)}>Cancel</button><button className="button primary">Record violation</button></div>
    </form></Modal>}
  </div>;
}
