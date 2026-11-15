import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Edit3, Eye, Plus, UserRound } from "lucide-react";
import { api, apiList, formatDate, rows } from "../api";
import { Empty, ErrorMessage, Loading, SuccessMessage } from "../components/Feedback";
import Modal from "../components/Modal";
import TenantFaceCapture from "../components/TenantFaceCapture";
import ResetButton from "../components/ResetButton";
import FilterBar from "../components/FilterBar";
import { activeOptions, inDateRange, matchesSearch, matchesValue, optionsFor } from "../filters";

const blank = { first_name: "", last_name: "", email: "", phone: "", emergency_contact: "", room: "", move_in_date: "", notes: "", is_active: true };

export default function TenantsPage() {
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [filters, setFilters] = useState({});
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [faceTenant, setFaceTenant] = useState(null);
  const [facePhotos, setFacePhotos] = useState([]);
  const facePhotosRef = useRef([]);
  const [faceChanged, setFaceChanged] = useState(false);
  const [faceReady, setFaceReady] = useState(true);
  const faceRequestRef = useRef(0);
  const faceCheckRef = useRef(0);
  const loadRequestRef = useRef(0);
  const [faceCaptureKey, setFaceCaptureKey] = useState(0);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const request = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const [tenantData, roomData] = await Promise.all([apiList("/tenants/?page_size=200"), apiList("/rooms/?active=true&page_size=200")]);
      if (request === loadRequestRef.current) { setItems(rows(tenantData)); setRooms(rows(roomData)); }
    } catch (err) { if (request === loadRequestRef.current) setError(err.message); } finally { if (request === loadRequestRef.current) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function updatePhotos(photos) {
    facePhotosRef.current = photos;
    setFacePhotos(photos);
  }

  function loadPhotos(item, request) {
    updatePhotos([]);
    setFaceChanged(false);
    setFaceReady(!item?.has_face_photo);
    if (!item?.has_face_photo) return;
    api(`/tenants/${item.id}/face-photo/`).then((data) => {
      if (faceRequestRef.current !== request) return;
      updatePhotos((data.images || [{ id: 0, image: data.image }]).map((photo) => ({ ...photo, key: `saved-${photo.id}`, status: "valid" })));
      setFaceReady(true);
    }).catch((err) => { if (faceRequestRef.current === request) setError(`Unable to load saved face photos: ${err.message}`); });
  }

  function open(item = null) {
    setFaceCaptureKey((current) => current + 1);
    const request = ++faceRequestRef.current;
    faceCheckRef.current += 1;
    setFaceTenant(null);
    setEditing(item);
    loadPhotos(item, request);
    setForm(item ? {
      first_name: item.first_name, last_name: item.last_name, email: item.email, phone: item.phone,
      emergency_contact: item.emergency_contact, room: item.room, move_in_date: item.move_in_date || "",
      notes: item.notes, is_active: item.is_active,
    } : { ...blank });
    setError("");
  }

  function closeForm() {
    faceRequestRef.current += 1;
    faceCheckRef.current += 1;
    setForm(null);
    setEditing(null);
  }

  function openFace(item) {
    setFaceCaptureKey((current) => current + 1);
    setNotice("");
    const request = ++faceRequestRef.current;
    faceCheckRef.current += 1;
    setForm(null);
    setFaceTenant(item);
    loadPhotos(item, request);
    setError("");
  }

  function closeFace() {
    faceRequestRef.current += 1;
    faceCheckRef.current += 1;
    setFaceTenant(null);
  }

  async function chooseFaces(files) {
    if (!faceReady || saving) return;
    const request = faceCheckRef.current;
    if (facePhotosRef.current.length + files.length > 10) {
      setError("You can enroll up to 10 face photos. Remove a photo before adding more.");
      return;
    }
    const additions = files.map((file) => ({ key: crypto.randomUUID(), file, status: "checking", message: "Checking for one clear face..." }));
    updatePhotos([...facePhotosRef.current, ...additions]);
    setFaceChanged(true);
    setError("");
    // Check sequentially so large selections do not flood model inference.
    for (const photo of additions) {
      let status = "valid";
      let message = "One face detected. Ready to enroll.";
      try {
        if (photo.file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photo.file.type)) {
          throw new Error("Choose a JPEG, PNG, or WebP face photo no larger than 8 MB.");
        }
        if (request !== faceCheckRef.current) return;
        if (!facePhotosRef.current.some((item) => item.key === photo.key)) continue;
        const body = new FormData();
        body.append("photo", photo.file);
        await api("/tenants/check-face/", { method: "POST", body });
      } catch (err) { status = "error"; message = err.message; }
      if (request !== faceCheckRef.current) return;
      updatePhotos(facePhotosRef.current.map((item) => item.key === photo.key ? { ...item, status, message } : item));
    }
  }

  function removeFace(key) {
    updatePhotos(facePhotosRef.current.filter((photo) => photo.key !== key));
    setFaceChanged(true);
    setError("");
  }

  const facesValid = faceReady && facePhotos.every((photo) => photo.status === "valid");

  async function persistFaces(tenantId) {
    if (!faceChanged) return;
    if (!facePhotos.length) {
      await api(`/tenants/${tenantId}/face-photo/`, { method: "DELETE" });
      return;
    }
    const body = new FormData();
    body.append("keep_ids", JSON.stringify(facePhotos.filter((photo) => !photo.file).map((photo) => photo.id)));
    facePhotos.filter((photo) => photo.file).forEach((photo) => body.append("photo", photo.file));
    await api(`/tenants/${tenantId}/face-photo/`, { method: "POST", body });
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    let detailsSaved = false;
    try {
      if (!facesValid) throw new Error("Wait for all face photos to pass validation, or remove invalid photos.");
      const payload = { ...form, room: Number(form.room), move_in_date: form.move_in_date || null };
      const saved = await api(editing ? `/tenants/${editing.id}/` : "/tenants/", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      detailsSaved = true;
      setEditing(saved);
      await persistFaces(saved.id);
      closeForm(); await load();
    } catch (err) { setError(detailsSaved ? `Occupant details saved, but the face photo update failed: ${err.message}` : err.message); }
    finally { setSaving(false); }
  }

  async function saveFace(event) {
    event.preventDefault();
    if (saving || !faceTenant || !faceChanged) return;
    if (!facesValid) { setError("Wait for all face photos to pass validation, or remove invalid photos."); return; }
    setSaving(true);
    setError("");
    try {
      await persistFaces(faceTenant.id);
      setNotice(!facePhotos.length ? `Face photo removed for ${faceTenant.full_name}.` : `Face registered for ${faceTenant.full_name}.`);
      closeFace();
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function showHistory(item) {
    setError("");
    try { setHistory(await api(`/tenants/${item.id}/history/`)); } catch (err) { setError(err.message); }
  }

  const visibleItems = items.filter((item) => matchesSearch(filters.search, item.full_name, item.first_name, item.last_name, item.reference, item.email, item.phone)
    && matchesValue(filters.active, item.is_active) && matchesValue(filters.room, item.room)
    && (!filters.registration || Boolean(item.has_face_photo) === (filters.registration === "registered"))
    && inDateRange(item.move_in_date, filters.date_from, filters.date_to));

  return <div className="page tenant-page">
    <div className="page-actions"><button className="button primary" onClick={() => open()}><Plus size={17} />Enroll occupant</button></div>
    <FilterBar label="Occupants" value={filters} onChange={setFilters} onReset={() => { setFilters({}); setNotice(""); }} searchLabel="Search occupants by name, reference, or email" count={visibleItems.length} fields={[
      { key: "active", label: "Occupant status", all: "All statuses", options: activeOptions },
      { key: "room", label: "Occupant room", all: "All rooms", options: optionsFor(items, (item) => item.room, (item) => `Room ${item.room_number ?? item.room}`) },
      { key: "registration", label: "Face registration status", all: "All occupants", options: [{ value: "registered", label: "Registered" }, { value: "unregistered", label: "Not registered" }] },
      { key: "date_from", label: "Move-in from", type: "date" }, { key: "date_to", label: "Move-in to", type: "date" },
    ]} />
    <ErrorMessage message={!form && !faceTenant ? error : ""} />
    <SuccessMessage message={notice} />
    {loading ? <Loading /> : visibleItems.length === 0 ? <Empty title="No occupants found" detail="Adjust the search or enroll an occupant." /> : <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Occupant</th><th>Reference</th><th>Room</th><th>Contact</th><th>Move in</th><th>Status</th><th>Face</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {visibleItems.map((item) => <tr key={item.id}><td><div className="person-cell"><span>{item.has_face_photo ? <Camera size={17} /> : <UserRound size={17} />}</span><strong>{item.full_name}</strong></div></td><td className="mono">{item.reference}</td><td>Room {item.room_number}</td><td>{item.email || item.phone || "-"}</td><td>{item.move_in_date ? formatDate(item.move_in_date, false) : "-"}</td><td><span className={`status ${item.is_active ? "verified" : "dismissed"}`}>{item.is_active ? "active" : "inactive"}</span></td><td>{item.has_face_photo ? "Enrolled" : "Not enrolled"}</td><td><div className="row-actions"><button className="icon-button" title={item.has_face_photo ? `Update face for ${item.full_name}` : `Enroll face for ${item.full_name}`} aria-label={item.has_face_photo ? `Update face for ${item.full_name}` : `Enroll face for ${item.full_name}`} onClick={() => openFace(item)}><Camera size={17} /></button><button className="icon-button" title="View history" onClick={() => showHistory(item)}><Eye size={17} /></button><button className="icon-button" title="Edit occupant" onClick={() => open(item)}><Edit3 size={17} /></button></div></td></tr>)}
    </tbody></table></div></section>}
    {form && <Modal title={editing ? `Edit ${editing.full_name}` : "Enroll occupant"} onClose={closeForm} wide>
      <form className="form-grid" onSubmit={save}>
        <label>First name<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></label>
        <label>Last name<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Room<select value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} required><option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id} disabled={!editing && room.available_beds < 1}>Room {room.number} ({room.available_beds} available)</option>)}</select></label>
        <label>Move-in date<input type="date" value={form.move_in_date} onChange={(e) => setForm({ ...form, move_in_date: e.target.value })} /></label>
        <label className="span-2">Emergency contact<input value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} /></label>
        <label className="span-2">Notes<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <TenantFaceCapture key={faceCaptureKey} photos={facePhotos} disabled={saving || !faceReady} onChange={chooseFaces} onRemove={removeFace} />
        <label className="check-field"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active occupant</label>
        <ErrorMessage message={error} />
        <div className="form-actions span-2"><button className="button subtle" type="button" onClick={closeForm}>Cancel</button><ResetButton disabled={saving} onClick={() => open(editing)} /><button className="button primary" disabled={saving || !facesValid}>{saving ? "Saving..." : "Save occupant"}</button></div>
      </form>
    </Modal>}
    {faceTenant && <Modal title={`${faceTenant.has_face_photo ? "Update" : "Enroll"} face: ${faceTenant.full_name}`} onClose={closeFace} wide>
      <form className="form-grid" onSubmit={saveFace}>
        <TenantFaceCapture key={faceCaptureKey} photos={facePhotos} disabled={saving || !faceReady} onChange={chooseFaces} onRemove={removeFace} />
        <ErrorMessage message={error} />
        <div className="form-actions span-2"><button className="button subtle" type="button" onClick={closeFace}>Cancel</button><ResetButton disabled={saving} onClick={() => openFace(faceTenant)} /><button className="button primary" disabled={saving || !faceChanged || !facesValid}>{saving ? "Saving..." : "Save face"}</button></div>
      </form>
    </Modal>}
    {history && <Modal title={`${history.tenant.full_name} history`} onClose={() => setHistory(null)} wide>
      <div className="history-summary"><span className="mono">{history.tenant.reference}</span><span>Room {history.tenant.room_number}</span><span>{history.warnings.length} warnings</span><span>{history.violations.length} violations</span></div>
      <h3>Warnings</h3>{history.warnings.length ? <div className="record-list">{history.warnings.map((item) => <article key={item.id}><div><strong>{item.rule_code}: {item.rule_title}</strong><span>{item.reference} · {formatDate(item.issued_at)}</span></div><p>{item.message}</p></article>)}</div> : <Empty title="No warnings" />}
      <h3>Violations</h3>{history.violations.length ? <div className="record-list">{history.violations.map((item) => <article key={item.id}><div><strong>{item.rule_code}: {item.rule_title}</strong><span>{item.reference} · {formatDate(item.recorded_at)}</span></div><p>{item.description}</p></article>)}</div> : <Empty title="No violations" />}
    </Modal>}
  </div>;
}
