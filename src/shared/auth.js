import { api } from './api'
import { reactive } from 'vue'

export const auth = reactive({
  user: null,
  establishments: [],
  defaultEstablishmentId: null,
  token: null,
  loading: false,
  error: null
})

export async function login(email, password) {
  auth.loading = true
  auth.error = null

  try {
    const res = await api.post('/auth/login', { email, password })
    const data = res.data || res

    // Save token
    if (data.access_token || data.token) {
      saveToken({
        access_token: data.access_token || data.token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in || 900
      })
    }

    auth.token = data.access_token || data.token
    auth.user = data.user || data.profile
    auth.establishments = data.establishments || []
    auth.defaultEstablishmentId = data.default_establishment_id || 
      (data.establishments && data.establishments[0]?.establishment_id)

    return auth
  } catch (err) {
    auth.error = err.message || 'Erreur de connexion'
    throw err
  } finally {
    auth.loading = false
  }
}

export function saveToken(tokenData) {
  const token = {
    access_token: tokenData.access_token || tokenData.token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in || 900) * 1000
  }
  localStorage.setItem('tipsmana_token', JSON.stringify(token))
}

export function loadToken() {
  try {
    const stored = localStorage.getItem('tipsmana_token')
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed.expires_at && Date.now() > parsed.expires_at) {
      localStorage.removeItem('tipsmana_token')
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function logout() {
  localStorage.removeItem('tipsmana_token')
  auth.user = null
  auth.token = null
  auth.establishments = []
  auth.defaultEstablishmentId = null
}

export function isAuthenticated() {
  const token = loadToken()
  return !!token
}