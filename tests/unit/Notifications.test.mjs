/**
 * Notifications.vue — unit tests
 * Tests: render, fetch, markRead, markAllRead, loadMore, polling, error, timeAgo
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ── Mock the shared api module (hoisted automatically by vitest) ──────────
vi.mock('../../src/shared/api')

// Import the mocked module AND the component
import { api } from '../../src/shared/api'
import NotificationsView from '../../src/views/Notifications.vue'

// ── Helpers ────────────────────────────────────────────────────────────────
function makeNotification(overrides = {}) {
  return {
    id: overrides.id || 1,
    title: overrides.title || 'Test notification',
    message: overrides.message || 'Ceci est une notification de test',
    is_read: overrides.is_read ?? false,
    priority: overrides.priority || 'medium',
    created_at: overrides.created_at || new Date().toISOString(),
    module_code: overrides.module_code || null,
    read_at: overrides.read_at || null,
  }
}

function defaultApiResponse(notifCount = 2, unread = 2) {
  return {
    data: {
      notifications: Array.from({ length: notifCount }, (_, i) => makeNotification({ id: i + 1 })),
      total: notifCount + 2,
      unread_count: unread,
    },
  }
}

describe('Notifications.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: API returns 2 notifications, 2 unread
    api.get.mockResolvedValue(defaultApiResponse(2, 2))
  })

  describe('rendu', () => {
    it('affiche le titre de la page', async () => {
      const wrapper = mount(NotificationsView)
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('🔔')
      expect(wrapper.text()).toContain('Notifications')
    })

    it('affiche le skeleton pendant le chargement', async () => {
      api.get.mockReturnValue(new Promise(() => {}))
      const wrapper = mount(NotificationsView)
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.skeleton-list').exists()).toBe(true)
    })

    it("affiche l'etat vide quand la liste est vide", async () => {
      api.get.mockResolvedValue({
        data: { notifications: [], total: 0, unread_count: 0 },
      })
      const wrapper = mount(NotificationsView)
      // Attend que l'appel API soit fait puis que le DOM se mette à jour
      await vi.waitUntil(() => api.get.mock.calls.length > 0, { timeout: 2000 })
      // Attend que le empty-state apparaisse après résolution de l'API + mise à jour Vue
      await vi.waitUntil(() => wrapper.find('.empty-state').exists(), { timeout: 2000 })
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Aucune notification pour le moment')
    })

    it('affiche la liste des notifications', async () => {
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.notification-item').exists())
      const items = wrapper.findAll('.notification-item')
      expect(items.length).toBe(2)
      expect(wrapper.text()).toContain('Test notification')
    })

    it("affiche le badge 'Tout lu' quand il y a des non-lues", async () => {
      api.get.mockResolvedValue(defaultApiResponse(2, 2))
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.mark-all-btn').exists())
      expect(wrapper.find('.mark-all-btn').text()).toContain('Tout lu')
    })

    it('affiche le compteur de non-lues', async () => {
      api.get.mockResolvedValue(defaultApiResponse(2, 2))
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.text().includes('2 non lues'))
      expect(wrapper.text()).toContain('2 non lues')
    })

    it("affiche 'Aucune notification non lue' quand tout est lu", async () => {
      api.get.mockResolvedValue(defaultApiResponse(2, 0))
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.text().includes('Aucune notification non lue'))
      expect(wrapper.text()).toContain('Aucune notification non lue')
    })

    it('affiche un message en cas d erreur', async () => {
      api.get.mockRejectedValue(new Error('Erreur reseau'))
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.error-msg').exists())
      expect(wrapper.text()).toContain('Erreur')
    })
  })

  describe('appels API', () => {
    it('appelle fetchNotifications au montage', async () => {
      mount(NotificationsView)
      await vi.waitUntil(() => api.get.mock.calls.length > 0)
      const [url] = api.get.mock.calls[0]
      expect(url).toContain('/notifications')
      expect(url).toContain('page=1')
      expect(url).toContain('per_page=20')
    })

    it('markRead appelle PUT /notifications/{id}/read', async () => {
      api.put.mockResolvedValue({ data: { success: true } })
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.notification-item').exists())
      const items = wrapper.findAll('.notification-item')
      await items[0].trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0)
      expect(api.put).toHaveBeenCalledWith('/notifications/1/read')
    })

    it('markAllRead appelle PUT /notifications/mark-all-read', async () => {
      api.put.mockResolvedValue({ data: { success: true } })
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.mark-all-btn').exists())
      await wrapper.find('.mark-all-btn').trigger('click')
      await vi.waitUntil(() => api.put.mock.calls.length > 0)
      expect(api.put).toHaveBeenCalledWith('/notifications/mark-all-read')
    })

    it('loadMore increment la page', async () => {
      api.get.mockResolvedValue(defaultApiResponse(2, 2))
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.btn-more').exists())
      await wrapper.find('.btn-more').trigger('click')
      await vi.waitUntil(() => api.get.mock.calls.length >= 2)
      const secondCallUrl = api.get.mock.calls[1][0]
      expect(secondCallUrl).toContain('page=2')
    })
  })

  describe('timeAgo', () => {
    it("retourne 'a l instant' pour un timestamp recent", async () => {
      const recent = new Date().toISOString()
      const notif = makeNotification({ id: 1, created_at: recent })
      api.get.mockResolvedValue({
        data: { notifications: [notif], total: 1, unread_count: 1 },
      })
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.notif-time').exists())
      expect(wrapper.find('.notif-time').text()).toBe("à l'instant")
    })

    it("retourne 'il y a X min' pour un timestamp plus ancien", async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const notif = makeNotification({ id: 1, created_at: fiveMinAgo })
      api.get.mockResolvedValue({
        data: { notifications: [notif], total: 1, unread_count: 1 },
      })
      const wrapper = mount(NotificationsView)
      await vi.waitUntil(() => wrapper.find('.notif-time').exists())
      expect(wrapper.find('.notif-time').text()).toMatch(/il y a \d+ min/)
    })
  })
})