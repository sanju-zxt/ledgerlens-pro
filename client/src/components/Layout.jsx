import { Outlet, Link, useLocation, Navigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/transactions", label: "Transactions" },
  { path: "/forecast", label: "Forecast" },
  { path: "/recurring", label: "Recurring" },
  { path: "/anomalies", label: "Anomalies" },
  { path: "/insights", label: "Insights" },
  { path: "/settings", label: "Settings" }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <div className="min-h-screen bg-slate-50">
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link to="/" className="text-xl font-bold text-primary-600">LedgerLens Pro</Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">{navItems.map(({ path, label }) => <li key={path}><Link to={path} aria-current={location.pathname === path ? "page" : undefined} className={`text-sm font-medium hover:text-primary-600 ${location.pathname === path ? "text-primary-700" : "text-slate-600"}`}>{label}</Link></li>)}</ul>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-slate-600 md:inline">{user.email}</span><button onClick={logout} className="btn-secondary text-sm">Logout</button></div>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
  </div>
}
