const API_BASE = import.meta.env.VITE_API_URL || "/api"

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = "ApiError"; this.status = status }
}

class ApiClient {
  constructor() { this.token = typeof localStorage === "undefined" ? null : localStorage.getItem("token") }
  setToken(token) { this.token = token; localStorage.setItem("token", token) }
  clearToken() { this.token = null; localStorage.removeItem("token") }

  async request(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    let response
    try { response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers }) }
    catch { throw new ApiError("Unable to reach LedgerLens API", 0) }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(error.message || "Request failed", response.status)
    }
    return response.json()
  }
  get(endpoint) { return this.request(endpoint, { method: "GET" }) }
  post(endpoint, data) { return this.request(endpoint, { method: "POST", body: JSON.stringify(data) }) }
  put(endpoint, data) { return this.request(endpoint, { method: "PUT", body: JSON.stringify(data) }) }
  delete(endpoint) { return this.request(endpoint, { method: "DELETE" }) }
}

export const api = new ApiClient()
