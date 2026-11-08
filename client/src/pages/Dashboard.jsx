import { useQuery } from "@tanstack/react-query"
import { FinancialSummary } from "../components/FinancialSummary"
import { TransactionTable } from "../components/TransactionTable"
import { ScenarioSimulator } from "../components/ScenarioSimulator"
import { ForecastChart } from "../components/ForecastChart"
import { api } from "../services/api"

export default function Dashboard() {
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: () => api.get("/dashboard/summary") })
  const { data: transactions } = useQuery({ queryKey: ["transactions", "recent"], queryFn: () => api.get("/transactions?limit=10") })
  const { data: forecast } = useQuery({ queryKey: ["forecast"], queryFn: () => api.get("/forecast") })

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Financial Dashboard</h1>
        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">Live</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinancialSummary title="Available Balance" value={summary?.available_balance || 0} currency="USD" trend={summary?.balance_trend} />
        <FinancialSummary title="30-Day Forecast" value={forecast?.day_30_balance || 0} currency="USD" trend={forecast?.trend} />
        <FinancialSummary title="Runway" value={forecast?.runway_days || 0} suffix="days" trend={forecast?.runway_trend} />
        <FinancialSummary title="Risk Score" value={forecast?.risk_score || 0} suffix="/100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScenarioSimulator forecast={forecast} />
        <TransactionTable transactions={transactions?.data || []} />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">30-Day Forecast</h2>
        <ForecastChart data={forecast?.chart_data || []} />
      </div>
    </div>
  )
}
