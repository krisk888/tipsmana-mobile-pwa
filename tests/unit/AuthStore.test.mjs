/**
 * AuthStore — unit tests
 * Tests: login, isAuthenticated, logout, fetchProfile, updateProfile, fetchNotificationCount
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../src/shared/api')
vi.mock('../../src/shared/auth', () => ({
  login: vi.fn(),
  loadToken: vi.fn(),
  logout: vi.fn(),
  saveToken: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  auth: { user: null, establishments: [], token: null, loading: false, error: null },
}))

import { api } from '../../src/shared/api'
import { login as authLogin, loadToken, logout as authLogout } from '../../src/shared/auth'
import { useAuthStore } from '../../src/stores/authStore'

describe('AuthStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    store = useAuthStore()
  })

  describe('login()', () => {
    it('connecte et met à jour user, roleCode, token', async () => {
      authLogin.mockResolvedValue({
        user: { first_name: 'John', last_name: 'Doe', email: 'john@test.com' },
        establishments: [{ id: 1, role_code: 'MANAGER', role_name: 'Manager' }],
        token: 'fake-access-token',
      })
      loadToken.mockReturnValue({ access_token: 'fake-access-token' })

      const result = await store.login('john@test.com', 'password')

      expect(result).toBe(true)
      expect(authLogin).toHaveBeenCalledWith('john@test.com', 'password')
      expect(store.user?.first_name).toBe('John')
      expect(store.roleCode).toBe('MANAGER')
      expect(store.roleLabel).toBe('Manager')
      expect(store.loading).toBe(false)
      expect(store.error).toBe(null)
    })

    it('accepte un selectedRole optionnel', async () => {
      authLogin.mockResolvedValue({
        user: { first_name: 'John' },
        establishments: [{ id: 1, role_code: 'OWNER', role_name: 'Boss' }],
        token: 'token',
      })
      loadToken.mockReturnValue({ access_token: 'token' })

      const result = await store.login('john@test.com', 'password', 'SERVEUR')

      expect(result).toBe(true)
      expect(store.roleCode).toBe('SERVEUR')
    })

    it('retourne false et définit error en cas d échec', async () => {
      authLogin.mockRejectedValue(new Error('Identifiants invalides'))

      const result = await store.login('wrong@test.com', 'bad')

      expect(result).toBe(false)
      expect(store.error).toBe('Identifiants invalides')
      expect(store.loading).toBe(false)
    })
  })

  describe('isAuthenticated', () => {
    it('retourne true si token présent dans le store', () => {
      store.token = 'some-token'
      expect(store.isAuthenticated).toBe(true)
    })

    it('retourne false si aucun token', () => {
      // trigger re-eval by cycling token
      store.token = undefined
      store.token = null
      loadToken.mockReturnValue(null)
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('logout()', () => {
    it('efface toutes les données utilisateur et appelle authLogout', () => {
      store.user = { first_name: 'John' }
      store.roleCode = 'MANAGER'
      store.token = 'token'
      store.establishment = { id: 1 }

      store.logout()

      expect(authLogout).toHaveBeenCalled()
      expect(store.user).toBe(null)
      expect(store.roleCode).toBe(null)
      expect(store.token).toBe(null)
      expect(store.establishment).toBe(null)
    })
  })

  describe('fetchProfile()', () => {
    it('met à jour user et establishment depuis l API', async () => {
      api.get.mockResolvedValue({
        data: {
          user: { first_name: 'Jane', last_name: 'Smith', email: 'jane@test.com' },
          establishment: { id: 2, name: 'New Resto' },
        },
      })

      const result = await store.fetchProfile()

      expect(api.get).toHaveBeenCalledWith('/auth/me')
      expect(store.user?.first_name).toBe('Jane')
      expect(store.establishment?.name).toBe('New Resto')
      expect(result.user.first_name).toBe('Jane')
    })

    it('retourne null en cas d erreur API', async () => {
      api.get.mockRejectedValue(new Error('Network error'))

      const result = await store.fetchProfile()

      expect(result).toBe(null)
      // Existing data should be preserved — no change to store values
    })
  })

  describe('updateProfile()', () => {
    it('appelle PUT /auth/profile et met à jour user', async () => {
      store.user = { first_name: 'Old' }

      api.put.mockResolvedValue({
        data: { user: { first_name: 'Updated', last_name: 'User' } },
      })

      const result = await store.updateProfile({ first_name: 'Updated' })

      expect(result).toBe(true)
      expect(api.put).toHaveBeenCalledWith('/auth/profile', { first_name: 'Updated' })
      expect(store.user?.first_name).toBe('Updated')
    })

    it('retourne false et définit error en cas d échec', async () => {
      api.put.mockRejectedValue(new Error('Validation error'))

      const result = await store.updateProfile({ first_name: 'Bad' })

      expect(result).toBe(false)
      expect(store.error).toBe('Validation error')
    })
  })

  describe('fetchNotificationCount()', () => {
    it('met à jour le compteur de notifications non lues', async () => {
      api.get.mockResolvedValue({
        data: { unread_count: 5 },
      })

      await store.fetchNotificationCount()

      expect(api.get).toHaveBeenCalledWith('/notifications/unread-count')
      expect(store.notificationCount).toBe(5)
    })

    it('met le compteur à 0 en cas d erreur', async () => {
      api.get.mockRejectedValue(new Error('Network error'))

      await store.fetchNotificationCount()

      expect(store.notificationCount).toBe(0)
    })
  })
})