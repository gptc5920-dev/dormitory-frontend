import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { CalendarRange, FileBarChart } from "lucide-react";
import { api } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";

const IncidentChart = lazy(() => import("../components/IncidentChart"));

function localIsoDate(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const now = new Date();
  const prior = new Date(now); prior.setDate(now.getDate() - 29);
  const [dates, setDates] = useState({ date_from: localIsoDate(prior), date_to: localIsoDate(now) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await api(`/reports/summary/?${new URLSearchParams(dates)}`)); } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [dates]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Operational analysis</p><h1>Reports</h1><p className="page-description">Turn residence activity into a clearer picture.</p></div></header>
    <form className="report-filter" onSubmit={(e) => { e.preventDefault(); load(); }}><CalendarRange size={19} /><label>From<input type="date" max={dates.date_to} value={dates.date_from} onChange={(e) => setDates({ ...dates, date_from: e.target.value })} required /></label><label>To<input type="date" min={dates.date_from} value={dates.date_to} onChange={(e) => setDates({ ...dates, date_to: e.target.value })} required /></label><button className="button primary">Run report</button></form>
    <ErrorMessage message={error} />
    {loading ? <Loading label="Building report" /> : data && <>
      <section className="metric-grid report-metrics"><article className="metric"><span className="metric-icon blue"><FileBarChart size={20} /></span><div><strong>{data.totals.incidents}</strong><span>Incidents</span></div></article><article className="metric"><div><strong>{data.totals.warnings}</strong><span>Warnings</span></div></article><article className="metric"><div><strong>{data.totals.violations}</strong><span>Violations</span></div></article></section>
      <section className="report-grid">
        <div className="panel"><div className="panel-heading"><div><h2>Incidents by type</h2><p>{data.date_from} to {data.date_to}</p></div></div>{data.incidents_by_type.length ? <Suspense fallback={<Loading label="Loading chart" />}><IncidentChart items={data.incidents_by_type} /></Suspense> : <Empty title="No incidents in this period" />}</div>
        <div className="panel table-panel"><div className="panel-heading"><div><h2>Incident outcomes</h2><p>Review status distribution</p></div></div><table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{data.incidents_by_status.map((item) => <tr key={item.status}><td><span className={`status ${item.status}`}>{item.status}</span></td><td>{item.count}</td></tr>)}</tbody></table></div>
        <div className="panel table-panel"><div className="panel-heading"><div><h2>Warnings by rule</h2><p>Rules referenced in warnings</p></div></div>{data.warnings_by_rule.length ? <table><thead><tr><th>Rule</th><th>Count</th></tr></thead><tbody>{data.warnings_by_rule.map((item) => <tr key={item.rule__code}><td><span className="mono">{item.rule__code}</span><small className="cell-detail">{item.rule__title}</small></td><td>{item.count}</td></tr>)}</tbody></table> : <Empty title="No warnings in this period" />}</div>
        <div className="panel table-panel"><div className="panel-heading"><div><h2>Violations by rule</h2><p>Verified disciplinary records</p></div></div>{data.violations_by_rule.length ? <table><thead><tr><th>Rule</th><th>Count</th></tr></thead><tbody>{data.violations_by_rule.map((item) => <tr key={item.rule__code}><td><span className="mono">{item.rule__code}</span><small className="cell-detail">{item.rule__title}</small></td><td>{item.count}</td></tr>)}</tbody></table> : <Empty title="No violations in this period" />}</div>
      </section>
    </>}
  </div>;
}

