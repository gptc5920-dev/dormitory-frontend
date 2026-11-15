import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BedDouble, Building2, ClipboardList, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";
import FilterBar from "../components/FilterBar";
import { incidentStatuses, incidentTypeOptions, incidentTypes, matchesSearch, matchesValue } from "../filters";

const cards = [
  ["active_tenants", "Active occupants", Users, "green", "/tenants"],
  ["available_beds", "Available beds", BedDouble, "blue", "/rooms"],
  ["pending_incidents", "Pending review", AlertTriangle, "amber", "/incidents"],
  ["violations_total", "Recorded violations", ClipboardList, "red", "/records"],
];

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await api("/dashboard/summary/")); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const occupied = data ? Math.max(0, data.total_beds - data.available_beds) : 0;
  const occupancy = data?.total_beds ? Math.round(occupied / data.total_beds * 100) : 0;
  const visibleIncidents = (data?.recent_incidents || []).filter((item) => matchesSearch(filters.search, item.reference, item.details, item.source_display, item.room_number, incidentTypes[item.incident_type])
    && matchesValue(filters.status, item.status) && matchesValue(filters.type, item.incident_type));

  return <div className="page dashboard-page">
    <ErrorMessage message={error} />
    {!data && loading ? <Loading label="Loading residence overview" /> : data && <>
      <section className="metric-grid" aria-label="Residence metrics">
        {cards.map(([key, label, Icon, tone, to]) => <Link to={to} className="metric metric-link" key={key}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={19} /></span></div><strong>{data[key].toLocaleString()}</strong></Link>)}
      </section>
      <section className="dashboard-grid">
        <div className="panel table-panel">
          <div className="panel-heading"><h2>Recent incidents</h2><Link className="text-link" to="/incidents">View all<ArrowRight size={15} /></Link></div>
          <FilterBar label="Recent incidents" value={filters} onChange={setFilters} onReset={() => setFilters({})} searchLabel="Search recent incidents" count={visibleIncidents.length} fields={[
            { key: "status", label: "Recent incident status", all: "All statuses", options: incidentStatuses },
            { key: "type", label: "Recent detection type", all: "All types", options: incidentTypeOptions },
          ]} />
          {visibleIncidents.length === 0 ? <Empty title={data.recent_incidents.length ? "No matching incidents" : "No incidents yet"} /> : <div className="table-scroll"><table><thead><tr><th>Incident</th><th>Location</th><th>Status</th><th>Occurred</th></tr></thead><tbody>
            {visibleIncidents.map((incident) => <tr key={incident.id}><td><strong className="incident-name">{incident.incident_type.replaceAll("_", " ")}</strong><span className="cell-detail mono">{incident.reference}</span></td><td>{incident.room_number ? `Room ${incident.room_number}` : incident.source_display}</td><td><span className={`status ${incident.status}`}>{incident.status}</span></td><td>{formatDate(incident.occurred_at)}</td></tr>)}
          </tbody></table></div>}
          <Link to="/incidents" className="panel-footer">{data.pending_incidents ? `${data.pending_incidents} incidents awaiting review` : "No incidents awaiting review"}<ArrowRight size={16} /></Link>
        </div>
        <aside className="dashboard-side">
          <section className="panel occupancy-panel"><div className="panel-heading"><div><h2>Room occupancy</h2><p>Across {data.active_rooms} active rooms</p></div><Building2 size={20} /></div><div className="occupancy-body"><div className="occupancy-total"><strong>{occupancy}<span>%</span></strong><span>of beds occupied</span></div><div className="occupancy" role="progressbar" aria-label="Bed occupancy" aria-valuenow={occupancy} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${occupancy}%` }} /></div><div className="occupancy-legend"><span><i />{occupied} occupied</span><span><i />{data.available_beds} available</span></div><Link className="button subtle full" to="/rooms">Manage rooms<ArrowRight size={15} /></Link></div></section>
          <section className="panel activity-summary"><div className="panel-heading"><h2>Today & follow-ups</h2></div><dl><div><dt>Incidents today</dt><dd>{data.incidents_today}</dd></div><div><dt>Ready for assignment</dt><dd>{data.verified_incidents}</dd></div><div><dt>Total warnings issued</dt><dd>{data.warnings_total}</dd></div></dl></section>
        </aside>
      </section>
      <section className="quick-actions" aria-label="Quick navigation"><Link to="/tenants"><Users size={20} /><strong>Occupants</strong><ArrowRight size={18} /></Link><Link to="/reports"><ClipboardList size={20} /><strong>Reports</strong><ArrowRight size={18} /></Link></section>
    </>}
  </div>;
}
