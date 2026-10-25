/**
 * Profile.vue — unit tests
 * Tests: render, saveProfile validation & API, changePassword validation & API, logout
 *
 * Uses real Pinia authStore for proper ref reactivity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../../src/shared/api')
vi.mock('../../src/shared/auth', () => ({
  login: vi.fn(),
  loadToken: vi.fn(() => null),
  logout: vi.fn(),
  saveToken: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  auth: { user: null, establishments: [], token: null, loading: false, error: null },
}))

import { api } from '../../src/shared/api'
import { setActivePinia, createPinia } from 'pinia'
import ProfileView from '../../src/views/Profile.vue'

// ── Router setup ────────────────────────────────────────────────────────────
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/login', name: 'Login' }],
})

describe('Profile.vue', () => {
  let store

  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    const { useAuthStore } = await import('../../src/stores/authStore')
    store = useAuthStore()

    // Pre-populate store as if user just logged in
    store.user = { first_name: 'John', last_name: 'Doe', email: 'john@test.com', phone: '+336****5678' }
    store.roleCode = 'MANAGER'
    store.establishment = { name: 'Test Resto', business_type: 'restaurant' }

    // Default API responses for loadProfile
    api.get
      .mockResolvedValueOnce({
        data: {
          user: { first_name: 'John', last_name: 'Doe', email: 'john@test.com', phone: '+336****5678' },
          establishment: { name: 'Test Resto', business_type: 'restaurant' },
        },
      })
      .mockResolvedValue({ data: {} })
    api.put.mockResolvedValue({ data: { user: { first_name: 'John', last_name: 'Doe' } } })
    api.post.mockResolvedValue({ data: { success: true } })
  })

  async function mountAndWait() {
    const wrapper = mount(ProfileView, {
      global: { plugins: [router] },
    })
    // Wait for both API calls from loadProfile (auth/me + notifications/preferences)
    await vi.waitUntil(() => api.get.mock.calls.length >= 2, { timeout: 3000 })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  describe('rendu', () => {
    it('affiche le titre de la page', async () => {
      const wrapper = await mountAndWait()
      expect(wrapper.text()).toContain('Profil')
    })

    it('affiche les infos utilisateur depuis le store', async () => {
      const wrapper = await mountAndWait()
      expect(wrapper.text()).toContain('John')
      expect(wrapper.text()).toContain('Doe')
      expect(wrapper.text()).toContain('john@test.com')
      expect(wrapper.text()).toContain('Manager')
    })

    it('affiche les sections du formulaire', async () => {
      const wrapper = await mountAndWait()
      expect(wrapper.text()).toContain('Informations personnelles')
      expect(wrapper.text()).toContain('Notifications')
      expect(wrapper.text()).toContain('Changer le mot de passe')
      expect(wrapper.text()).toContain('Se déconnecter')
    })
  })

  describe('saveProfile', () => {
    it("affiche 'Aucune modification' si les champs n ont pas changé", async () => {
      const wrapper = await mountAndWait()
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Aucune modification')
      expect(api.put).not.toHaveBeenCalled()
    })

    it('appelle api.put avec les champs modifiés', async () => {
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      await textInputs[1].setValue('Smith')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0, { timeout: 2000 })
      expect(api.put).toHaveBeenCalledWith('/auth/profile', {
        first_name: 'Jane',
        last_name: 'Smith',
      })
      expect(wrapper.text()).toContain('Profil mis à jour')
    })

    it('affiche une erreur en cas d echec API', async () => {
      api.put.mockRejectedValue(new Error('Erreur serveur'))
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => wrapper.text().includes('Erreur'), { timeout: 2000 })
      expect(wrapper.text()).toContain('Erreur')
    })

    it('merge preserves email et phone quand API ne les renvoie pas', async () => {
      api.put.mockResolvedValue({
        data: { user: { first_name: 'Jane', last_name: 'Smith' } },
      })
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      await textInputs[1].setValue('Smith')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0, { timeout: 2000 })

      expect(store.user?.first_name).toBe('Jane')
      expect(store.user?.last_name).toBe('Smith')
      expect(store.user?.email).toBe('john@test.com')
      expect(store.user?.phone).toBe('+336****5678')
    })

    it("gere le format { user: {...} } sans wrapper 'data'", async () => {
      api.put.mockResolvedValue({
        user: { first_name: 'Jane', last_name: 'Smith' },
      })
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      await textInputs[1].setValue('Smith')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0, { timeout: 2000 })

      expect(store.user?.first_name).toBe('Jane')
      expect(store.user?.email).toBe('john@test.com')
      expect(wrapper.text()).toContain('Profil mis à jour')
    })

    it('gere le format ou l objet utilisateur est directement a la racine', async () => {
      api.put.mockResolvedValue({
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'john@test.com',
      })
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      await textInputs[1].setValue('Smith')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0, { timeout: 2000 })

      expect(store.user?.first_name).toBe('Jane')
      expect(store.user?.email).toBe('john@test.com')
      expect(wrapper.text()).toContain('Profil mis à jour')
    })

    it('re-sync editForm: second clic sans modif affiche Aucune modification', async () => {
      api.put.mockResolvedValue({
        data: { user: { first_name: 'Jane', last_name: 'Doe', email: 'john@test.com', phone: '+336****5678' } },
      })
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0, { timeout: 2000 })
      await wrapper.vm.$nextTick()

      api.put.mockClear()
      await buttons[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Aucune modification')
      expect(api.put).not.toHaveBeenCalled()
    })
  })

  describe('changePassword validation', () => {
    it('refuse si le mot de passe actuel est manquant', async () => {
      const wrapper = await mountAndWait()
      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('')
      await passwordInputs[1].setValue('newpass')
      await passwordInputs[2].setValue('newpass')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[1].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Mot de passe actuel requis')
    })

    it('refuse si le nouveau mot de passe fait moins de 8 caracteres', async () => {
      const wrapper = await mountAndWait()
      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('currentpwd')
      await passwordInputs[1].setValue('short')
      await passwordInputs[2].setValue('short')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[1].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Minimum 8 caractères')
    })

    it('refuse si les mots de passe ne correspondent pas', async () => {
      const wrapper = await mountAndWait()
      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('currentpwd')
      await passwordInputs[1].setValue('newpass123')
      await passwordInputs[2].setValue('different')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[1].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('ne correspondent pas')
    })

    it('appelle api.post /auth/password/change', async () => {
      const wrapper = await mountAndWait()
      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('currentpwd')
      await passwordInputs[1].setValue('newpass12345')
      await passwordInputs[2].setValue('newpass12345')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[1].trigger('click')
      await vi.waitUntil(() => api.post.mock.calls.length > 0, { timeout: 2000 })
      expect(api.post).toHaveBeenCalledWith('/auth/password/change', {
        current_password: 'currentpwd',
        new_password: 'newpass12345',
      })
      expect(wrapper.text()).toContain('Mot de passe changé')
    })
  })

  describe('logout', () => {
    it('appelle authStore.logout au clic sur Se deconnecter', async () => {
      // Wrapper store.logout with a spy so we can verify call count
      store.logout = vi.fn(store.logout)
      const wrapper = await mountAndWait()
      const logoutBtn = wrapper.find('.btn-logout')
      await logoutBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(store.logout).toHaveBeenCalledOnce()
    })
  })
})