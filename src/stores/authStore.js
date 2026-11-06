import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../shared/api'
import { login as authLogin, loadToken, logout as authLogout, saveToken } from '../shared/auth'

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

  const isAuthenticated = computed(() => !!token.value || !!loadToken())

  const roleLabel = computed(() => {
    const labels = {
      OWNER: 'Boss',
      MANAGER: 'Manager',
      CUISINE: 'Chef cuisine',
      INVENTAIRE: 'Inventaire',
      VENTES: 'Ventes',
      ACHATS: 'Achats',
      SERVEUR: 'Serveur'
    }
    return labels[roleCode.value] || roleCode.value || '—'
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
      { path: '/pilot', iconName: 'pilote', label: 'Pilote', roles: ['OWNER', 'MANAGER'] },
      { path: '/orders', iconName: 'orders', label: 'Commandes', roles: ['OWNER', 'MANAGER', 'CUISINE', 'VENTES', 'SERVEUR', 'ACHATS'], showNotifDot: true },
      { path: '/caisse', iconName: 'caisse', label: 'Caisse', roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] },
      { path: '/stock', iconName: 'stock', label: 'Stock', roles: ['OWNER', 'MANAGER', 'INVENTAIRE', 'ACHATS'] },
      { path: '/cuisine', iconName: 'cuisine', label: 'Cuisine', roles: ['OWNER', 'MANAGER', 'CUISINE'], showNotifDot: true },
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
      // Établissement actif : token persisté d'abord, sinon localStorage, sinon le 1er
      const storedToken = loadToken()
      const estList = establishments.value
      const validEstId = [storedToken?.establishment_id, localStorage.getItem('auth_current_establishment_id')]
        .find(id => id && estList.some(e => String(e.id) === String(id)))
      activeEstablishmentId.value = validEstId || estList[0]?.id || null
      establishment.value = estList.find(e => String(e.id) === String(activeEstablishmentId.value)) || estList[0] || null
      token.value = data.token || loadToken()
      // Si un rôle spécifique est demandé, on l'utilise (pour le boss multi-role)
      roleCode.value = selectedRole || establishment.value?.role_code || 'OWNER'
      roleName.value = establishment.value?.role_name || 'Boss'
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
        }
      }
      return data
    } catch {
      return null
    }
  }

  /**
   * Bascule l'établissement actif (boss multi-établissement).
   * Persiste le token dédié via saveToken (si l'établissement en porte un),
   * sinon l'id seul dans localStorage, puis recharge profil + compteur notifs.
   */
  async function setEstablishment(estId) {
    const est = establishments.value.find(e => String(e.id) === String(estId)) || null
    if (!est) return false
    // Persiste le token de l'établissement choisi (saveToken existant), sinon l'id seul
    if (est.access_token) {
      saveToken({
        access_token: est.access_token,
        establishment_id: est.id,
        refresh_token: est.refresh_token,
        expires_in: est.expires_in || 900,
      })
    } else {
      localStorage.setItem('auth_current_establishment_id', String(est.id))
    }
    activeEstablishmentId.value = est.id
    establishment.value = est
    roleCode.value = est.role_code || roleCode.value
    roleName.value = est.role_name || roleName.value
    await fetchProfile()
    fetchNotificationCount()
    return true
  }

  async function updateProfile(body) {
    try {
      const res = await api.put('/auth/profile', body)
      const data = res.data || {}
      if (data.user) user.value = data.user
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
  }

  function quickLogin(role) {
    // Tous les rôles utilisent le même compte pour la démo
    // le rôle est stocké côté frontend uniquement
    return login('boss@restoducoin.fr', 'RestoDuCoin2026!', role)
  }

  return { user, establishment, establishments, activeEstablishmentId, roleCode, roleName, token, loading, error, notificationCount,
           isAuthenticated, roleLabel, homeRoute, navTabs,
           login, logout, quickLogin, setEstablishment, fetchProfile, updateProfile, fetchNotificationCount }
})