import { useQuery } from "@tanstack/react-query"

const display = value => typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "NOT EVALUABLE"

function Table({ title, rows }) {
  const tierNames = [...new Set(rows.flatMap(row => row.tiers?.map(tier => tier.tier) || []))]
  return <article className="card">
    <div className="section-heading"><div><h2>{title}</h2><p>Tier checks compare only measured values. A measured value may still be descriptive rather than representative evidence.</p></div></div>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Metric</th><th className="p-2">Current</th>{tierNames.map(name => <th className="p-2" key={name}>{name}</th>)}<th className="p-2">Evidence</th></tr></thead>
      <tbody>{rows.map(row => <tr className="border-b border-slate-100 align-top" key={row.name}><td className="p-2 font-semibold">{row.name}</td><td className="p-2">{row.display_value ?? display(row.current_value)}<div className="mt-1 text-slate-500">n={row.sample_size ?? "—"}</div></td>
        {(row.tiers || []).map(tier => <td className="p-2" key={tier.tier}><div>{tier.target}</div><div className={`mt-1 font-bold ${tier.status === "MEETS" ? "text-emerald-700" : tier.status === "BELOW" ? "text-rose-700" : "text-amber-700"}`}>{tier.status}</div></td>)}
        <td className="max-w-sm p-2 text-slate-600"><div>{row.measurement_source || "—"}</div><div className="mt-1">Period: {row.evaluation_period?.start || "not available"}{row.evaluation_period?.end ? ` → ${row.evaluation_period.end}` : ""}</div><div>Dataset: {row.dataset_version || "not available"}</div><div>Model: {row.model_version || "not supplied"}</div><div>Evaluated: {row.last_evaluated_at || "not available"}</div>{row.reason && <div className="mt-1 text-amber-800">{row.reason}</div>}</td></tr>)}</tbody></table></div>
  </article>
}

