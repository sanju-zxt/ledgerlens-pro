import { useQuery } from "@tanstack/react-query"

const statusLabel = status => status === "NOT EVALUABLE" ? "Not evaluable" : status[0] + status.slice(1).toLowerCase()
const statusClass = status => ({ PASS: "score-status pass", WARNING: "score-status warning", FAIL: "score-status fail", "NOT EVALUABLE": "score-status unavailable" })[status] || "score-status unavailable"

async function loadReport() {
  const response = await fetch(`/quality-scorecard.json?refresh=${Date.now()}`, { cache: "no-store" })
  if (!response.ok) throw new Error("Quality report is not available. Run npm run quality:report to generate it.")
  return response.json()
}

function MetricTable({ metrics }) {
  return <div className="score-table-wrap"><table className="score-table">
    <thead><tr><th>Metric</th><th>Original value</th><th>Current measured value</th><th>Target</th><th>Improvement / limitation</th><th>Evidence source</th><th>Sample size</th><th>Last evaluation</th><th>Status</th></tr></thead>
    <tbody>{metrics.map(item => <tr key={item.id}>
      <th scope="row">{item.name}{item.note && <small className="score-note">{item.note}</small>}</th>
      <td>{item.originalValue}</td><td className="score-value">{item.currentValue ?? "—"}</td><td>{item.target}</td><td>{item.improvement}</td><td>{item.measurementSource}</td><td>{item.sampleSize}</td><td>{new Date(item.lastEvaluatedAt).toLocaleString()}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td>
    </tr>)}</tbody>
  </table></div>
}

export default function EngineeringScorecard() {
  const report = useQuery({ queryKey: ["engineering-scorecard"], queryFn: loadReport, staleTime: 0, retry: 1 })
  const counts = (report.data?.metrics || []).reduce((result, item) => ({ ...result, [item.status]: (result[item.status] || 0) + 1 }), {})

  return <section className="scorecard-page">
    <header className="scorecard-header"><div><p className="eyebrow">ENGINEERING QUALITY</p><h1 className="page-title">Quality scorecard</h1><p className="page-lede">Measured engineering and model evidence against your target standards. There is no composite score: test pass rate, coverage, security, calculation correctness and model performance are separate measures.</p></div><button className="btn-secondary" onClick={() => report.refetch()} disabled={report.isFetching}>{report.isFetching ? "Refreshing…" : "Refresh report"}</button></header>
    {report.isLoading && <div role="status" className="card">Loading the latest generated quality report…</div>}
    {report.error && <div role="alert" className="card score-error">{report.error.message}</div>}
    {report.data && <>
      <div className="scorecard-summary" aria-label="Metric status counts">
        <span><strong>{counts.PASS || 0}</strong> pass</span><span><strong>{counts.WARNING || 0}</strong> warning</span><span><strong>{counts.FAIL || 0}</strong> fail</span><span><strong>{counts["NOT EVALUABLE"] || 0}</strong> not evaluable</span>
      </div>
      <div className="scorecard-caution"><strong>Evidence first.</strong> Missing, nonrepresentative or non-independent evidence is marked NOT EVALUABLE. A descriptive number does not count as a target pass. Evidence integrity checks verify file hashes and sizes only; they do not prove data provenance or representativeness.</div>
      <div className="card scorecard-card"><div className="scorecard-meta"><div><h2>All target metrics</h2><p>Generated {new Date(report.data.generatedAt).toLocaleString()} · {report.data.metrics.length} metrics evaluated</p></div><a className="subtle-link" href="/quality-scorecard.json" target="_blank" rel="noreferrer">View JSON report ↗</a></div><MetricTable metrics={report.data.metrics}/></div>
      <div className="scorecard-footnote"><strong>Calibration context:</strong> Brier score and ECE can be descriptive on the supplied labels, but target status remains NOT EVALUABLE without representative independent data. No forecast accuracy, tenant isolation, API service level or anomaly score is inferred from unrelated tests.</div>
    </>}
  </section>
}
