import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"

export default function Anomalies() {
  const { user } = useAuth()
  const [source, setSource] = useState(user?.demo ? "evidence" : "paypal")
  const analyze = useMutation({ mutationFn: async () => {
    const ledger = await api.get(`/transactions?limit=100${source === "paypal" ? "&source=paypal" : ""}`)
    return api.post("/analysis/anomalies", { transactions: ledger.data, source: ledger.source })
  } })
  return <section className="space-y-5"><header><p className="text-sm font-semibold uppercase tracking-wider text-primary-600">Review signals</p><h1 className="mt-1 text-3xl font-bold">Anomaly intelligence</h1><p className="mt-2 text-slate-500">Isolation Forest surfaces unusual transaction amounts for human review.</p></header><div className="card"><div className="flex flex-wrap items-end gap-4"><label className="text-sm font-medium">Transaction source<select className="input-field mt-1" value={source} onChange={event => setSource(event.target.value)}><option value="paypal">PayPal Reporting API</option><option value="evidence">Sandbox evidence fixture</option></select></label><button className="btn-primary" onClick={() => analyze.mutate()} disabled={analyze.isPending}>{analyze.isPending ? "Analyzing…" : "Analyze transactions"}</button></div>{analyze.error && <p role="alert" className="mt-4 text-sm text-red-700">{analyze.error.message}</p>}{analyze.data && <><p className="mt-4 text-sm text-slate-500">Checked {analyze.data.total_checked} records · {analyze.data.source} · {new Date(analyze.data.retrieved_at).toLocaleString()}</p>{!analyze.data.anomalies.length ? <div className="mt-4 rounded-lg bg-slate-50 p-5 text-sm text-slate-600">{analyze.data.message || "No statistical outliers were returned for this batch."}</div> : <div className="mt-4 space-y-3">{analyze.data.anomalies.map(item => <article key={item.index} className="rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="flex justify-between gap-3"><strong>{item.transaction.description}</strong><span className="font-mono">{item.transaction.amount} {item.transaction.currency || ""}</span></div><p className="mt-1 text-xs text-slate-600">Statistical outlier · anomaly score {item.score.toFixed(3)}</p></article>)}</div>}<p className="mt-4 text-xs text-amber-800">A statistical anomaly is not confirmed fraud. Investigate source records before taking action.</p></>}</div></section>
}
