/**
 * Tipsmana API Client — HTTP layer with JWT interceptors
 * Used by both web frontend and mobile PWA
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE
    this.offlineQueue = []
  }

  getToken() {
    try {
      const stored = localStorage.getItem('tipsmana_token')
      if (!stored) return null
      const parsed = JSON.parse(stored)
      if (parsed.expires_at && Date.now() > parsed.expires_at) return null
      return parsed.access_token
    } catch {
      return null
    }
  }

  getRefreshToken() {
    try {
      const stored = localStorage.getItem('tipsmana_token')
      if (!stored) return null
      return JSON.parse(stored).refresh_token
    } catch {
      return null
    }
  }

  async request(method, path, body = null, options = {}) {
    const token = this.getToken()
    const headers = { 'Content-Type': 'application/json', ...options.headers }

    if (token) headers['Authorization'] = `Bearer ${token}`

    const url = `${this.baseUrl}${path}`
    const config = { method, headers }
    if (body) config.body = JSON.stringify(body)

    try {
      const res = await fetch(url, config)
      
      // Auto-refresh on 401
      if (res.status === 401 && this.getRefreshToken()) {
        const refreshed = await this._refreshToken()
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.getToken()}`
          const retryRes = await fetch(url, { ...config, headers })
          return this._handleResponse(retryRes)
        }
      }

      return this._handleResponse(res)
    } catch (err) {
      // Offline queue
      if (!navigator.onLine) {
        this.offlineQueue.push({ method, path, body, options })
        return { success: true, offline: true, queued: true }
      }
      throw err
    }
  }

  async _refreshToken() {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return false

    try {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      })
      if (!res.ok) return false
      const data = await res.json()
      this._saveTokens(data.data || data)
      return true
    } catch {
      return false
    }
  }

  _saveTokens(data) {
    const token = {
      access_token: data.access_token || data.token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 900) * 1000  // default 15min
    }
    localStorage.setItem('tipsmana_token', JSON.stringify(token))
  }

  async _handleResponse(res) {
    const data = await res.json()
    if (!res.ok) {
      const err = new Error(data.message || data.detail || 'API Error')
      err.status = res.status
      err.data = data
      throw err
    }
    return data
  }

  // Convenience methods
  get(path, opts) { return this.request('GET', path, null, opts) }
  post(path, body, opts) { return this.request('POST', path, body, opts) }
  put(path, body, opts) { return this.request('PUT', path, body, opts) }
  patch(path, body, opts) { return this.request('PATCH', path, body, opts) }
  del(path, opts) { return this.request('DELETE', path, null, opts) }

  // Image upload (multipart)
  async upload(path, file, fieldName = 'file') {
    const token = this.getToken()
    const formData = new FormData()
    formData.append(fieldName, file)

    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData
    })
    return this._handleResponse(res)
  }
}

export const api = new ApiClient()
export default api