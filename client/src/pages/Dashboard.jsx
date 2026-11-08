import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ForecastChart } from "../components/ForecastChart"
import { TransactionTable } from "../components/TransactionTable"
import { ScenarioSimulator } from "../components/ScenarioSimulator"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"

const money = (value, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0))

function Metric({ title, value, foot, icon, tone = "" }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div><p className="metric-value">{value}</p><p className={`metric-foot ${tone}`}>{foot}</p></article>
}

function QuickAction({ to, icon, title, detail }) {
  return <Link className="quick-action" to={to}><span aria-hidden="true">{icon}</span><span>{title}<small className="block mt-1 font-normal text-slate-500">{detail}</small></span><span aria-hidden="true">→</span></Link>
}

export default function Dashboard() {
  const { user } = useAuth()
  const summaryQuery = useQuery({ queryKey: ["summary"], queryFn: () => api.get("/dashboard/summary") })
  const transactionsQuery = useQuery({ queryKey: ["transactions", "recent"], queryFn: () => api.get("/transactions?limit=5") })
  const forecastQuery = useQuery({ queryKey: ["forecast"], queryFn: () => api.get("/forecast") })
  const summary = summaryQuery.data
  const forecast = forecastQuery.data
  const currency = summary?.currency || "USD"
  const median = forecast?.ending_balance?.median
  const runway = forecast?.reserve_runway_days_p50
  const loading = summaryQuery.isLoading || transactionsQuery.isLoading || forecastQuery.isLoading
  const errors = [summaryQuery.error, transactionsQuery.error, forecastQuery.error].filter(Boolean)

  return <div className="dashboard-page">
    <section className="dashboard-hero" aria-labelledby="dashboard-title"><div className="hero-copy"><span className="hero-kicker"><i/> MERCHANT CASH-FLOW INTELLIGENCE</span><h1 id="dashboard-title">See the next move clearly.</h1><p>Evidence-backed balances, a 30-day outlook, and a safe way to test what-if decisions before they affect your business.</p></div><div className="hero-actions"><Link className="btn-primary" to="/forecast">Explore forecast <span aria-hidden="true">→</span></Link><Link className="btn-secondary" to="/settings">PayPal data setup</Link></div></section>

    {user?.demo && <div className="dashboard-alert" role="status"><strong>Sandbox demo:</strong> figures below come from the included, clearly labeled evidence ledger. No PayPal merchant account is connected. <Link className="font-semibold underline" to="/settings">Review data sources</Link>.</div>}
    {errors.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Some dashboard data could not be loaded. {errors.map(error => error.message).join(" · ")}</div>}
    {loading && <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading the evidence ledger and forecast…</div>}

    <section aria-labelledby="snapshot-title"><div className="section-heading mb-3"><div><p className="eyebrow">THE MONEY AT A GLANCE</p><h2 id="snapshot-title">Cash-flow snapshot</h2></div><span className="text-[10px] text-slate-500">{summary?.as_of ? `Evidence as of ${summary.as_of}` : "30-day modeled outlook"}</span></div><div className="metric-grid">
      <Metric title="Ledger closing balance" value={money(summary?.closing_balance, currency)} foot="Reconciled evidence balance" icon="◈" />
      <Metric title="30-day median balance" value={median == null ? "—" : money(median, currency)} foot="Model estimate · not a guarantee" icon="↗" tone="good" />
      <Metric title="Reserve runway" value={runway == null ? "30+ days" : `${Math.round(runway)} days`} foot="Median time above the $1,000 reserve" icon="◷" />
      <Metric title="Reserve dip probability" value={forecast?.reserve_breach_probability == null ? "—" : `${(forecast.reserve_breach_probability * 100).toFixed(1)}%`} foot="Estimated chance of falling below reserve" icon="◎" />
    </div></section>

    <section className="dashboard-grid" aria-label="Forecast and explanation"><article className="card chart-card"><div className="section-heading mb-4"><div><p className="eyebrow">30-DAY OUTLOOK</p><h2>Cash balance forecast</h2><p>Modeled paths show a range of possible outcomes.</p></div><div className="chart-meta"><span className="chart-key"><i/> Median</span><span className="chart-key range"><i/> P15–P85 range</span></div></div><ForecastChart data={forecast?.chart_data || []}/><p className="mt-2 text-[9px] leading-relaxed text-slate-500">Illustrative model: 10,000 seeded simulations with a $3,500 future-inflow assumption. Select “Explore forecast” to inspect assumptions and change the scenario.</p></article>
      <article className="card insight-card"><span className="insight-label"><i>✦</i> MODEL EXPLAINED</span><h3>{forecast?.reserve_breach_probability > 0.25 ? "Keep a closer eye on your reserve." : "Your reserve outlook is holding up."}</h3><p>The reserve signal is based on the estimated chance that a simulated balance falls below $1,000. The forecast includes assumed future receipts and day-to-day expenses; it is a planning aid, not a prediction of guaranteed income.</p><div className="insight-stat"><strong>{forecast?.reserve_breach_probability == null ? "—" : `${(forecast.reserve_breach_probability * 100).toFixed(1)}%`}</strong><span>modeled reserve dip<br/>probability</span></div><Link className="subtle-link mt-4" to="/insights">Read the full explanation →</Link></article></section>

    <section aria-labelledby="actions-title"><div className="section-heading mb-3"><div><p className="eyebrow">MAKE THE NEXT STEP</p><h2 id="actions-title">Your workspace</h2></div></div><div className="quick-actions"><QuickAction to="/transactions" icon="≡" title="Review transactions" detail="Inspect the evidence ledger"/><QuickAction to="/recurring" icon="↻" title="Find recurring payments" detail="Review repeat-payment patterns"/><QuickAction to="/anomalies" icon="△" title="Check unusual activity" detail="Open explainable anomaly review"/></div></section>

    <section className="dashboard-lower" aria-label="Scenario and recent activity"><div><div className="section-heading mb-3"><div><p className="eyebrow">DECISION WORKBENCH</p><h2>Test a what-if scenario</h2></div><Link className="subtle-link" to="/forecast">More forecast tools →</Link></div><ScenarioSimulator forecast={forecast}/></div><div><div className="section-heading mb-3"><div><p className="eyebrow">LATEST EVIDENCE</p><h2>Recent transactions</h2></div><Link className="subtle-link" to="/transactions">View ledger →</Link></div><TransactionTable transactions={transactionsQuery.data?.data || []}/></div></section>
  </div>
}
