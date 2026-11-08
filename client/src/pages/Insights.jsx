import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"
import { DecisionSupport } from "../components/DecisionSupport"

export default function Insights() {
  const { user } = useAuth()
  const demo = Boolean(user?.demo)
  const balance = useQuery({ queryKey: ["summary", demo ? "evidence" : "paypal"], queryFn: () => api.get("/dashboard/summary") })
  const balances = balance.data?.balances || []
  const currency = demo ? balance.data?.currency || "USD" : balances[0]?.currency
  const forecast = useQuery({ queryKey: ["forecast", demo ? "evidence" : "paypal", currency], queryFn: () => api.get(`/forecast${demo ? "" : `?currency_code=${encodeURIComponent(currency)}`}`), enabled: demo || Boolean(currency) })
  const calibration = useQuery({ queryKey: ["calibration-evidence"], queryFn: () => api.get("/analysis/calibration") })
  if (balance.isLoading || (demo && forecast.isLoading) || (!demo && currency && forecast.isLoading) || calibration.isLoading) return <div role="status" className="card">Preparing evidence-backed insights…</div>
  if (balance.error || forecast.error || calibration.error) return <div role="alert" className="card text-red-700">{balance.error?.message || forecast.error?.message || calibration.error?.message}</div>
  if (!currency) return <div role="status" className="card">No balance currency is available. Review the PayPal data source in Settings.</div>

  const data = forecast.data
  const risk = data.reserve_breach_probability
  const calibrationData = calibration.data
  const assumptions = data.provenance.assumptions
  const selectedBalance = balances.find(item => item.currency === currency)
  const closingBalance = demo ? balance.data.closing_balance : selectedBalance?.available_balance
  const money = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value)) : "—"
  const asOf = data.source_balance.as_of ? new Date(data.source_balance.as_of) : null
  const asOfLabel = asOf && !Number.isNaN(asOf.getTime()) ? asOf.toLocaleString() : "not supplied by source"
  return <section className="space-y-5"><header><p className="text-sm font-semibold uppercase tracking-wider text-primary-600">Explainable finance</p><h1 className="mt-1 text-3xl font-bold">Financial insights</h1><p className="mt-2 text-slate-500">Each statement below identifies its source or its simulation assumptions.</p></header><div className="grid gap-4 md:grid-cols-2"><article className="card"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{demo ? "Historical evidence" : "PayPal balance snapshot"}</p><h2 className="mt-2 text-lg font-semibold">{demo ? "Evidence ledger closes at " : `${currency} available balance is `}{money(closingBalance)}</h2><p className="mt-2 text-sm text-slate-600">{demo ? "The included sandbox movement ledger is reconciled independently. The debit is not independently classified as a processing fee." : "This is the available amount reported by PayPal. It is not the same as total balance, and withheld funds are excluded from the forecast opening amount."}</p><p className="mt-3 text-xs text-slate-500">Source: {demo ? "evidence/balance_logs.csv" : "PayPal Reporting balances"} · as of {asOfLabel}</p></article><article className="card"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modeled result</p><h2 className="mt-2 text-lg font-semibold">{(risk * 100).toFixed(1)}% simulated chance of dipping below {money(data.reserve_threshold)}</h2><p className="mt-2 text-sm text-slate-600">Share of seeded paths that cross the reserve threshold at any time in the next {data.horizon_days} days. This is not a real-world event rate.</p><p className="mt-3 text-xs text-slate-500">{data.simulations.toLocaleString()} paths · seed {data.provenance.seed} · ending P15–P85 interval</p></article><article className="card"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Future receipt assumptions</p><h2 className="mt-2 text-lg font-semibold">Baseline future income is {money(assumptions.paymentAmount)}</h2><p className="mt-2 text-sm text-slate-600">No future receipt is modeled by default. You can add an explicit hypothetical receipt in the scenario simulator; it is not verified as scheduled.</p><p className="mt-3 text-xs text-slate-500">Scenario-only user input · not a PayPal transaction</p></article><article className="card"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calibration evidence</p><h2 className="mt-2 text-lg font-semibold">{calibrationData.n_samples.toLocaleString()} labeled rows · Brier {calibrationData.brier_score.toFixed(4)}</h2><p className="mt-2 text-sm text-slate-600">Equal-width ECE: {(calibrationData.expected_calibration_error * 100).toFixed(1)}%. These scores describe the labeled calibration file, not forecast accuracy; raw backtest outcome files are absent, so forecast accuracy remains unvalidated.</p><p className="mt-3 text-xs text-slate-500">Source: {calibrationData.source} · <Link className="subtle-link" to="/model-quality">View calculation details →</Link></p></article></div><DecisionSupport forecast={data}/></section>
}
