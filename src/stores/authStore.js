import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../shared/api'
import { t, te } from '../i18n'
import { login as authLogin, loadToken, logout as authLogout, saveToken } from '../shared/auth'

// Établissement préféré (survit au logout) + instantané de session (survit au reload)
const EST_PREF_KEY = 'auth_current_establishment_id'
const SESSION_KEY = 'tipsmana_auth_session'

// Les jetons des établissements ne sont jamais écrits dans l'instantané :
// seul le jeton actif est persisté (tipsmana_token via saveToken)
function _stripTokens(est) {
  if (!est) return est
  const { access_token, refresh_token, expires_in, ...rest } = est
  return rest
}

function _loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const establishment = ref(null)
  const establishments = ref([])
  const activeEstablishmentId = ref(null)
  const roleCode = ref(null)
  const roleName = ref(null)
  const token = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const notificationCount = ref(0)
  const switchingEstablishment = ref(false)

  // Réhydratation après reload (Pinia est en mémoire) : sans ça la liste
  // d'établissements est vide et le dropdown disparaît jusqu'au prochain login
  if (loadToken()) {
    const saved = _loadSession()
    if (saved) {
      user.value = saved.user || null
      establishments.value = saved.establishments || []
      activeEstablishmentId.value = saved.activeEstablishmentId ?? null
      establishment.value = establishments.value.find(e => String(e.id) === String(activeEstablishmentId.value)) || null
      roleCode.value = saved.roleCode || null
      roleName.value = saved.roleName || null
    }
  }

  function _persistSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        user: user.value,
        establishments: establishments.value.map(_stripTokens),
        activeEstablishmentId: activeEstablishmentId.value,
        roleCode: roleCode.value,
        roleName: roleName.value,
      }))
    } catch { /* mode privé / quota : non bloquant */ }
  }

  /**
   * Fait pointer le jeton persisté sur l'établissement : api.js lit
   * tipsmana_token.establishment_id pour le header X-Establishment-ID.
   * Jeton dédié si l'établissement en porte un, sinon on garde le jeton
   * courant et on ne change que l'establishment_id.
   */
  function _applyEstablishmentToken(est) {
    if (est.access_token) {
      saveToken({
        access_token: est.access_token,
        establishment_id: est.id,
        refresh_token: est.refresh_token,
        expires_in: est.expires_in || 900,
      })
      return
    }
    const current = loadToken()
    if (current?.access_token) {
      saveToken({
        access_token: current.access_token,
        refresh_token: current.refresh_token,
        establishment_id: est.id,
        expires_in: Math.max(1, Math.round(((current.expires_at || 0) - Date.now()) / 1000)),
      })
    }
  }

  const isAuthenticated = computed(() => !!token.value || !!loadToken())

  const roleLabel = computed(() => {
    const key = `common.roles.${roleCode.value}`
    return roleCode.value && te(key) ? t(key) : (roleCode.value || '—')
  })

  // Route dédiée par rôle
  const homeRoute = computed(() => {
    const routes = {
      OWNER: '/pilot',
      MANAGER: '/pilot',
      CUISINE: '/cuisine',
      INVENTAIRE: '/stock',
      VENTES: '/caisse',
      ACHATS: '/stock/receptions',
      SERVEUR: '/caisse'
    }
    return routes[roleCode.value] || '/pilot'
  })

  // Onglets de navigation selon le rôle
  const navTabs = computed(() => {
    const allTabs = [
      { path: '/pilot', iconName: 'pilote', label: t('common.nav.pilot'), roles: ['OWNER', 'MANAGER'] },
      { path: '/orders', iconName: 'orders', label: t('common.nav.orders'), roles: ['OWNER', 'MANAGER', 'CUISINE', 'VENTES', 'SERVEUR', 'ACHATS'], showNotifDot: true },
      { path: '/caisse', iconName: 'caisse', label: t('common.nav.caisse'), roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] },
      { path: '/service', iconName: 'service', label: t('common.nav.service'), roles: ['VENTES', 'SERVEUR'] },
      { path: '/stock', iconName: 'stock', label: t('common.nav.stock'), roles: ['OWNER', 'MANAGER', 'INVENTAIRE', 'ACHATS'] },
      { path: '/cuisine', iconName: 'cuisine', label: t('common.nav.cuisine'), roles: ['OWNER', 'MANAGER', 'CUISINE'], showNotifDot: true },
    ]
    const code = roleCode.value
    if (!code) return allTabs
    return allTabs.filter(t => t.roles.includes(code))
  })

  async function login(email, password, selectedRole) {
    loading.value = true
    error.value = null
    try {
      const res = await authLogin(email, password)
      const data = res || {}
      user.value = data.user || data
      establishments.value = data.establishments || []
      // Établissement actif : préférence localStorage d'abord (le token vient
      // d'être réécrit sur establishments[0] par auth.login), sinon token, sinon le 1er
      const storedToken = loadToken()
      const estList = establishments.value
      const validEstId = [localStorage.getItem(EST_PREF_KEY), storedToken?.establishment_id]
        .find(id => id && estList.some(e => String(e.id) === String(id)))
      activeEstablishmentId.value = validEstId || estList[0]?.id || null
      establishment.value = estList.find(e => String(e.id) === String(activeEstablishmentId.value)) || estList[0] || null
      if (establishment.value && String(establishment.value.id) !== String(storedToken?.establishment_id)) {
        _applyEstablishmentToken(establishment.value)
      }
      token.value = data.token || loadToken()
      // Si un rôle spécifique est demandé, on l'utilise (pour le boss multi-role)
      roleCode.value = selectedRole || establishment.value?.role_code || 'OWNER'
      roleName.value = establishment.value?.role_name || 'Boss'
      _persistSession()
      // Fetch notification count after login
      fetchNotificationCount()
      return true
    } catch (e) {
      error.value = e.message || 'Erreur de connexion'
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchProfile() {
    try {
      const res = await api.get('/auth/me')
      const data = res.data || {}
      user.value = data.user || user.value
      establishment.value = data.establishment || establishment.value
      // Resynchronise la liste d'établissements si l'API la renvoie
      if (data.establishments) {
        establishments.value = data.establishments
        const stillExists = establishments.value.some(e => String(e.id) === String(activeEstablishmentId.value))
        if (!stillExists && establishments.value.length) {
          activeEstablishmentId.value = establishments.value[0].id
          establishment.value = establishments.value[0]
          _applyEstablishmentToken(establishment.value)
        }
      }
      _persistSession()
      return data
    } catch {
      return null
    }
  }

  /**
   * Bascule l'établissement actif (boss multi-établissement).
   * Persiste la préférence (localStorage) + le jeton/establishment_id utilisé
   * par api.js, puis recharge profil + compteur notifs.
   */
  async function setEstablishment(estId) {
    const est = establishments.value.find(e => String(e.id) === String(estId)) || null
    if (!est) return false
    if (String(est.id) === String(activeEstablishmentId.value)) return true
    switchingEstablishment.value = true
    try {
      localStorage.setItem(EST_PREF_KEY, String(est.id))
      _applyEstablishmentToken(est)
      activeEstablishmentId.value = est.id
      establishment.value = est
      roleCode.value = est.role_code || roleCode.value
      roleName.value = est.role_name || roleName.value
      _persistSession()
      await fetchProfile()
      fetchNotificationCount()
      return true
    } finally {
      switchingEstablishment.value = false
    }
  }

  async function updateProfile(body) {
    try {
      const res = await api.put('/auth/profile', body)
      const data = res.data || {}
      if (data.user) user.value = data.user
      _persistSession()
      return true
    } catch (e) {
      error.value = e.message || 'Erreur de mise à jour'
      return false
    }
  }

  async function fetchNotificationCount() {
    try {
      const res = await api.get('/notifications/unread-count')
      const data = res.data || {}
      notificationCount.value = data.unread_count || 0
    } catch {
      notificationCount.value = 0
    }
  }

  function logout() {
    authLogout()
    user.value = null
    roleCode.value = null
    roleName.value = null
    token.value = null
    establishment.value = null
    establishments.value = []
    activeEstablishmentId.value = null
    localStorage.removeItem(SESSION_KEY)
  }

  function quickLogin(role) {
    // Tous les rôles utilisent le même compte pour la démo
    // le rôle est stocké côté frontend uniquement
    return login('boss@restoducoin.fr', 'RestoDuCoin2026!', role)
  }

  return { user, establishment, establishments, activeEstablishmentId, switchingEstablishment, roleCode, roleName, token, loading, error, notificationCount,
           isAuthenticated, roleLabel, homeRoute, navTabs,
           login, logout, quickLogin, setEstablishment, fetchProfile, updateProfile, fetchNotificationCount }
})