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

    // Le token est dans establishments[0].access_token, pas à la racine
    const token = data.access_token || data.token ||
      (data.establishments?.[0]?.access_token)
    if (token) {
      saveToken({
        access_token: token,
        refresh_token: data.refresh_token || data.establishments?.[0]?.refresh_token,
        expires_in: data.expires_in || data.establishments?.[0]?.expires_in || 900
      })
    }

    auth.token = token
    auth.user = data.user || data.profile
    auth.establishments = data.establishments || []
    auth.defaultEstablishmentId = data.default_establishment_id

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