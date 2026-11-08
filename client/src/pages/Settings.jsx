import { useQuery } from "@tanstack/react-query"
import { api } from "../services/api"

const evidenceFiles = [
  ["/api/evidence/balance_logs.csv", "Balance ledger CSV"],
  ["/api/evidence/backtest.csv", "Backtest windows CSV"],
  ["/api/evidence/calibration_data.csv", "Calibration data CSV"],
  ["/api/evidence/paypal-balance", "PayPal balance fixture"],
  ["/api/evidence/manifest", "SHA-256 manifest"]
]

export default function Settings() {
  const status = useQuery({ queryKey: ["paypal-status"], queryFn: () => api.get("/paypal/status"), retry: false })
  const balance = useQuery({ queryKey: ["paypal-balance"], queryFn: () => api.get("/paypal/balances"), enabled: Boolean(status.data?.configured), retry: false })
  return <section className="space-y-5">
    <header><p className="text-sm font-semibold uppercase tracking-wider text-primary-600">Workspace</p><h1 className="mt-1 text-3xl font-bold">Settings & data sources</h1><p className="mt-2 text-slate-500">Connection status, source freshness and evidence integrity.</p></header>
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">LIVE DATA SOURCE</p><h2 className="mt-2 text-lg font-semibold">PayPal Reporting API</h2><p className="mt-1 text-sm text-slate-500">Server-to-server Client Credentials integration using PayPal reporting scopes. Environment-variable presence does not confirm that PayPal has granted access.</p></div><span className={`rounded-full px-3 py-1 text-sm ${status.data?.configured ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{status.isLoading ? "Checking…" : status.error ? "Status unavailable" : status.data?.configured ? `Credentials present · ${status.data.environment}` : status.data?.demoMode ? "Sandbox evidence only" : "Not configured"}</span></div>
      {status.error ? <p role="alert" className="mt-4 text-sm text-red-700">{status.error.message}</p> : <p className="mt-4 text-sm text-slate-600">{status.data?.note || "Checking API configuration…"}</p>}
      {!status.isLoading && !status.error && !status.data?.configured && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="text-sm font-semibold text-slate-800">Connect a PayPal Sandbox app</h3><ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600"><li>Create a Sandbox REST app in the PayPal Developer Dashboard.</li><li>Add <code>PAYPAL_ENV=sandbox</code>, <code>PAYPAL_CLIENT_ID</code> and <code>PAYPAL_CLIENT_SECRET</code> to the server environment.</li><li>Restart LedgerLens, then use “Fetch PayPal balances” when the credentials show as ready.</li></ol><p className="mt-2 text-[10px] text-slate-500">Credentials stay on the server. This uses PayPal server-to-server reporting access; it does not link a personal merchant account through a consent screen.</p></div>}
      {status.data?.configured && <button className="btn-primary mt-4" onClick={() => balance.refetch()} disabled={balance.isFetching}>{balance.isFetching ? "Refreshing…" : "Fetch PayPal balances"}</button>}
      {balance.error && <p role="alert" className="mt-3 text-sm text-red-700">{balance.error.message}</p>}
      {balance.data && <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm"><p>Retrieved: {new Date(balance.data.provenance.retrieved_at).toLocaleString()}</p><p className="mt-1">{balance.data.provenance.freshness_note}</p>{balance.data.balances?.map((item, index) => <p key={index} className="mt-2">{item.currency}: available {item.available_balance?.value}, withheld {item.withheld_balance?.value}, total {item.total_balance?.value}</p>)}</div>}
    </div>
    <div className="card"><h2 className="text-lg font-semibold">Evidence package</h2><p className="mt-2 text-sm text-slate-600">Read-only source files and their generated manifest. Evidence stays separate from model output.</p><div className="mt-4 flex flex-wrap gap-3">{evidenceFiles.map(([href, label]) => <a key={href} className="btn-secondary" href={href} target="_blank" rel="noreferrer">{label}</a>)}</div><p className="mt-3 text-xs text-amber-800">The backtest references raw source CSVs that are not present in this repository. Its outcomes cannot be independently reproduced from the checked-in files.</p></div>
  </section>
}