export default function TargetScorecard({ experiment, backtest, dataset }) {
  const report = useQuery({ queryKey: ["quality-target-scorecard"], queryFn: async () => {
    const response = await fetch("/quality-scorecard.json", { cache: "no-cache" })
    if (!response.ok) throw new Error("Scorecard report is unavailable")
    return response.json()
  } })
  if (!report.data?.targetScorecard) return <article className="card"><h2 className="font-semibold">Quantitative target tiers</h2><p className="mt-2 text-sm text-amber-800">{report.isLoading ? "Loading measured target report…" : "Generated target report is unavailable. Rebuild the application to generate it."}</p></article>

  const target = report.data.targetScorecard
  let classification = target.classification
  if (experiment?.status === "EVALUATED") {
    const m = experiment.test_metrics
    const values = { "ROC-AUC": m.roc_auc, "PR-AUC": m.pr_auc, "Precision": m.precision, "Recall": m.recall, "F1-score": m.f1, "Brier score": m.brier, "Log loss": m.log_loss, ECE: m.ece_equal_width_10 }
    classification = classification.map(row => values[row.name] == null ? row : { ...row, current_value: values[row.name], display_value: ["Brier score", "Log loss"].includes(row.name) ? values[row.name].toFixed(6) : display(values[row.name]), sample_size: m.sample_size, measurement_source: "Untouched chronological test split", dataset_version: experiment.dataset?.dataset_version, model_version: experiment.model_version, evaluation_period: m.evaluation_period, last_evaluated_at: experiment.created_at, status: "MEASURED", reason: "Held-out tenant dataset; sample limitations still apply." })
  }

  const forecasts = target.forecasting.map(row => {
    const match = (backtest?.results || []).filter(item => item.status === "EVALUATED").map(item => {
      const values = { WAPE: item.wape, "Normalized MAE": item.typical_balance ? item.mae / item.typical_balance : null, "Normalized RMSE": item.typical_balance ? item.rmse / item.typical_balance : null, "Absolute bias": item.bias == null ? null : Math.abs(item.bias), "70% interval coverage": item.prediction_interval_coverage?.["70_percent"], "90% interval coverage": item.prediction_interval_coverage?.["90_percent"] }
      return { row, item, value: values[row.name] }
    }).find(x => x.value != null)
    if (!match) return row
    return { ...row, current_value: match.value, display_value: display(match.value), sample_size: match.item.sample_size, dataset_version: match.item.dataset_version, model_version: match.item.model_versions?.join(", "), evaluation_period: match.item.evaluation_period, last_evaluated_at: match.item.last_evaluated_at, status: "MEASURED", reason: "Walk-forward outcomes matched to live forecast snapshots." }
  })
  const baselineImprovements = target.improvement_over_baseline.map(row => {
    let value = null, source = "Independent chronological held-out model and baseline comparison", sampleSize = 0, datasetVersion = null, modelVersion = null, period = { start: null, end: null }, evaluatedAt = null
    if (experiment?.status === "EVALUATED" && row.name === "Brier skill") value = experiment.test_metrics.brier_skill_vs_training_prevalence
    if (experiment?.status === "EVALUATED" && row.name === "Log-loss skill") value = experiment.test_metrics.log_loss_skill_vs_training_prevalence
    const forecast = (backtest?.results || []).find(item => item.status === "EVALUATED")
    if (forecast && row.name === "Forecast MAE improvement") value = forecast.mae_improvement_vs_baseline
    if (forecast && row.name === "Forecast RMSE improvement") value = forecast.rmse_improvement_vs_baseline
    const modelMetrics = experiment?.status === "EVALUATED" && ["Brier skill", "Log-loss skill"].includes(row.name) ? experiment.test_metrics : null
    const meta = modelMetrics || forecast
    if (meta && value != null) { sampleSize = meta.sample_size; datasetVersion = modelMetrics ? meta.dataset_version : meta.dataset_version; modelVersion = modelMetrics ? meta.model_version : meta.model_versions?.join(", "); period = meta.evaluation_period; evaluatedAt = meta.last_evaluated_at; source = modelMetrics ? "Untouched chronological test split vs training-period prevalence baseline" : "Walk-forward forecast vs current-balance persistence baseline" }
    const tiers = row.tiers.map((tier, index) => ({ ...tier, status: value == null ? "NOT EVALUABLE" : value > (index === 0 ? 0.10 : 0.20) ? "MEETS" : "BELOW" }))
    return { ...row, current_value: value, display_value: display(value), sample_size: sampleSize, measurement_source: source, dataset_version: datasetVersion, model_version: modelVersion, evaluation_period: period, last_evaluated_at: evaluatedAt, tiers, reason: value == null ? row.reason : "Baseline skill is specific to this tenant and evaluation period; it does not establish cross-merchant generalization." }
  })
  const dataRequirements = target.data_requirements.map(row => {
    if (row.name === "Total reviewed transactions" && dataset) return { ...row, current: String(dataset.sample_size), sample_size: dataset.sample_size, dataset_version: dataset.dataset_version, measurement_source: "Tenant-scoped human-reviewed transaction labels", reason: `Dataset status: ${dataset.status}; duplicate verified hashes: ${dataset.duplicate_transaction_hashes}; evaluation period ${dataset.time_coverage?.start || "not available"} → ${dataset.time_coverage?.end || "not available"}.` }
    if (row.name === "Reviewed unusual transactions" && dataset) return { ...row, current: String(dataset.class_distribution.positive), sample_size: dataset.sample_size, dataset_version: dataset.dataset_version, measurement_source: "Tenant-scoped human-reviewed transaction labels", reason: "Positive label count from source-verified human review; this is not a fraud label." }
    if (row.name === "Reviewed expected transactions" && dataset) return { ...row, current: String(dataset.class_distribution.negative), sample_size: dataset.sample_size, dataset_version: dataset.dataset_version, measurement_source: "Tenant-scoped human-reviewed transaction labels", reason: "Negative label count from source-verified human review." }
    if (row.name === "Forecast matched snapshots" && backtest?.results?.length) {
      const perHorizon = backtest.results.map(item => `${item.horizon_days}d: ${item.sample_size}`)
      return { ...row, current: perHorizon.join("; "), sample_size: Math.min(...backtest.results.map(item => item.sample_size)), measurement_source: "Walk-forward matched forecast snapshots by horizon", dataset_version: backtest.results.map(item => item.dataset_version).filter(Boolean).join(", ") || null, reason: "Snapshot counts by horizon; repeated merchant forecasts may be correlated and do not alone establish statistical power." }
    }
    return row
  })
  return <section className="space-y-4" aria-label="Quantitative engineering quality targets"><header><p className="eyebrow">ASPIRATIONAL ENGINEERING TARGETS</p><h2 className="text-xl font-bold">Measured score vs target</h2><p className="text-sm text-slate-600">The two thresholds are the next target and excellent target. No aggregate score is calculated. Brier, log loss and ECE are computed on the supplied rows; their results remain sample-specific. Classification metrics require both outcome classes. PR-AUC depends on positive-class prevalence.</p></header>
    <Table title="Classification" rows={classification}/><Table title="Forecasting" rows={forecasts}/><Table title="Improvement over baseline" rows={baselineImprovements}/><Table title="Overall data and engineering quality" rows={target.engineering_evidence}/>
    <article className="card"><div className="section-heading"><div><h2>Data collection gates</h2><p>Operational minimums and recommended sample sizes for future evaluations. Meeting the count does not guarantee representative data or a reliable score.</p></div></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Evaluation</th><th className="p-2">Current measured</th><th className="p-2">Minimum gate</th><th className="p-2">Recommended</th><th className="p-2">Source and limitation</th></tr></thead><tbody>{dataRequirements.map(row => <tr className="border-b border-slate-100 align-top" key={row.name}><td className="p-2 font-semibold">{row.name}</td><td className="p-2">{row.current}<div className="text-slate-500">n={row.sample_size}</div></td><td className="p-2">{row.minimum}</td><td className="p-2">{row.recommended}</td><td className="p-2 text-slate-600">{row.measurement_source}<div className="mt-1">Dataset: {row.dataset_version || "not available"} · evaluated: {row.last_evaluated_at}</div><div className="mt-1 text-amber-800">{row.reason}</div></td></tr>)}</tbody></table></div></article>
  </section>
}
