export function TransactionTable({ transactions }) {
  const formatAmount = (amount, type, currency) => {
    const numeric = Number(amount)
    if (!Number.isFinite(numeric)) return <span className="text-slate-400">—</span>
    const direction = type || (numeric < 0 ? "DEBIT" : "CREDIT")
    const color = direction === "CREDIT" ? "text-green-600" : direction === "DEBIT" ? "text-red-600" : "text-slate-600"
    const prefix = direction === "CREDIT" ? "+" : direction === "DEBIT" ? "−" : ""
    return <span className={`font-mono font-medium ${color}`}>{prefix}{Math.abs(numeric).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency || ""}</span>
  }
  const getSourceBadge = (source) => {
    const styles = { PAYPAL_TRANSACTION_SEARCH: "bg-emerald-100 text-emerald-900", SANDBOX_EVIDENCE: "bg-amber-100 text-amber-900", API_CONFIRMED: "bg-blue-100 text-blue-800", USER_ENTERED: "bg-yellow-100 text-yellow-800", PREDICTED: "bg-purple-100 text-purple-800" }
    return <span className={`px-2 py-0.5 text-xs rounded-full ${styles[source] || "bg-slate-100 text-slate-800"}`}>{source}</span>
  }
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Recent transactions</h3>
      {!transactions.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No transactions returned for this source. No example rows are substituted.</p> : <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-left text-sm text-slate-500 border-b border-slate-100"><th className="pb-2">Date</th><th className="pb-2">Description</th><th className="pb-2 text-right">Amount</th><th className="pb-2">Source</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((tx, i) => (
              <tr key={`${tx.id || "row"}:${tx.date || i}`} className="hover:bg-slate-50">
                <td className="py-3 text-sm text-slate-600">{new Date(tx.date).toLocaleDateString()}</td>
                <td className="py-3 text-sm text-slate-900">{tx.description}</td>
                <td className="py-3 text-right">{formatAmount(tx.amount, tx.type, tx.currency)}</td>
                <td className="py-3">{getSourceBadge(tx.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  )
}
