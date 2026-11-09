import { Link } from "react-router-dom"

const percent = value => `${(value * 100).toFixed(1)}%`

export function DecisionSupport({ forecast }) {
  if (!forecast || forecast.forecast_status === "insufficient_history" || forecast.reserve_breach_probability == null) return null
  const simulations = forecast.simulations
  const breachCount = Math.round(forecast.reserve_breach_probability * simulations)
  const threshold = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: forecast.source_balance?.currency || "USD",
    maximumFractionDigits: 0
  }).format(forecast.reserve_threshold)
  const noSimulatedBreach = breachCount === 0

  return <article className="card border-primary-100">
    <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Decision support · conditional simulation</p>
    <h2 className="mt-2 text-lg font-semibold">{noSimulatedBreach
      ? `No reserve breach appeared in ${simulations.toLocaleString()} modeled paths.`
      : `${breachCount.toLocaleString()} of ${simulations.toLocaleString()} modeled paths crossed the reserve.`}</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">
      The reserve is {threshold}. The simulated share was {percent(forecast.reserve_breach_probability)}
      {` (95% Monte Carlo sampling interval ${percent(forecast.reserve_breach_probability_95ci.lower)}–${percent(forecast.reserve_breach_probability_95ci.upper)}). `}
      This interval describes simulation sampling variation under the displayed assumptions; it is not a measured real-world likelihood or a guarantee. {noSimulatedBreach && "Zero simulated crossings does not mean zero financial risk."}
    </p>
    <div className="mt-4 rounded-xl bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-800">Useful next steps</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>Check the source timestamp and confirm the opening balance reflects your latest available data.</li>
        <li>Compare known bill dates and expected receipts with the forecast. Future income is zero unless you add a hypothetical receipt.</li>
        <li>Open the scenario simulator and test a delayed receipt or an unexpected expense. Use the change from baseline to discuss a plan; LedgerLens does not move or block money.</li>
      </ol>
    </div>
    <Link className="subtle-link mt-4 inline-block" to="/forecast">Review assumptions and run a scenario →</Link>
  </article>
}
