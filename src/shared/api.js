/**
 * Tipsmana API Client — HTTP layer with JWT interceptors + offline caching
 *
 * Features:
 *  - Cache les réponses GET dans IndexedDB (via offlineStore)
 *  - En mode hors-ligne : sert le cache + queue les mutations
 *  - En ligne : flush automatique des requêtes en attente
 *  - Auto-refresh du token JWT sur 401
 *  - Détection online/offline avec navigator.onLine
 */

import { offlineStore } from './offlineStore'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

// Types de requêtes mutables (POST/PUT/PATCH/DELETE)
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE
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

  getEstablishmentId() {
    try {
      const stored = localStorage.getItem('tipsmana_token')
      return stored ? JSON.parse(stored).establishment_id || null : null
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

  /**
   * Construction de l'URL complète (sans le /api/v1 du path)
   */
  _buildUrl(path) {
    return `${this.baseUrl}${path}`
  }

  /**
   * Cache une réponse GET
   */
  async _cacheResponse(path, data) {
    const cacheKey = this._cacheKey(path)
    await offlineStore.setCached(cacheKey, data)
  }

  /**
   * Récupère le cache d'une route GET
   */
  async _getCachedResponse(path) {
    const cacheKey = this._cacheKey(path)
    return offlineStore.getCached(cacheKey)
  }

  /**
   * Invalide le cache lié à un préfixe de chemin
   */
  async _invalidateRelated(path) {
    // Invalide le cache exact
    await offlineStore.invalidateCached(this._cacheKey(path))
    // Invalide aussi les routes de bundle/dashboard qui pourraient être affectées
    if (path.includes('/stock/') || path.includes('/inventory/')) {
      await offlineStore.invalidateCached(this._cacheKey('/dashboard/bundle'))
    }
  }

  _cacheKey(path) {
    const estId = this.getEstablishmentId()
    return `${estId || 'default'}:${path}`
  }

  /**
   * Queue une requête pour rejeu quand online
   */
  async _queueRequest(method, path, body) {
    await offlineStore.enqueueRequest(method, path, body)
  }

  /**
   * Tente de flush la queue des requêtes en attente
   */
  async flushQueue() {
    if (!navigator.onLine) return { synced: 0, failed: 0 }
    return offlineStore.flushToServer(this)
  }

  async request(method, path, body = null, options = {}) {
    const token = this.getToken()
    const headers = { 'Content-Type': 'application/json', ...options.headers }

    if (token) headers['Authorization'] = `Bearer ${token}`
    const establishmentId = this.getEstablishmentId()
    if (establishmentId) headers['X-Establishment-ID'] = establishmentId

    const url = this._buildUrl(path)
    const config = { method, headers }
    if (body) config.body = JSON.stringify(body)

    // ── Mode HORS-LIGNE ──
    if (!navigator.onLine) {
      if (MUTATION_METHODS.has(method)) {
        // Mutation : on queue et on notifie
        await this._queueRequest(method, path, body)
        return { success: true, offline: true, queued: true, method, path }
      } else {
        // GET : on sert le cache
        const cached = await this._getCachedResponse(path)
        if (cached) {
          return { ...cached, offline: true, fromCache: true }
        }
        throw new Error('Réseau indisponible. Aucune donnée en cache.')
      }
    }

    // ── Mode EN-LIGNE ──
    try {
      const res = await fetch(url, config)

      // Auto-refresh on 401
      if (res.status === 401 && this.getRefreshToken()) {
        const refreshed = await this._refreshToken()
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.getToken()}`
          const retryRes = await fetch(url, { ...config, headers })
          return this._handleResponse(path, method, retryRes)
        }
      }

      // Token expired & refresh failed → force logout
      if (res.status === 401) {
        this._forceLogout()
        throw new Error('Session expirée. Veuillez vous reconnecter.')
      }

      return this._handleResponse(path, method, res)
    } catch (err) {
      // Fallback réseau : on tente le cache
      if (err.name === 'TypeError' || err.message?.includes('fetch')) {
        const cached = await this._getCachedResponse(path)
        if (cached) {
          return { ...cached, offline: true, fromCache: true }
        }
        // Queue les mutations même en cas d'échec réseau non détecté
        if (MUTATION_METHODS.has(method)) {
          await this._queueRequest(method, path, body)
          return { success: true, offline: true, queued: true, method, path }
        }
      }
      throw err
    }
  }

  async _handleResponse(path, method, res) {
    const data = await res.json()
    if (!res.ok) {
      const err = new Error(data.message || data.detail || 'API Error')
      err.status = res.status
      err.data = data
      throw err
    }

    // Cache les réponses GET réussies
    if (method === 'GET' || method === 'get') {
      // On évite de cachemiser la pagination longue
      if (!path.includes('?page=')) {
        this._cacheResponse(path, data).catch(() => {})
      }
    } else {
      // Invalide le cache lié aux mutations
      this._invalidateRelated(path).catch(() => {})
    }

    return data
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
      // /auth/refresh ne renvoie pas l'établissement : conserver celui du login
      establishment_id: this.getEstablishmentId(),
      expires_at: Date.now() + (data.expires_in || 900) * 1000  // default 15min
    }
    localStorage.setItem('tipsmana_token', JSON.stringify(token))
  }

  _forceLogout() {
    localStorage.removeItem('tipsmana_token')
    offlineStore.clearCache().catch(() => {})
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = '/mobile/login'
    }
  }

  // Convenience methods
  get(path, opts) { return this.request('GET', path, null, opts) }
  post(path, body, opts) { return this.request('POST', path, body, opts) }
  put(path, body, opts) { return this.request('PUT', path, body, opts) }
  patch(path, body, opts) { return this.request('PATCH', path, body, opts) }
  del(path, opts) { return this.request('DELETE', path, null, opts) }

  // Image upload (multipart) — pas de cache pour l'upload
  async upload(path, file, fieldName = 'file') {
    const token = this.getToken()
    const formData = new FormData()
    formData.append(fieldName, file)

    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const establishmentId = this.getEstablishmentId()
    if (establishmentId) headers['X-Establishment-ID'] = establishmentId

    if (!navigator.onLine) {
      throw new Error('Réseau indisponible. Impossible de télécharger le fichier.')
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData
    })
    return this._handleResponse(path, 'POST', res)
  }
}

export const api = new ApiClient()

// Expose la fonction de flush globale (utilisée par App.vue)
window.__flushOfflineQueue = () => api.flushQueue()

export default api