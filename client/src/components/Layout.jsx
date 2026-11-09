import { Link, Outlet, useLocation, Navigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { useAuth } from "../hooks/useAuth"

const navItems = [
  { path: "/", label: "Overview", icon: "overview" },
  { path: "/transactions", label: "Transactions", icon: "ledger" },
  { path: "/forecast", label: "Cash-flow forecast", icon: "forecast" },
  { path: "/recurring", label: "Recurring payments", icon: "recurring" },
  { path: "/anomalies", label: "Anomaly review", icon: "anomaly" },
  { path: "/insights", label: "Financial insights", icon: "insights" },
  { path: "/model-quality", label: "Model quality", icon: "quality" },
  { path: "/quality", label: "Engineering scorecard", icon: "quality" },
  { path: "/updates", label: "Updates & guide", icon: "updates" },
  { path: "/settings", label: "Settings & sources", icon: "settings" }
]

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
}

function NavIcon({ name }) {
  const shapes = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></>,
    ledger: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="3" strokeLinecap="round"/></>,
    forecast: <><path d="M3 17.5 8.5 12l4 3 8.5-9"/><path d="M15.5 6H21v5.5"/><path d="M3 21h18"/></>,
    recurring: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2"/></>,
    anomaly: <><path d="M12 3 2.8 19a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L12 3Z"/><path d="M12 9v4.5M12 17h.01"/></>,
    insights: <><path d="M9 18h6M10 22h4M8.3 14.5A7 7 0 1 1 15.7 14c-.9.8-1.4 1.5-1.6 2.5h-4.2c-.2-.8-.7-1.5-1.6-2Z"/><path d="M12 2v1"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.9Z" transform="translate(-1 -1)"/></>,
    quality: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/><circle cx="19" cy="6" r="1"/></>,
    updates: <><path d="M12 8v4l2.5 1.5"/><circle cx="12" cy="12" r="9"/><path d="M7 3 4 5M17 3l3 2"/></>
  }
  return <svg className="sidebar-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

function Brand() { return <div className="brand-lockup"><BrandMark/><span>LedgerLens <b>Pro</b></span></div> }

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === "Escape") setMobileOpen(false) }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [])
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const current = navItems.find(item => item.path === location.pathname)?.label || "Workspace"
  return <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " mobile-sidebar-open" : ""}`}>
    {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <aside className="app-sidebar" id="workspace-navigation" aria-label="Workspace navigation">
      <div className="sidebar-brand-row"><Brand/><button className="sidebar-toggle" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="main-workspace-links" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "›" : "‹"}</button></div>
      <div className="sidebar-workspace"><span className="workspace-avatar">L</span><span><strong>Merchant workspace</strong><small>{user.demo ? "Sandbox demo" : "Financial overview"}</small></span><b aria-hidden="true">⌄</b></div>
      <p className="sidebar-caption">WORKSPACE</p>
      <nav id="main-workspace-links" aria-label="Main navigation" className="sidebar-nav">{navItems.map(item => <Link key={item.path} to={item.path} aria-label={item.label} title={item.label} aria-current={location.pathname === item.path ? "page" : undefined} className="sidebar-link"><NavIcon name={item.icon}/><span>{item.label}</span>{location.pathname === item.path && <i/>}</Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-data-card"><div className="data-card-heading"><span className="paypal-mark">P</span><strong>PayPal data</strong><span className="data-status-dot"/></div><p>{user.demo ? "Sample sandbox ledger" : "Reporting connection"}</p><Link to="/settings">View source status <span aria-hidden="true">→</span></Link></div>
        <div className="sidebar-user"><span className="user-avatar">{(user.email || "M").slice(0,1).toUpperCase()}</span><span className="sidebar-user-copy"><strong>{user.demo ? "Demo merchant" : user.email}</strong><span>{user.demo ? "Evidence-only access" : "Merchant account"}</span></span><button onClick={logout} className="logout-button" aria-label="Sign out" title="Sign out">↗</button></div>
      </div>
    </aside>
    <div className="app-main">
      <div className="mobile-topbar"><div className="mobile-toprow"><button className="mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open workspace navigation" aria-expanded={mobileOpen} aria-controls="workspace-navigation"><span/><span/><span/></button><Brand/><span className="topbar-chip"><i/> {user.demo ? "Sandbox" : "Workspace"}</span><button onClick={logout} className="mobile-logout" aria-label="Sign out">↗</button></div></div>
      <header className="app-topbar"><div className="topbar-location">LedgerLens <span>/</span> <strong>{current}</strong></div><div className="topbar-right"><span className="topbar-date">Financial intelligence for PayPal merchants</span><span className="topbar-chip"><i/> {user.demo ? "Sandbox evidence" : "Workspace"}</span></div></header>
      <main className="app-content"><Outlet/></main>
    </div>
  </div>
}
