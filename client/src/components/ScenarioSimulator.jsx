import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api } from "../services/api"

export function ScenarioSimulator({ forecast }) {
  const [scenarios, setScenarios] = useState({ delay_days: 0, emergency_amount: 0, cost_reduction: 0 })
  const simulate = useMutation({ mutationFn: (data) => api.post("/forecast/simulate", data) })

  const handleChange = (key, value) => setScenarios(prev => ({ ...prev, [key]: Number(value) }))
  const runSimulation = () => simulate.mutate(scenarios)

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Scenario Simulator</h3>
      <div className="space-y-4 mb-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">Delay Income (days): {scenarios.delay_days}</label>
          <input type="range" min="0" max="14" value={scenarios.delay_days} onChange={(e) => handleChange("delay_days", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Emergency Expense ($): {scenarios.emergency_amount.toLocaleString()}</label>
          <input type="range" min="0" max="5000" step="100" value={scenarios.emergency_amount} onChange={(e) => handleChange("emergency_amount", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Cost Reduction ($): {scenarios.cost_reduction.toLocaleString()}</label>
          <input type="range" min="0" max="2000" step="50" value={scenarios.cost_reduction} onChange={(e) => handleChange("cost_reduction", e.target.value)} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
        </div>
      </div>
      <button onClick={runSimulation} disabled={simulate.isPending} className="btn-primary w-full">
        {simulate.isPending ? "Simulating..." : "Run Simulation"}
      </button>
    </div>
  )
}
