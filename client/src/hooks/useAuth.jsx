import { createContext, useContext, useState, useEffect } from "react"
import { api } from "../services/api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) { setLoading(false); return }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setUser(data))
      .catch(() => api.clearToken())
      .finally(() => setLoading(false))
  }, [])

  const saveSession = ({ token, user: sessionUser }) => {
    api.setToken(token)
    setUser(sessionUser)
  }

  const login = async (email, password) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || "Sign in failed")
    saveSession(result)
  }

  const demoLogin = async () => {
    const result = await api.post("/auth/demo", {})
    saveSession(result)
  }

  const logout = () => { api.clearToken(); setUser(null) }

  return <AuthContext.Provider value={{ user, login, demoLogin, logout, loading }}>{!loading && children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
