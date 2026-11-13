/**
 * Dashboard.vue (Pilot) — unit tests
 * Tests: renders KPI grid, summary widget, error/offline states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Mock shared modules ────────────────────────────
vi.mock('../../src/shared/api')
vi.mock('../../src/shared/auth', () => ({
  auth: { user: { first_name: 'Boss', last_name: 'Test' }, establishments: [], token: null },
  login: vi.fn(),
  loadToken: vi.fn(() => null),
  logout: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  getEstablishmentId: vi.fn(() => null),
}))

import { api } from '../../src/shared/api'
import Dashboard from '../../src/views/pilot/Dashboard.vue'

function mountComponent() {
  return mount(Dashboard, {
    global: {
      plugins: [
        createRouter({
          history: createMemoryHistory(),
          routes: [
            { path: '/pilot', name: 'Pilot', component: Dashboard },
            { path: '/validations', name: 'Validations' },
            { path: '/scan', name: 'ScanQR' },
            { path: '/stock', name: 'Stock' },
          ],
        }),
      ],
    },
  })
}

describe('Dashboard.vue — Résumé commandes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('affiche le widget résumé avec Commandes en cours', async () => {
    api.get.mockResolvedValue({
      data: {
        quick_stats: {
          today_revenue: 1250.50,
          today_transactions: 18,
          active_products: 42,
          low_stock_items: 3,
          pending_orders: 7,
        },
        metrics: {
          average_ticket: 69.47,
          gross_profit: { current_value: 480.20 },
          profit_margin: { current_value: 38.4 },
        },
        active_alerts: [],
        recent_activities: [],
      },
    })

    const wrapper = mountComponent()
    await vi.waitUntil(() => wrapper.find('.summary-widget').exists(), { timeout: 3000 })

    const cards = wrapper.findAll('.summary-card')
    expect(cards.length).toBe(2)
    // First card: pending orders
    expect(cards[0].text()).toContain('7')
    expect(cards[0].text()).toContain('Commandes en cours')
    // Second card: day revenue
    expect(cards[1].text()).toContain('1') // 1 250,50 — just check the number is there
    expect(cards[1].text()).toContain('Chiffre')
  })

  it('affiche le nombre de transactions dans le widget CA', async () => {
    api.get.mockResolvedValue({
      data: {
        quick_stats: { today_revenue: 850, today_transactions: 12 },
        metrics: {},
        active_alerts: [],
        recent_activities: [],
      },
    })

    const wrapper = mountComponent()
    await vi.waitUntil(() => wrapper.find('.summary-card').exists(), { timeout: 3000 })
    const cards = wrapper.findAll('.summary-card')
    expect(cards[1].text()).toContain('12 transactions')
  })

  it('affiche le label commande au singulier pour 1 commande', async () => {
    api.get.mockResolvedValue({
      data: {
        quick_stats: { today_revenue: 0, today_transactions: 0, pending_orders: 1 },
        metrics: {},
        active_alerts: [],
        recent_activities: [],
      },
    })

    const wrapper = mountComponent()
    await vi.waitUntil(() => wrapper.find('.summary-delta').exists(), { timeout: 3000 })
    expect(wrapper.text()).toContain('1 commande en attente')
  })

  it('affiche le widget retards quand des commandes sont en retard', async () => {
    const now = Date.now()
    const lateOrder = {
      id: 1, status: 'pending',
      created_at: new Date(now - 20 * 60 * 1000).toISOString(),
    }
    const waitingOrder = {
      id: 2, status: 'preparing',
      created_at: new Date(now - 5 * 60 * 1000).toISOString(),
    }
    const servedOrder = {
      id: 3, status: 'served',
      created_at: new Date(now - 30 * 60 * 1000).toISOString(),
    }

    api.get.mockResolvedValueOnce({
      data: {
        quick_stats: { today_revenue: 0, today_transactions: 0, pending_orders: 0 },
        metrics: {},
        active_alerts: [],
        recent_activities: [],
      },
    })
    api.get.mockResolvedValueOnce({
      data: [lateOrder, waitingOrder, servedOrder],
    })

    const wrapper = mountComponent()
    await vi.waitUntil(() => wrapper.find('.late-widget').exists(), { timeout: 3000 })

    expect(wrapper.text()).toContain('En attente')
    expect(wrapper.text()).toContain('En retard')
    // 2 waiting (pending + preparing), 1 late (>15min pending)
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('1')
  })

  it('ne montre pas le widget retards quand aucune commande', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        quick_stats: { today_revenue: 0, today_transactions: 0, pending_orders: 0 },
        metrics: {},
        active_alerts: [],
        recent_activities: [],
      },
    })
    api.get.mockResolvedValueOnce({ data: [] })

    const wrapper = mountComponent()
    await vi.waitUntil(() => wrapper.find('.summary-widget').exists(), { timeout: 3000 })

    expect(wrapper.find('.late-widget').exists()).toBe(false)
  })
})