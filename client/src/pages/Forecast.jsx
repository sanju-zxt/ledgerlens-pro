import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"
import { ForecastChart } from "../components/ForecastChart"
import { ScenarioSimulator } from "../components/ScenarioSimulator"

const money = (value, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value)
const probability = value => value > 0 && value < 0.001 ? "<0.1%" : `${(value * 100).toFixed(1)}%`

export default function Forecast() {
  const { user } = useAuth()
  const demo = Boolean(user?.demo)
  const [currencyChoice, setCurrencyChoice] = useState("")
  const source = useQuery({ queryKey: ["summary", demo ? "evidence" : "paypal"], queryFn: () => api.get("/dashboard/summary") })
  const balances = source.data?.balances || []
  const currency = demo ? source.data?.currency || "USD" : currencyChoice || balances[0]?.currency
  const forecastQuery = useQuery({ queryKey: ["forecast", demo ? "evidence" : "paypal", currency], queryFn: () => api.get(`/forecast${demo ? "" : `?currency_code=${encodeURIComponent(currency)}`}`), enabled: demo || Boolean(currency) })
  const data = forecastQuery.data
  const error = source.error || forecastQuery.error
  const isLoading = source.isLoading || (demo ? forecastQuery.isLoading : Boolean(currency) && forecastQuery.isLoading)
  const assumptions = data?.provenance?.assumptions

  return <section className="space-y-5"><header><p className="text-sm font-semibold uppercase tracking-wider text-primary-600">Planning · simulation</p><h1 className="mt-1 text-3xl font-bold">30-day cash-flow forecast</h1><p className="mt-2 text-slate-500">A reproducible Monte Carlo scenario based on a sourced opening balance. Results are estimates, not guarantees.</p></header>
    {!demo && balances.length > 1 && <label className="block max-w-xs text-sm font-medium text-slate-700">Forecast currency<select className="input-field mt-1" value={currency} onChange={event => setCurrencyChoice(event.target.value)}>{balances.map(item => <option key={item.currency} value={item.currency}>{item.currency}</option>)}</select></label>}
    {isLoading ? <div role="status" className="card">Loading the selected PayPal balance and running the forecast…</div> : error ? <div role="alert" className="card text-red-700">{error.message}</div> : !currency ? <div role="status" className="card">No currency balance is available for forecasting.</div> : data && <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div className="card"><p className="text-sm text-slate-500">Ending median · day {data.horizon_days}</p><p className="mt-2 text-2xl font-semibold">{money(data.ending_balance.median, currency)}</p><p className="mt-1 text-xs text-slate-500">Mean: {money(data.ending_balance.mean, currency)}</p></div><div className="card"><p className="text-sm text-slate-500">70% modeled interval · P15–P85</p><p className="mt-2 text-xl font-semibold">{money(data.ending_balance.p15, currency)} – {money(data.ending_balance.p85, currency)}</p><p className="mt-1 text-xs text-slate-500">Ending balance across simulated paths</p></div><div className="card"><p className="text-sm text-slate-500">Any-day reserve breach</p><p className="mt-2 text-2xl font-semibold">{probability(data.reserve_breach_probability)}</p><p className="mt-1 text-xs text-slate-500">95% Monte Carlo interval: {probability(data.reserve_breach_probability_95ci.lower)}–{probability(data.reserve_breach_probability_95ci.upper)}</p></div><div className="card"><p className="text-sm text-slate-500">Ending below reserve</p><p className="mt-2 text-2xl font-semibold">{probability(data.ending_below_reserve_probability)}</p><p className="mt-1 text-xs text-slate-500">Separate event · median first-breach day: {data.reserve_runway_days_p50 == null ? "not reached by at least half of paths" : `day ${data.reserve_runway_days_p50}`}</p></div></div>
      <div className="card"><h2 className="font-semibold">Modeled balance by day</h2><p className="mt-1 text-xs text-slate-500">Shaded band: P15–P85 of simulated paths · reserve threshold {money(data.reserve_threshold, currency)}</p><div className="mt-3"><ForecastChart data={data.chart_data} /></div></div>
      <div className="card"><h2 className="font-semibold">Assumptions and data source</h2><p className="mt-2 text-sm text-slate-600">Opening amount: {money(data.source_balance.amount, currency)} · source: {data.source_balance.source} · as of {data.source_balance.as_of ? new Date(data.source_balance.as_of).toLocaleString() : "not supplied by PayPal"}.</p><p className="mt-1 text-sm text-slate-600">{data.simulations.toLocaleString()} paths · seed {data.provenance.seed} · {data.provenance.method}. Baseline future receipt: {money(assumptions.paymentAmount, currency)}. No future receipt is assumed unless entered in a scenario.</p><p className="mt-1 text-sm text-slate-600">Operating expense assumption: Normal({money(assumptions.dailyExpenseMean, currency)}, {money(assumptions.dailyExpenseStd, currency)}) per day, clipped at zero. This generic planning assumption is not estimated from this account’s history. Emergency assumption: {(assumptions.emergencyProbability * 100).toFixed(1)}% chance per simulation path of {money(assumptions.emergencyAmount[0], currency)}–{money(assumptions.emergencyAmount[1], currency)}.</p><p className="mt-2 text-sm font-medium text-amber-800">This build has not fitted operating-expense assumptions from a merchant-specific history. Review and vary the assumptions before using the output for business decisions.</p>{!demo && <p className="mt-2 text-xs text-slate-500">PayPal app credentials access the associated app account. This build does not provide third-party merchant OAuth onboarding.</p>}</div>
      <ScenarioSimulator forecast={data}/></>}
  </section>
}
