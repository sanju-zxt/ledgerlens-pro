import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export function ForecastChart({ data, currency = "USD" }) {
  if (!data?.length) return <div className="h-64 flex items-center justify-center text-slate-400">No forecast data</div>
  const formatMoney = value => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value))
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" stroke="#e8efed" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "#82909a", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={day => `Day ${day}`} />
          <YAxis width={70} tick={{ fill: "#82909a", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatMoney} />
          <Tooltip contentStyle={{ border: "1px solid #e3ece8", borderRadius: 12, boxShadow: "0 8px 24px rgba(24,46,64,.1)", fontSize: 11 }} formatter={value => [formatMoney(value)]} labelFormatter={day => `Day ${day}`} />
          <Line name="Median" type="monotone" dataKey="median" stroke="#16816c" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#16816c", stroke: "#fff", strokeWidth: 2 }} />
          <Line name="P15 lower" type="monotone" dataKey="lower_bound" stroke="#a4cbbc" strokeWidth={1.5} strokeDasharray="4 5" dot={false} />
          <Line name="P85 upper" type="monotone" dataKey="upper_bound" stroke="#a4cbbc" strokeWidth={1.5} strokeDasharray="4 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
