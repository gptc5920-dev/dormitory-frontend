import { useCallback, useEffect, useState } from "react";
import { BedDouble, Edit3, Plus } from "lucide-react";
import { api, apiList, rows } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";
import Modal from "../components/Modal";

const blank = { number: "", floor: 1, capacity: 4, description: "", is_active: true };

export default function RoomsPage() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setItems(rows(await apiList("/rooms/"))); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function open(item = null) {
    setEditing(item);
    setForm(item ? { number: item.number, floor: item.floor, capacity: item.capacity, description: item.description, is_active: item.is_active } : { ...blank });
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api(editing ? `/rooms/${editing.id}/` : "/rooms/", { method: editing ? "PUT" : "POST", body: JSON.stringify(form) });
      setEditing(null); setForm(null); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Accommodation</p><h1>Rooms</h1></div><button className="button primary" onClick={() => open()}><Plus size={17} />Add room</button></header>
    <ErrorMessage message={!form ? error : ""} />
    {loading ? <Loading /> : items.length === 0 ? <Empty title="No rooms yet" detail="Add the first room to begin assigning tenants." /> :
      <section className="room-grid">{items.map((room) => <article className="room-card" key={room.id}>
        <div className="room-title"><span><BedDouble size={20} /></span><div><h2>Room {room.number}</h2><p>Floor {room.floor}</p></div><button className="icon-button" title="Edit room" onClick={() => open(room)}><Edit3 size={17} /></button></div>
        <div className="occupancy"><span style={{ width: `${Math.min(100, room.capacity ? room.occupancy / room.capacity * 100 : 0)}%` }} /></div>
        <div className="room-stats"><strong>{room.occupancy} / {room.capacity}</strong><span>{room.available_beds} beds available</span></div>
        <p>{room.description || "No room notes"}</p>
        <span className={`status ${room.is_active ? "verified" : "dismissed"}`}>{room.is_active ? "active" : "inactive"}</span>
      </article>)}</section>}
    {form && <Modal title={editing ? `Edit room ${editing.number}` : "Add room"} onClose={() => { setEditing(null); setForm(null); setError(""); }}>
      <form className="form-grid" onSubmit={save}>
        <label>Room number<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required /></label>
        <label>Floor<input type="number" min="1" value={form.floor} onChange={(e) => setForm({ ...form, floor: Number(e.target.value) })} required /></label>
        <label>Bed capacity<input type="number" min="1" max="50" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} required /></label>
        <label className="span-2">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="check-field"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Active room</label>
        <ErrorMessage message={error} />
        <div className="form-actions span-2"><button className="button subtle" type="button" onClick={() => { setEditing(null); setForm(null); }}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving..." : "Save room"}</button></div>
      </form>
    </Modal>}
  </div>;
}
