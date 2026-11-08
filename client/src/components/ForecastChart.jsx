import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

export function ForecastChart({ data }) {
  if (!data?.length) return <div className="h-64 flex items-center justify-center text-slate-400">No forecast data</div>
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
          <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={val => `$${val}`} />
          <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, "Balance"]} labelFormatter={(date) => new Date(date).toLocaleDateString()} />
          <Line type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="lower_bound" stroke="#fef08a" strokeWidth={1} strokeDasharray="5 5" dot={false} />
          <Line type="monotone" dataKey="upper_bound" stroke="#fef08a" strokeWidth={1} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
