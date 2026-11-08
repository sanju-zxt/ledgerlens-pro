import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { api } from "../services/api"
import { useAuth } from "../hooks/useAuth"

const features = [
  { to: "/transactions", icon: "≡", title: "Evidence ledger", detail: "Review sourced movements and reconciliation." },
  { to: "/forecast", icon: "↗", title: "Cash-flow forecast", detail: "Explore percentiles, reserve risk, and assumptions." },
  { to: "/model-quality", icon: "Σ", title: "Model quality", detail: "Inspect Brier, ECE, skill, and reliability bins." },
  { to: "/recurring", icon: "↻", title: "Recurring review", detail: "Find patterns only when repeated evidence supports them." },
  { to: "/anomalies", icon: "△", title: "Anomaly review", detail: "Inspect statistical outliers; no fraud labels are inferred." }
]

export default function Updates() {
  const { user } = useAuth()
  const connection = useQuery({ queryKey: ["paypal-status"], queryFn: () => api.get("/paypal/status"), retry: false })
  const status = connection.data
  return <section className="updates-page">
    <header><p className="eyebrow">WORKSPACE BULLETIN</p><h1 className="page-title">Updates & workspace guide</h1><p className="page-lede">A source-aware status page and map to the tools available in this build.</p></header>
    <article className="card source-status-card"><div><span className="eyebrow">CURRENT DATA ACCESS</span><h2 className="mt-2 text-base font-bold text-slate-900">{user?.demo ? "Labeled evidence demo" : status?.configured ? "Sandbox credentials configured" : "PayPal Sandbox not configured"}</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{user?.demo ? "This session is intentionally limited to the checked-in evidence ledger. It does not call or expose merchant PayPal data." : status?.note || "Checking the server-side PayPal Reporting configuration…"}</p>{!user?.demo && status?.configured && <p className="mt-2 text-xs text-amber-800">Credentials configured does not mean Reporting access verified. Check Settings for the latest request result.</p>}</div><Link className="btn-secondary" to="/settings">Open source settings →</Link></article>
    <section aria-labelledby="notes-title"><div className="section-heading mb-3"><div><p className="eyebrow">RELEASE NOTES</p><h2 id="notes-title">What this build can do</h2></div><span className="text-[10px] text-slate-500">Build update · 08 Nov 2026</span></div><div className="release-grid"><article className="release-card"><span className="release-index">01</span><div><h3>Risk metrics are separated</h3><p>The forecast distinguishes any-day reserve breaches from ending below reserve and adds a Wilson interval for simulation sampling error.</p></div></article><article className="release-card"><span className="release-index">02</span><div><h3>Calibration is data-driven</h3><p>Brier, equal-width ECE, prevalence baseline, skill score, and reliability bins are calculated from the checked-in labeled rows.</p></div></article><article className="release-card"><span className="release-index">03</span><div><h3>Evidence stays distinct from model output</h3><p>Fixture ledger, PayPal Reporting responses, and simulated forecasts are shown as separate sources and are not silently combined.</p></div></article></div></section>
    <section aria-labelledby="tools-title"><div className="section-heading mb-3"><div><p className="eyebrow">FEATURE DIRECTORY</p><h2 id="tools-title">Go to a workspace tool</h2></div></div><div className="feature-directory">{features.map(feature => <Link key={feature.to} to={feature.to} className="feature-tile"><span aria-hidden="true">{feature.icon}</span><div><strong>{feature.title}</strong><small>{feature.detail}</small></div><i aria-hidden="true">→</i></Link>)}</div></section>
  </section>
}
