import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ForecastChart } from "../components/ForecastChart"
import { TransactionTable } from "../components/TransactionTable"
import { ScenarioSimulator } from "../components/ScenarioSimulator"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"

const money = (value, currency = "USD") => Number.isFinite(Number(value)) ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)) : "—"

function Metric({ title, value, foot, icon, tone = "" }) {
  return <article className="metric-card"><div className="metric-top"><span className="metric-title">{title}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div><p className="metric-value">{value}</p><p className={`metric-foot ${tone}`}>{foot}</p></article>
}

function QuickAction({ to, icon, title, detail }) {
  return <Link className="quick-action" to={to}><span aria-hidden="true">{icon}</span><span>{title}<small className="block mt-1 font-normal text-slate-500">{detail}</small></span><span aria-hidden="true">→</span></Link>
}

export default function Dashboard() {
  const { user } = useAuth()
  const demo = Boolean(user?.demo)
  const [currencyChoice, setCurrencyChoice] = useState("")
  const summaryQuery = useQuery({ queryKey: ["summary", demo ? "evidence" : "paypal"], queryFn: () => api.get("/dashboard/summary") })
  const balances = summaryQuery.data?.balances || []
  const currency = demo ? summaryQuery.data?.currency || "USD" : currencyChoice || balances[0]?.currency || "USD"
  const selectedBalance = balances.find(item => item.currency === currency)
  const balanceValue = demo ? summaryQuery.data?.closing_balance : selectedBalance?.available_balance
  const transactionsQuery = useQuery({ queryKey: ["transactions", demo ? "evidence" : "paypal", "recent"], queryFn: () => api.get(`/transactions?limit=5${demo ? "" : "&source=paypal"}`) })
  const forecastQuery = useQuery({ queryKey: ["forecast", demo ? "evidence" : "paypal", currency], queryFn: () => api.get(`/forecast${demo ? "" : `?currency_code=${encodeURIComponent(currency)}`}`), enabled: demo || Boolean(selectedBalance) })
  const summary = summaryQuery.data
  const forecast = forecastQuery.data
  const runway = forecast?.reserve_runway_days_p50
  const errors = [summaryQuery.error, transactionsQuery.error, forecastQuery.error].filter(Boolean)
  const loading = summaryQuery.isLoading || transactionsQuery.isLoading || (forecastQuery.isEnabled && forecastQuery.isLoading)
  const asOf = demo ? summary?.as_of : summary?.retrieved_at
  const threshold = forecast?.reserve_threshold

  return <div className="dashboard-page">
    <section className="dashboard-hero" aria-labelledby="dashboard-title"><div className="hero-copy"><span className="hero-kicker"><i/> MERCHANT CASH-FLOW INTELLIGENCE</span><h1 id="dashboard-title">See the next move clearly.</h1><p>Separate PayPal account activity from modeled scenarios, inspect every source, and explore a 30-day outlook using your selected currency.</p></div><div className="hero-actions"><Link className="btn-primary" to="/forecast">Explore forecast <span aria-hidden="true">→</span></Link><Link className="btn-secondary" to="/settings">PayPal data settings</Link></div></section>

    {demo && <div className="dashboard-alert" role="status"><strong>Evidence demo:</strong> figures below come from checked-in sandbox evidence. They are not live merchant activity. <Link className="font-semibold underline" to="/settings">Review data sources</Link>.</div>}
    {!demo && <div className="dashboard-alert" role="status"><strong>PayPal app account:</strong> live data below belongs to the merchant account associated with the server’s PayPal app credentials. This build does not yet onboard unrelated merchants through PayPal consent.</div>}
    {errors.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Some requested data could not be loaded. {errors.map(error => error.message).join(" · ")}</div>}
    {loading && <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading the selected balance, transactions, and forecast…</div>}
    {!demo && balances.length > 1 && <label className="block max-w-xs text-sm font-medium text-slate-700">Balance currency<select className="input-field mt-1" value={currency} onChange={event => setCurrencyChoice(event.target.value)}>{balances.map(item => <option key={item.currency} value={item.currency}>{item.currency}</option>)}</select></label>}

    <section aria-labelledby="snapshot-title"><div className="section-heading mb-3"><div><p className="eyebrow">THE MONEY AT A GLANCE</p><h2 id="snapshot-title">Cash-flow snapshot</h2></div><span className="text-[10px] text-slate-500">{asOf ? `${demo ? "Evidence" : "PayPal balance response"} as of ${new Date(asOf).toLocaleString()}` : "Waiting for balance source"}</span></div><div className="metric-grid">
      <Metric title={demo ? "Evidence closing balance" : `${currency} available balance`} value={money(balanceValue, currency)} foot={demo ? "Reconciled evidence fixture" : "PayPal Reporting · available amount; withheld funds excluded"} icon="◈" />
      <Metric title="30-day median balance" value={forecast?.ending_balance?.median == null ? "—" : money(forecast.ending_balance.median, currency)} foot="Scenario-model result · not a guarantee" icon="↗" tone="good" />
      <Metric title="Median reserve runway" value={runway == null ? "Not reached in horizon" : `${Math.round(runway)} days`} foot="First crossing of the configured reserve threshold" icon="◷" />
      <Metric title="Any-day reserve breach" value={forecast?.reserve_breach_probability == null ? "—" : `${(forecast.reserve_breach_probability * 100).toFixed(1)}%`} foot={threshold == null ? "Waiting for a forecast" : `Simulation estimate · threshold ${money(threshold, currency)}`} icon="◎" />
    </div></section>

    <section className="dashboard-grid" aria-label="Forecast and explanation"><article className="card chart-card"><div className="section-heading mb-4"><div><p className="eyebrow">30-DAY OUTLOOK · {currency}</p><h2>Cash balance forecast</h2><p>Monte Carlo model output. Future income defaults to zero.</p></div><div className="chart-meta"><span className="chart-key"><i/> Median</span><span className="chart-key range"><i/> P15–P85 range</span></div></div><ForecastChart data={forecast?.chart_data || []}/><p className="mt-2 text-[9px] leading-relaxed text-slate-500">A forecast is conditional on the expense and emergency assumptions listed in Forecast. No future receipt is included unless you explicitly add one in a what-if scenario.</p></article>
      <article className="card insight-card"><span className="insight-label"><i>✦</i> MODEL EXPLAINED</span><h3>{forecast?.reserve_breach_probability == null ? "Waiting for usable source data." : forecast.reserve_breach_probability > 0.25 ? "Review the reserve scenario assumptions." : "The modeled reserve path stays above threshold in most runs."}</h3><p>The reserve signal is a simulation statistic, not a probability that a real-world event will occur. Use the forecast page to review assumptions and the Monte Carlo sampling interval.</p><div className="insight-stat"><strong>{forecast?.reserve_breach_probability == null ? "—" : `${(forecast.reserve_breach_probability * 100).toFixed(1)}%`}</strong><span>modeled any-day reserve<br/>breach rate</span></div><Link className="subtle-link mt-4" to="/insights">Read the full explanation →</Link></article></section>

    <section aria-labelledby="actions-title"><div className="section-heading mb-3"><div><p className="eyebrow">MAKE THE NEXT STEP</p><h2 id="actions-title">Your workspace</h2></div></div><div className="quick-actions"><QuickAction to="/transactions" icon="≡" title="Review transactions" detail={demo ? "Inspect checked-in sandbox evidence" : "Inspect live PayPal Transaction Search results"}/><QuickAction to="/recurring" icon="↻" title="Find recurring payments" detail="Review repeat-payment patterns"/><QuickAction to="/anomalies" icon="△" title="Check unusual activity" detail="Open explainable anomaly review"/></div></section>

    <section className="dashboard-lower" aria-label="Scenario and recent activity"><div><div className="section-heading mb-3"><div><p className="eyebrow">DECISION WORKBENCH</p><h2>Test a what-if scenario</h2></div><Link className="subtle-link" to="/forecast">More forecast tools →</Link></div><ScenarioSimulator forecast={forecast}/></div><div><div className="section-heading mb-3"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>{demo ? "Recent evidence" : "Recent PayPal transactions"}</h2></div><Link className="subtle-link" to="/transactions">View ledger →</Link></div>{transactionsQuery.isError ? <div className="card text-sm text-red-700">{transactionsQuery.error.message}</div> : transactionsQuery.isLoading ? <div role="status" className="card text-sm text-slate-500">Loading recent activity…</div> : <TransactionTable transactions={transactionsQuery.data?.data || []}/>}</div></section>
  </div>
}
