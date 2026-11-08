import { Outlet, Link, useLocation } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()

  const navItems = [
    { path: "/", label: "Dashboard" },
    { path: "/transactions", label: "Transactions" },
    { path: "/forecast", label: "Forecast" },
    { path: "/settings", label: "Settings" }
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary-600">LedgerLens Pro</h1>
          <nav className="flex items-center gap-6">
            {user && (
              <>
                <ul className="flex gap-4">
                  {["/", "/transactions", "/forecast", "/settings"].map((path, i) => (
                    <li key={path}>
                      <Link to={path} className="text-sm font-medium text-slate-600 hover:text-primary-600">
                        {["Dashboard", "Transactions", "Forecast", "Settings"][["/", "/transactions", "/forecast", "/settings"].indexOf(path)]}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-600">{user.email}</span>
                  <button onClick={logout} className="btn-secondary text-sm">Logout</button>
                </div>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  )
}
