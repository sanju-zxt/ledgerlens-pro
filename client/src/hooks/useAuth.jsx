import { createContext, useContext, useState, useEffect } from "react"
import { api } from "../services/api"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.clearLegacyToken()
    api.get("/auth/me")
      .then(data => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const saveSession = ({ user: sessionUser }) => {
    setUser(sessionUser)
  }

  const login = async (email, password) => {
    saveSession(await api.post("/auth/login", { email, password }))
  }

  const demoLogin = async () => {
    const result = await api.post("/auth/demo", {})
    saveSession(result)
  }

  const logout = async () => {
    try { await api.post("/auth/logout", {}) } catch { /* Expired sessions are already unauthenticated. */ }
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, demoLogin, logout, loading }}>{!loading && children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
