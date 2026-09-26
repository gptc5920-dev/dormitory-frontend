import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function IncidentChart({ items }) {
  const data = items.map((item) => ({ name: item.incident_type.replaceAll("_", " "), count: item.count }));
  return <div className="incident-chart">
    <div style={{ width: "100%", height: Math.max(240, data.length * 48) }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 0 }} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8e4" />
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#65756c" }} />
          <YAxis type="category" dataKey="name" width={115} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#465e53" }} />
          <Tooltip cursor={{ fill: "#f0f5f2" }} contentStyle={{ borderRadius: 12, borderColor: "#e2e8e4", fontSize: 12 }} />
          <Bar dataKey="count" name="Incidents" fill="#25836a" radius={[0, 5, 5, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details className="chart-data"><summary>View chart data</summary><table><thead><tr><th>Incident type</th><th>Count</th></tr></thead><tbody>{data.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.count}</td></tr>)}</tbody></table></details>
  </div>;
}
