const view = { width: 420, height: 300, left: 48, top: 20, plot: 228 }

export function ReliabilityChart({ bins = [] }) {
  const points = bins.filter(bin => bin.count > 0 && Number.isFinite(bin.mean_prediction) && Number.isFinite(bin.observed_rate))
  const coordinates = points.map(bin => ({
    x: view.left + bin.mean_prediction * view.plot,
    y: view.top + (1 - bin.observed_rate) * view.plot,
    ...bin
  }))
  const path = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")
  return <div className="reliability-chart-wrap">
    <svg className="reliability-chart" viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label="Reliability diagram comparing average predicted probability with observed event rate">
      <title>Reliability diagram</title>
      <desc>The diagonal is perfect calibration. Points show observed rates for equal-width probability bins in the checked-in labeled dataset.</desc>
      {[0, 0.25, 0.5, 0.75, 1].map(tick => {
        const x = view.left + tick * view.plot
        const y = view.top + (1 - tick) * view.plot
        return <g key={tick}><line x1={view.left} y1={y} x2={view.left + view.plot} y2={y} stroke="#e7eeeb"/><line x1={x} y1={view.top} x2={x} y2={view.top + view.plot} stroke="#eef2f0"/><text x={x} y={view.top + view.plot + 18} textAnchor="middle">{tick.toFixed(2)}</text><text x={view.left - 9} y={y + 3} textAnchor="end">{tick.toFixed(2)}</text></g>
      })}
      <line x1={view.left} y1={view.top + view.plot} x2={view.left + view.plot} y2={view.top} stroke="#98aaa4" strokeWidth="1.5" strokeDasharray="5 5"/>
      {path && <path d={path} fill="none" stroke="#17816d" strokeWidth="2.5" strokeLinejoin="round"/>}
      {coordinates.map(point => <g key={`${point.lower}-${point.upper}`}><circle cx={point.x} cy={point.y} r="5" fill="#17816d" stroke="#fff" strokeWidth="2"/><title>{`${(point.lower * 100).toFixed(0)}–${(point.upper * 100).toFixed(0)}% bin · predicted ${(point.mean_prediction * 100).toFixed(1)}% · observed ${(point.observed_rate * 100).toFixed(1)}% · n=${point.count}`}</title></g>)}
      <text x={view.left + view.plot / 2} y={view.height - 5} textAnchor="middle">Mean predicted probability</text>
      <text x="13" y={view.top + view.plot / 2} textAnchor="middle" transform={`rotate(-90 13 ${view.top + view.plot / 2})`}>Observed event rate</text>
    </svg>
    <div className="calibration-legend"><span><i className="calibration-diagonal"/> Perfect calibration</span><span><i/> Observed sample</span></div>
    {!points.length && <p className="text-sm text-slate-500">No populated bins to chart.</p>}
  </div>
}
