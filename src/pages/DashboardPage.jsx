import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BedDouble, Building2, Camera, ClipboardList, RefreshCw, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";
import { useAuth } from "../context/AuthContext";

const cards = [
  ["active_tenants", "Active tenants", Users, "green", "/tenants", "View resident register"],
  ["available_beds", "Available beds", BedDouble, "blue", "/rooms", "Explore room availability"],
  ["pending_incidents", "Pending review", AlertTriangle, "amber", "/incidents", "Open incident queue"],
  ["violations_total", "Recorded violations", ClipboardList, "red", "/records", "View warnings & violations"],
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await api("/dashboard/summary/")); setUpdatedAt(new Date()); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const occupied = data ? Math.max(0, data.total_beds - data.available_beds) : 0;
  const occupancy = data?.total_beds ? Math.round(occupied / data.total_beds * 100) : 0;

  return <div className="page dashboard-page">
    <header className="page-header">
      <div><p className="eyebrow">Your residence at a glance</p><h1>Overview</h1><p className="page-description">A clear view of your people, spaces, and daily priorities.</p></div>
      <button className="button subtle" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} />Refresh</button>
    </header>
    <section className="welcome-banner">
      <div><span className="welcome-kicker">SMART DORMITORY / OPERATIONS</span><h2>Welcome back, {user?.first_name || user?.username || "manager"}.</h2><p>Make room for a better day.</p><Link className="button welcome-button" to="/monitoring"><Camera size={17} />Open monitoring<ArrowRight size={16} /></Link></div>
      <div className="residence-art" aria-hidden="true"><div className="building building-back">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div><div className="building building-front">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div><span className="building-ground" /></div>
    </section>
    <ErrorMessage message={error} />
    {!data && loading ? <Loading label="Loading residence overview" /> : data && <>
      <div className="section-label"><h2>At a glance</h2>{updatedAt && <span>Updated {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(updatedAt)}</span>}</div>
      <section className="metric-grid" aria-label="Residence metrics">
        {cards.map(([key, label, Icon, tone, to, detail]) => <Link to={to} className="metric metric-link" key={key}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={19} /></span></div><strong>{data[key].toLocaleString()}</strong><div className="metric-footer"><span>{detail}</span><ArrowRight size={15} /></div></Link>)}
      </section>
      <section className="dashboard-grid">
        <div className="panel table-panel">
          <div className="panel-heading"><div><h2>Recent incidents</h2><p>Stay on top of activity around your residence.</p></div><Link className="text-link" to="/incidents">View all<ArrowRight size={15} /></Link></div>
          {data.recent_incidents.length === 0 ? <Empty title="No incidents yet" detail="New reports and detections will appear here." /> : <div className="table-scroll"><table><thead><tr><th>Incident</th><th>Location</th><th>Status</th><th>Occurred</th></tr></thead><tbody>
            {data.recent_incidents.map((incident) => <tr key={incident.id}><td><strong className="incident-name">{incident.incident_type.replaceAll("_", " ")}</strong><span className="cell-detail mono">{incident.reference}</span></td><td>{incident.room_number ? `Room ${incident.room_number}` : incident.source_display}</td><td><span className={`status ${incident.status}`}>{incident.status}</span></td><td>{formatDate(incident.occurred_at)}</td></tr>)}
          </tbody></table></div>}
          <Link to="/incidents" className="panel-footer">{data.pending_incidents ? `${data.pending_incidents} incidents awaiting review` : "No incidents awaiting review"}<ArrowRight size={16} /></Link>
        </div>
        <aside className="dashboard-side">
          <section className="panel occupancy-panel"><div className="panel-heading"><div><h2>Room occupancy</h2><p>Across {data.active_rooms} active rooms</p></div><Building2 size={20} /></div><div className="occupancy-body"><div className="occupancy-total"><strong>{occupancy}<span>%</span></strong><span>of beds occupied</span></div><div className="occupancy" role="progressbar" aria-label="Bed occupancy" aria-valuenow={occupancy} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${occupancy}%` }} /></div><div className="occupancy-legend"><span><i />{occupied} occupied</span><span><i />{data.available_beds} available</span></div><Link className="button subtle full" to="/rooms">Manage rooms<ArrowRight size={15} /></Link></div></section>
          <section className="panel activity-summary"><div className="panel-heading"><h2>Today & follow-ups</h2></div><dl><div><dt>Incidents today</dt><dd>{data.incidents_today}</dd></div><div><dt>Ready for assignment</dt><dd>{data.verified_incidents}</dd></div><div><dt>Total warnings issued</dt><dd>{data.warnings_total}</dd></div></dl></section>
        </aside>
      </section>
      <section className="quick-actions" aria-label="Quick navigation"><Link to="/tenants"><Users size={20} /><div><strong>Resident register</strong><span>Manage tenants and view their history</span></div><ArrowRight size={18} /></Link><Link to="/reports"><ClipboardList size={20} /><div><strong>Residence reports</strong><span>Review activity over a date range</span></div><ArrowRight size={18} /></Link></section>
    </>}
  </div>;
}
