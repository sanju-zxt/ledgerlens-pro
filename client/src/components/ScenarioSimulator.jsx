import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api } from "../services/api"

const dollars = (value, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value)

export function ScenarioSimulator({ forecast }) {
  const [scenarios, setScenarios] = useState({ expected_income: 0, delay_days: 0, emergency_amount: 0, cost_reduction: 0 })
  const simulate = useMutation({ mutationFn: (data) => api.post("/forecast/simulate", data) })
  const currency = forecast?.source_balance?.currency || "USD"
  const handleChange = (key, value) => setScenarios(prev => ({ ...prev, [key]: Number(value) }))
  const runSimulation = () => simulate.mutate({ ...scenarios, currency_code: currency })

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-2">Scenario simulator</h3>
      <p className="mb-4 text-xs text-slate-500">Every future receipt defaults to $0 until you enter an assumption. Changes affect this simulation only.</p>
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1" htmlFor="scenario-income">Assume a future receipt ({currency}): {dollars(scenarios.expected_income, currency)}</label>
          <input id="scenario-income" type="range" min="0" max="10000" step="100" value={scenarios.expected_income} onChange={(e) => handleChange("expected_income", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1" htmlFor="scenario-delay">Delay that assumed receipt: {scenarios.delay_days} days</label>
          <input id="scenario-delay" type="range" min="0" max="77" value={scenarios.delay_days} disabled={scenarios.expected_income === 0} onChange={(e) => handleChange("delay_days", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-40" />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1" htmlFor="scenario-emergency">Force emergency expense ({currency}; 0 keeps baseline risk): {dollars(scenarios.emergency_amount, currency)}</label>
          <input id="scenario-emergency" type="range" min="0" max="5000" step="100" value={scenarios.emergency_amount} onChange={(e) => handleChange("emergency_amount", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1" htmlFor="scenario-cost">Expense reduction over 30 days ({currency}): {dollars(scenarios.cost_reduction, currency)}</label>
          <input id="scenario-cost" type="range" min="0" max="2000" step="50" value={scenarios.cost_reduction} onChange={(e) => handleChange("cost_reduction", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
        </div>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">What-if only. This never schedules, sends, or changes a PayPal payment. Any receipt you enter is your assumption and is not verified by PayPal.</p>
      <button onClick={runSimulation} disabled={simulate.isPending || !forecast} className="btn-primary w-full">
        {simulate.isPending ? "Simulating…" : forecast ? "Run this scenario" : "Waiting for a forecast source"}
      </button>
      {simulate.error && <p role="alert" className="mt-3 text-sm text-red-700">{simulate.error.message}</p>}
      {simulate.data && <div className="mt-4 rounded-lg bg-slate-50 p-4"><p className="text-sm text-slate-500">Scenario ending median · day {simulate.data.horizon_days}</p><p className="text-2xl font-semibold">{dollars(simulate.data.ending_balance.median, currency)}</p><p className="mt-1 text-sm text-slate-600">P15–P85 range: {dollars(simulate.data.ending_balance.p15, currency)}–{dollars(simulate.data.ending_balance.p85, currency)}</p><p className="mt-1 text-xs text-slate-600">Any-day reserve breach: {(simulate.data.reserve_breach_probability * 100).toFixed(1)}% (95% interval {(simulate.data.reserve_breach_probability_95ci.lower * 100).toFixed(2)}–{(simulate.data.reserve_breach_probability_95ci.upper * 100).toFixed(2)}%)</p><p className="mt-1 text-xs text-slate-600">Ending below reserve: {(simulate.data.ending_below_reserve_probability * 100).toFixed(1)}%</p><p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">Compared with current baseline median: {dollars(simulate.data.ending_balance.median - forecast.ending_balance.median, currency)} · simulation only</p></div>}
    </div>
  )
}
