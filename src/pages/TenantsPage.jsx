import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Edit3, Eye, Plus, Search, UserRound } from "lucide-react";
import { api, apiList, formatDate, rows } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";
import Modal from "../components/Modal";
import TenantFaceCapture from "../components/TenantFaceCapture";

const blank = { first_name: "", last_name: "", email: "", phone: "", emergency_contact: "", room: "", move_in_date: "", notes: "", is_active: true };

export default function TenantsPage() {
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [faceTenant, setFaceTenant] = useState(null);
  const [faceFile, setFaceFile] = useState(null);
  const [faceImage, setFaceImage] = useState("");
  const [faceRemoved, setFaceRemoved] = useState(false);
  const [faceCheck, setFaceCheck] = useState({ status: "idle", message: "" });
  const faceRequestRef = useRef(0);
  const faceCheckRef = useRef(0);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (term = search) => {
    setLoading(true);
    try {
      const [tenantData, roomData] = await Promise.all([apiList(`/tenants/?search=${encodeURIComponent(term)}`), apiList("/rooms/?active=true&page_size=200")]);
      setItems(rows(tenantData)); setRooms(rows(roomData));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function open(item = null) {
    const request = ++faceRequestRef.current;
    faceCheckRef.current += 1;
    setFaceTenant(null);
    setEditing(item);
    setFaceFile(null);
    setFaceImage("");
    setFaceRemoved(false);
    setFaceCheck({ status: "idle", message: "" });
    setForm(item ? {
      first_name: item.first_name, last_name: item.last_name, email: item.email, phone: item.phone,
      emergency_contact: item.emergency_contact, room: item.room, move_in_date: item.move_in_date || "",
      notes: item.notes, is_active: item.is_active,
    } : { ...blank });
    setError("");
    if (item?.has_face_photo) {
      api(`/tenants/${item.id}/face-photo/`).then((data) => {
        if (faceRequestRef.current === request) setFaceImage(data.image);
      }).catch((err) => { if (faceRequestRef.current === request) setError(err.message); });
    }
  }

  function closeForm() {
    faceRequestRef.current += 1;
    faceCheckRef.current += 1;
    setForm(null);
    setEditing(null);
  }

  function openFace(item) {
    const request = ++faceRequestRef.current;
    faceCheckRef.current += 1;
    setForm(null);
    setFaceTenant(item);
    setFaceFile(null);
    setFaceImage("");
    setFaceRemoved(false);
    setFaceCheck({ status: "idle", message: "" });
    setError("");
    if (item.has_face_photo) {
      api(`/tenants/${item.id}/face-photo/`).then((data) => {
        if (faceRequestRef.current === request) setFaceImage(data.image);
      }).catch((err) => { if (faceRequestRef.current === request) setError(err.message); });
    }
  }

  function closeFace() {
    faceRequestRef.current += 1;
    faceCheckRef.current += 1;
    setFaceTenant(null);
  }

  async function chooseFace(file) {
    faceRequestRef.current += 1;
    const request = ++faceCheckRef.current;
    setFaceFile(file);
    setFaceRemoved(false);
    setFaceCheck({ status: "checking", message: "Checking for one clear face..." });
    if (file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFaceCheck({ status: "error", message: "Choose a JPEG, PNG, or WebP face photo no larger than 8 MB." });
      return;
    }
    const body = new FormData();
    body.append("photo", file);
    try {
      await api("/tenants/check-face/", { method: "POST", body });
      if (faceCheckRef.current === request) setFaceCheck({ status: "valid", message: "One face detected. Ready to enroll." });
    } catch (err) {
      if (faceCheckRef.current === request) setFaceCheck({ status: "error", message: err.message });
    }
  }

  function removeFace() {
    faceRequestRef.current += 1;
    faceCheckRef.current += 1;
    setFaceFile(null);
    setFaceImage("");
    setFaceRemoved(true);
    setFaceCheck({ status: "idle", message: "" });
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    let detailsSaved = false;
    try {
      if (faceFile && faceCheck.status !== "valid") throw new Error(faceCheck.message || "Wait for the face check to finish.");
      const payload = { ...form, room: Number(form.room), move_in_date: form.move_in_date || null };
      const saved = await api(editing ? `/tenants/${editing.id}/` : "/tenants/", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      detailsSaved = true;
      setEditing(saved);
      if (faceFile) {
        const body = new FormData();
        body.append("photo", faceFile);
        await api(`/tenants/${saved.id}/face-photo/`, { method: "POST", body });
      } else if (faceRemoved && saved.has_face_photo) {
        await api(`/tenants/${saved.id}/face-photo/`, { method: "DELETE" });
      }
      closeForm(); await load();
    } catch (err) { setError(detailsSaved ? `Tenant details saved, but the face photo update failed: ${err.message}` : err.message); }
    finally { setSaving(false); }
  }

  async function saveFace(event) {
    event.preventDefault();
    if (saving || !faceTenant) return;
    if (faceFile && faceCheck.status !== "valid") { setError(faceCheck.message || "Wait for the face check to finish."); return; }
    setSaving(true);
    setError("");
    try {
      if (faceFile) {
        const body = new FormData();
        body.append("photo", faceFile);
        await api(`/tenants/${faceTenant.id}/face-photo/`, { method: "POST", body });
      } else if (faceRemoved && faceTenant.has_face_photo) {
        await api(`/tenants/${faceTenant.id}/face-photo/`, { method: "DELETE" });
      }
      closeFace();
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function showHistory(item) {
    setError("");
    try { setHistory(await api(`/tenants/${item.id}/history/`)); } catch (err) { setError(err.message); }
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Resident register</p><h1>Tenants</h1></div><button className="button primary" onClick={() => open()}><Plus size={17} />Enroll tenant</button></header>
    <div className="toolbar"><form className="search-box" onSubmit={(event) => { event.preventDefault(); load(); }}><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search tenants by name, reference, or email" placeholder="Search name, reference, or email" /><button className="button subtle small">Search</button></form><span>{items.length} tenants shown</span></div>
    <ErrorMessage message={!form ? error : ""} />
    {loading ? <Loading /> : items.length === 0 ? <Empty title="No tenants found" detail="Adjust the search or enroll a tenant." /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Reference</th><th>Room</th><th>Contact</th><th>Move in</th><th>Status</th><th>Face</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td><div className="person-cell"><span>{item.has_face_photo ? <Camera size={17} /> : <UserRound size={17} />}</span><strong>{item.full_name}</strong></div></td><td className="mono">{item.reference}</td><td>Room {item.room_number}</td><td>{item.email || item.phone || "-"}</td><td>{item.move_in_date ? formatDate(item.move_in_date, false) : "-"}</td><td><span className={`status ${item.is_active ? "verified" : "dismissed"}`}>{item.is_active ? "active" : "inactive"}</span></td><td>{item.has_face_photo ? "Enrolled" : "Not enrolled"}</td><td><div className="row-actions"><button className="icon-button" title={item.has_face_photo ? `Update face for ${item.full_name}` : `Enroll face for ${item.full_name}`} aria-label={item.has_face_photo ? `Update face for ${item.full_name}` : `Enroll face for ${item.full_name}`} onClick={() => openFace(item)}><Camera size={17} /></button><button className="icon-button" title="View history" onClick={() => showHistory(item)}><Eye size={17} /></button><button className="icon-button" title="Edit tenant" onClick={() => open(item)}><Edit3 size={17} /></button></div></td></tr>)}
    </tbody></table></div></section>}
    {form && <Modal title={editing ? `Edit ${editing.full_name}` : "Enroll tenant"} onClose={closeForm} wide>
      <form className="form-grid" onSubmit={save}>
        <label>First name<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></label>
        <label>Last name<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Room<select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} required><option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id} disabled={!editing && room.available_beds < 1}>Room {room.number} ({room.available_beds} available)</option>)}</select></label>
        <label>Move-in date<input type="date" value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></label>
        <label className="span-2">Emergency contact<input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></label>
        <label className="span-2">Notes<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <TenantFaceCapture file={faceFile} existingImage={faceRemoved ? "" : faceImage} hasExistingPhoto={Boolean(editing?.has_face_photo && !faceRemoved)} check={faceCheck} onChange={chooseFace} onRemove={removeFace} />
        <label className="check-field"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active tenant</label>
        <ErrorMessage message={error} />
        <div className="form-actions span-2"><button className="button subtle" type="button" onClick={closeForm}>Cancel</button><button className="button primary" disabled={saving || (faceFile && faceCheck.status !== "valid")}>{saving ? "Saving..." : "Save tenant"}</button></div>
      </form>
    </Modal>}
    {faceTenant && <Modal title={`${faceTenant.has_face_photo ? "Update" : "Enroll"} face: ${faceTenant.full_name}`} onClose={closeFace} wide>
      <form className="form-grid" onSubmit={saveFace}>
        <TenantFaceCapture file={faceFile} existingImage={faceRemoved ? "" : faceImage} hasExistingPhoto={Boolean(faceTenant.has_face_photo && !faceRemoved)} check={faceCheck} onChange={chooseFace} onRemove={removeFace} />
        <ErrorMessage message={error} />
        <div className="form-actions span-2"><button className="button subtle" type="button" onClick={closeFace}>Cancel</button><button className="button primary" disabled={saving || (!faceFile && !faceRemoved) || (faceFile && faceCheck.status !== "valid")}>{saving ? "Saving..." : "Save face"}</button></div>
      </form>
    </Modal>}
    {history && <Modal title={`${history.tenant.full_name} history`} onClose={() => setHistory(null)} wide>
      <div className="history-summary"><span className="mono">{history.tenant.reference}</span><span>Room {history.tenant.room_number}</span><span>{history.warnings.length} warnings</span><span>{history.violations.length} violations</span></div>
      <h3>Warnings</h3>{history.warnings.length ? <div className="record-list">{history.warnings.map((item) => <article key={item.id}><div><strong>{item.rule_code}: {item.rule_title}</strong><span>{item.reference} · {formatDate(item.issued_at)}</span></div><p>{item.message}</p></article>)}</div> : <Empty title="No warnings" />}
      <h3>Violations</h3>{history.violations.length ? <div className="record-list">{history.violations.map((item) => <article key={item.id}><div><strong>{item.rule_code}: {item.rule_title}</strong><span>{item.reference} · {formatDate(item.recorded_at)}</span></div><p>{item.description}</p></article>)}</div> : <Empty title="No violations" />}
    </Modal>}
  </div>;
}
