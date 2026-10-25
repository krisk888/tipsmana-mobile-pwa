/**
 * Profile.vue — unit tests
 * Tests: render, saveProfile validation & API, changePassword validation & API, logout
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'

// ── Mocks ───────────────────────────────────────────────────────────────────
vi.mock('../../src/shared/api')

const mockStore = {
  user: { first_name: 'John', last_name: 'Doe', email: 'john@test.com', phone: '+33612345678' },
  roleCode: 'MANAGER',
  roleLabel: 'Manager',
  establishment: { name: 'Test Resto', business_type: 'restaurant' },
  logout: vi.fn(),
}

vi.mock('../../src/stores/authStore', () => ({
  useAuthStore: () => mockStore,
}))

import { api } from '../../src/shared/api'
import ProfileView from '../../src/views/Profile.vue'

// ── Router setup ────────────────────────────────────────────────────────────
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/login', name: 'Login' }],
})

function mountProfile() {
  return mount(ProfileView, {
    global: { plugins: [router] },
  })
}

async function mountAndWait() {
  const wrapper = mountProfile()
  // Wait for both API calls from loadProfile (auth/me + notifications/preferences)
  await vi.waitUntil(() => api.get.mock.calls.length >= 2, { timeout: 3000 })
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('Profile.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStore.logout.mockClear()
    // Default API responses for loadProfile
    api.get
      .mockResolvedValueOnce({
        data: {
          user: { first_name: 'John', last_name: 'Doe', email: 'john@test.com', phone: '+33612345678' },
          establishment: { name: 'Test Resto', business_type: 'restaurant' },
        },
      })
      .mockResolvedValue({ data: {} })
    api.put.mockResolvedValue({ data: { user: { first_name: 'John', last_name: 'Doe', phone: '+33612345678' } } })
    api.post.mockResolvedValue({ data: { success: true } })
  })

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
      // First btn-save is saveProfile
      await buttons[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Aucune modification')
      expect(api.put).not.toHaveBeenCalled()
    })

    it('appelle api.put avec les champs modifiés', async () => {
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      // textInputs[0] = Prénom, textInputs[1] = Nom
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

    it('affiche une erreur en cas d échec API', async () => {
      api.put.mockRejectedValue(new Error('Erreur serveur'))
      const wrapper = await mountAndWait()
      const textInputs = wrapper.findAll('input[type="text"]')
      await textInputs[0].setValue('Jane')
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[0].trigger('click')
      await vi.waitUntil(() => wrapper.text().includes('Erreur'), { timeout: 2000 })
      expect(wrapper.text()).toContain('Erreur')
    })
  })

  describe('changePassword validation', () => {
    it('refuse si le mot de passe actuel est manquant', async () => {
      const wrapper = await mountAndWait()
      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('')        // current : vide
      await passwordInputs[1].setValue('newpass')  // newPass
      await passwordInputs[2].setValue('newpass')  // confirm
      const buttons = wrapper.findAll('button.btn-save')
      await buttons[1].trigger('click')            // changePassword button
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Mot de passe actuel requis')
    })

    it('refuse si le nouveau mot de passe fait moins de 8 caractères', async () => {
      const wrapper = await mountAndWait()
      const passwordInputs = wrapper.findAll('input[type="password"]')
      await passwordInputs[0].setValue('currentpwd')
      await passwordInputs[1].setValue('short')    // < 8
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

    it('appelle api.post /auth/password/change avec les bons champs', async () => {
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
    it('appelle authStore.logout au clic sur Se déconnecter', async () => {
      const wrapper = await mountAndWait()
      const logoutBtn = wrapper.find('.btn-logout')
      await logoutBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(mockStore.logout).toHaveBeenCalledOnce()
    })
  })
})