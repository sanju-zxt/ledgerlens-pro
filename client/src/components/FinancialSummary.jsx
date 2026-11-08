export function FinancialSummary({ title, value, currency = "", suffix = "", trend }) {
  const isPositive = trend?.direction === "up"
  return (
    <div className="card">
      <p className="text-sm text-slate-500 mb-1">{title}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-900">
          {currency ? `${currency} ` : ""}{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        {suffix && <span className="text-slate-500">{suffix}</span>}
      </div>
      {trend && (
        <div className="mt-2 flex items-center gap-1 text-sm">
          <span className={isPositive ? "text-green-600" : "text-red-600"}>{isPositive ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%</span>
          <span className="text-slate-500">{trend.period}</span>
        </div>
      )}
    </div>
  )
}
