import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { CalendarRange, FileBarChart } from "lucide-react";
import { api } from "../api";
import { Empty, ErrorMessage, Loading } from "../components/Feedback";
import ResetButton from "../components/ResetButton";

const IncidentChart = lazy(() => import("../components/IncidentChart"));

function localIsoDate(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function defaultDates(days = 30) {
  const now = new Date();
  const prior = new Date(now); prior.setDate(now.getDate() - days + 1);
  return { date_from: localIsoDate(prior), date_to: localIsoDate(now) };
}

export default function ReportsPage() {
  const [dates, setDates] = useState(defaultDates);
  const [period, setPeriod] = useState("30");
  const requestRef = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (range = dates) => {
    const request = ++requestRef.current;
    setLoading(true); setError("");
    try {
      const report = await api(`/reports/summary/?${new URLSearchParams(range)}`);
      if (request === requestRef.current) setData(report);
    } catch (err) { if (request === requestRef.current) setError(err.message); } finally { if (request === requestRef.current) setLoading(false); }
  }, [dates]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="page">
    <form className="report-filter" onSubmit={(e) => { e.preventDefault(); load(); }}><CalendarRange size={19} /><label>Report period<select value={period} onChange={(e) => { setPeriod(e.target.value); if (e.target.value) { const range = defaultDates(Number(e.target.value)); setDates(range); load(range); } }}><option value="">Custom dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><label>From<input type="date" max={dates.date_to} value={dates.date_from} onChange={(e) => { setPeriod(""); setDates({ ...dates, date_from: e.target.value }); }} required /></label><label>To<input type="date" min={dates.date_from} value={dates.date_to} onChange={(e) => { setPeriod(""); setDates({ ...dates, date_to: e.target.value }); }} required /></label><button className="button primary">Run report</button><ResetButton filters onClick={() => { const range = defaultDates(); setPeriod("30"); setDates(range); load(range); }} /></form>
    <ErrorMessage message={error} />
    {loading ? <Loading label="Building report" /> : data && <>
      <section className="metric-grid report-metrics"><article className="metric"><span className="metric-icon blue"><FileBarChart size={20} /></span><div><strong>{data.totals.incidents}</strong><span>Incidents</span></div></article><article className="metric"><div><strong>{data.totals.warnings}</strong><span>Warnings</span></div></article><article className="metric"><div><strong>{data.totals.violations}</strong><span>Violations</span></div></article></section>
      <section className="report-grid">
        <div className="panel"><div className="panel-heading"><div><h2>Incidents by type</h2><p>{data.date_from} to {data.date_to}</p></div></div>{data.incidents_by_type.length ? <Suspense fallback={<Loading label="Loading chart" />}><IncidentChart items={data.incidents_by_type} /></Suspense> : <Empty title="No incidents in this period" />}</div>
        <div className="panel table-panel"><div className="panel-heading"><h2>Incident outcomes</h2></div><table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{data.incidents_by_status.map((item) => <tr key={item.status}><td><span className={`status ${item.status}`}>{item.status}</span></td><td>{item.count}</td></tr>)}</tbody></table></div>
        <div className="panel table-panel"><div className="panel-heading"><h2>Warnings by rule</h2></div>{data.warnings_by_rule.length ? <table><thead><tr><th>Rule</th><th>Count</th></tr></thead><tbody>{data.warnings_by_rule.map((item) => <tr key={item.rule__code}><td><span className="mono">{item.rule__code}</span><small className="cell-detail">{item.rule__title}</small></td><td>{item.count}</td></tr>)}</tbody></table> : <Empty title="No warnings in this period" />}</div>
        <div className="panel table-panel"><div className="panel-heading"><h2>Violations by rule</h2></div>{data.violations_by_rule.length ? <table><thead><tr><th>Rule</th><th>Count</th></tr></thead><tbody>{data.violations_by_rule.map((item) => <tr key={item.rule__code}><td><span className="mono">{item.rule__code}</span><small className="cell-detail">{item.rule__title}</small></td><td>{item.count}</td></tr>)}</tbody></table> : <Empty title="No violations in this period" />}</div>
      </section>
    </>}
  </div>;
}

