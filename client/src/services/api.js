const API_BASE = "/api"

class ApiClient {
  constructor() { this.token = localStorage.getItem("token") }
  setToken(token) { this.token = token; localStorage.setItem("token", token) }
  clearToken() { this.token = null; localStorage.removeItem("token") }

  async request(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || "Request failed") }
    return res.json()
  }
  get(endpoint) { return this.request(endpoint, { method: "GET" }) }
  post(endpoint, data) { return this.request(endpoint, { method: "POST", body: JSON.stringify(data) }) }
  put(endpoint, data) { return this.request(endpoint, { method: "PUT", body: JSON.stringify(data) }) }
  delete(endpoint) { return this.request(endpoint, { method: "DELETE" }) }
}

export const api = new ApiClient()
