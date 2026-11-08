export function TransactionTable({ transactions }) {
  const formatAmount = (amount, type) => {
    const color = type === "CREDIT" ? "text-green-600" : "text-red-600"
    const prefix = type === "CREDIT" ? "+" : "-"
    return <span className={`font-mono font-medium ${color}`}>{prefix}${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
  }
  const getSourceBadge = (source) => {
    const styles = { API_CONFIRMED: "bg-blue-100 text-blue-800", USER_ENTERED: "bg-yellow-100 text-yellow-800", PREDICTED: "bg-purple-100 text-purple-800" }
    return <span className={`px-2 py-0.5 text-xs rounded-full ${styles[source] || "bg-slate-100 text-slate-800"}`}>{source}</span>
  }
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-left text-sm text-slate-500 border-b border-slate-100"><th className="pb-2">Date</th><th className="pb-2">Description</th><th className="pb-2 text-right">Amount</th><th className="pb-2">Source</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((tx, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="py-3 text-sm text-slate-600">{new Date(tx.date).toLocaleDateString()}</td>
                <td className="py-3 text-sm text-slate-900">{tx.description}</td>
                <td className="py-3 text-right">{formatAmount(tx.amount, tx.type)}</td>
                <td className="py-3">{getSourceBadge(tx.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
