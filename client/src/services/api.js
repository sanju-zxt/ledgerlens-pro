const API_BASE = import.meta.env.PROD ? "/api" : import.meta.env.VITE_API_URL || "/api"
const normalizedBase = API_BASE.replace(/\/+$/, "")

export function apiUrl(endpoint) {
  return `${normalizedBase}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = "ApiError"; this.status = status }
}

class ApiClient {
  clearLegacyToken() { if (typeof localStorage !== "undefined") localStorage.removeItem("token") }

  async request(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers }
    let response
    try { response = await fetch(apiUrl(endpoint), { ...options, headers, credentials: "include" }) }
    catch { throw new ApiError("Unable to reach LedgerLens API", 0) }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(error.message || "Request failed", response.status)
    }
    if (response.status === 204) return null
    return response.json()
  }
  get(endpoint) { return this.request(endpoint, { method: "GET" }) }
  post(endpoint, data) { return this.request(endpoint, { method: "POST", body: JSON.stringify(data) }) }
  put(endpoint, data) { return this.request(endpoint, { method: "PUT", body: JSON.stringify(data) }) }
  delete(endpoint) { return this.request(endpoint, { method: "DELETE" }) }
}

export const api = new ApiClient()
