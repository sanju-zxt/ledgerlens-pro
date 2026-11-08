import { useQuery } from "@tanstack/react-query"
import { FinancialSummary } from "../components/FinancialSummary"
import { TransactionTable } from "../components/TransactionTable"
import { ScenarioSimulator } from "../components/ScenarioSimulator"
import { ForecastChart } from "../components/ForecastChart"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"

export default function Dashboard() {
  const { user } = useAuth()
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery({ queryKey: ["summary"], queryFn: () => api.get("/dashboard/summary") })
  const { data: transactions, isLoading: transactionsLoading, error: transactionsError } = useQuery({ queryKey: ["transactions", "recent"], queryFn: () => api.get("/transactions?limit=10") })
  const { data: forecast, isLoading: forecastLoading, error: forecastError } = useQuery({ queryKey: ["forecast"], queryFn: () => api.get("/forecast") })

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><p className="text-sm font-medium text-primary-600">Good to see you, {user?.email}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Financial overview</h1></div>
        <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-full text-sm">Sandbox evidence · as of Oct 15, 2026</span>
      </div>

      {(summaryError || transactionsError || forecastError) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Some dashboard data could not be loaded: {[summaryError, transactionsError, forecastError].filter(Boolean).map(error => error.message).join(" · ")}</div>}
      {(summaryLoading || transactionsLoading || forecastLoading) && <div role="status" className="text-sm text-slate-500">Loading financial data…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <FinancialSummary title="Ledger Closing Balance" value={summary?.closing_balance || 0} currency="USD" />
        <FinancialSummary title="30-Day Forecast Median" value={forecast?.ending_balance?.median || 0} currency="USD" />
        <div className="card"><p className="text-sm text-slate-500 mb-1">Reserve runway</p><p className="text-3xl font-bold text-slate-900">{forecast?.reserve_runway_days_p50 == null ? "30+" : forecast.reserve_runway_days_p50.toFixed(0)} <span className="text-base font-normal text-slate-500">days</span></p><p className="mt-2 text-xs text-slate-500">Median day balance falls below $1,000</p></div>
        <FinancialSummary title="Chance of reserve dip" value={(forecast?.reserve_breach_probability || 0) * 100} suffix="%" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScenarioSimulator forecast={forecast} />
        <TransactionTable transactions={transactions?.data || []} />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-1">30-Day Forecast</h2><p className="mb-4 text-sm text-slate-500">10,000 seeded simulations · illustrative $3,500 future inflow assumption</p>
        <ForecastChart data={forecast?.chart_data || []} />
      </div>
    </div>
  )
}
