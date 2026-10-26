/**
 * OrdersList.vue — unit tests
 * Tests: render, load order list, expand/collapse, filter, error handling, empty state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Mock the shared api module ───────────────────────────
vi.mock('../../src/shared/api')

import { api } from '../../src/shared/api'
import OrdersListView from '../../src/views/orders/OrdersList.vue'

// ── Helpers ──────────────────────────────────────────────
function makeOrder(overrides = {}) {
  return {
    id: overrides.id || 'order-1',
    ticket_ref: overrides.ticket_ref || 'MOB-A1B2C3',
    station: 'cuisine',
    status: overrides.status || 'pending',
    note: overrides.note || null,
    notes: overrides.notes || null,
    created_at: overrides.created_at || new Date().toISOString(),
    items: overrides.items || [
      { name: 'Burger', qty: 2, note: null, status: 'pending' },
      { name: 'Frites', qty: 1, note: null, status: 'pending' },
    ],
  }
}

function defaultApiResponse(count = 3) {
  const orders = Array.from({ length: count }, (_, i) =>
    makeOrder({
      id: `order-${i + 1}`,
      ticket_ref: `MOB-X${i + 1}Y`,
      status: i === 0 ? 'pending' : i === 1 ? 'preparing' : 'ready',
      created_at: new Date(Date.now() - (i + 1) * 300000).toISOString(),
    })
  )
  return {
    success: true,
    data: { station: 'cuisine', items: orders },
  }
}

function mountComponent() {
  return mount(OrdersListView, {
    global: {
      plugins: [
        createRouter({
          history: createMemoryHistory(),
          routes: [],
        }),
      ],
    },
  })
}

describe('OrdersList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue(defaultApiResponse(3))
  })

  describe('rendu', () => {
    it('affiche le titre de la page', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('📋')
      expect(wrapper.text()).toContain('Commandes')
    })

    it('affiche les commandes chargees', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      const cards = wrapper.findAll('.order-card')
      expect(cards.length).toBe(3)
    })

    it('affiche le nombre d elements en attente dans le sous-titre', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.text().includes('en attente'), { timeout: 3000 })
      expect(wrapper.text()).toMatch(/\d+ en attente/)
    })

    it('affiche la barre de filtres', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.filter-chip').exists(), { timeout: 3000 })
      const chips = wrapper.findAll('.filter-chip')
      expect(chips.length).toBe(5)
      expect(chips[0].text()).toContain('Toutes')
    })

    it('affiche le skeleton pendant le chargement', async () => {
      api.get.mockReturnValue(new Promise(() => {})) // Never resolves
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.spinner').exists()).toBe(true)
    })
  })

  describe('expand/collapse', () => {
    it('affiche les articles au clic sur une commande', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      const cards = wrapper.findAll('.order-card')
      await cards[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Burger')
      expect(wrapper.text()).toContain('Frites')
    })
  })

  describe('filtres', () => {
    it('filtre les commandes par statut', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      // Click "En prépa" filter (index 2)
      const chips = wrapper.findAll('.filter-chip')
      api.get.mockClear()
      await chips[2].trigger('click')
      await wrapper.vm.$nextTick()
      const cards = wrapper.findAll('.order-card')
      cards.forEach(c => {
        expect(c.classes()).toContain('card-preparing')
      })
    })

    it('re-affiche toutes les commandes apres filtre "Toutes"', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      // Filter to "En prépa"
      const chips = wrapper.findAll('.filter-chip')
      await chips[2].trigger('click')
      await wrapper.vm.$nextTick()
      // Back to "Toutes"
      await chips[0].trigger('click')
      await wrapper.vm.$nextTick()
      const cards = wrapper.findAll('.order-card')
      expect(cards.length).toBe(3)
    })
  })

  describe('gestion d erreurs', () => {
    it('affiche un message en cas d erreur API', async () => {
      api.get.mockRejectedValue(new Error('Erreur réseau'))
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.error-text').exists(), { timeout: 3000 })
      expect(wrapper.text()).toContain('Erreur')
    })

    it('affiche le bouton Réessayer après une erreur', async () => {
      api.get.mockRejectedValue(new Error('Erreur réseau'))
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.btn-retry').exists(), { timeout: 3000 })
      expect(wrapper.find('.btn-retry').text()).toContain('Réessayer')
    })
  })

  describe('etat vide', () => {
    it("affiche 'Aucune commande' quand la liste est vide", async () => {
      api.get.mockResolvedValue({
        success: true,
        data: { station: 'cuisine', items: [] },
      })
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.empty-state').exists(), { timeout: 3000 })
      expect(wrapper.text()).toContain('Aucune commande')
    })
  })

  describe('status badges', () => {
    it('affiche le bon badge de statut pour chaque commande', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      const cards = wrapper.findAll('.order-card')
      // pending, preparing, ready — each should show its status label
      expect(wrapper.text()).toContain('En attente')
      expect(wrapper.text()).toContain('En prépa')
      expect(wrapper.text()).toContain('Prêt')
    })

    it.each([
      ['pending', 'En attente'],
      ['preparing', 'En prépa'],
      ['ready', 'Prêt'],
      ['served', 'Servi'],
    ])('affiche le label %s pour le statut %s', async (_status, _label) => {
      // Test through rendering a single order with this status
      api.get.mockResolvedValue({
        success: true,
        data: {
          station: 'cuisine',
          items: [makeOrder({ id: 'test-order', status: _status })],
        },
      })
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      expect(wrapper.text()).toContain(_label)
    })
  })

  describe('item details', () => {
    it('affiche le nombre d articles dans l en-tete de la carte', async () => {
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.card-items-count').exists(), { timeout: 3000 })
      const countText = wrapper.find('.card-items-count').text()
      expect(countText).toMatch(/\d+ art\./)
    })

    it('affiche le compteur d elements et la note dans le detail etendu', async () => {
      // Override data with a single order with 'served' status to avoid auto-expand
      api.get.mockResolvedValue({
        success: true,
        data: {
          station: 'cuisine',
          items: [makeOrder({
            id: 'note-order',
            status: 'served',
            note: 'Sans gluten SVP',
            items: [
              { name: 'Pizza', qty: 1, note: 'Sans oignons', status: 'pending' },
              { name: 'Salade', qty: 2, note: null, status: 'pending' },
            ],
          })],
        },
      })
      const wrapper = mountComponent()
      await vi.waitUntil(() => wrapper.find('.order-card').exists(), { timeout: 3000 })
      const cards = wrapper.findAll('.order-card')
      await cards[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Pizza')
      expect(wrapper.text()).toContain('Sans gluten')
    })
  })
})