/**
 * Dashboard.vue (Pilot) — chart & enhanced profile tests
 * Tests: hourly chart rendering, chart error state, profile email field,
 *        authStore navTabs showNotifDot, notification dot behavior
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

function mountDashboard() {
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

describe('Dashboard.vue — Graphique horaire', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('affiche le titre de la section graphique', async () => {
    api.get.mockResolvedValue({
      data: {
        quick_stats: { today_revenue: 0, today_transactions: 0, pending_orders: 0 },
        metrics: {},
        active_alerts: [],
        recent_activities: [],
      },
    })

    const wrapper = mountDashboard()
    await vi.waitUntil(() => wrapper.find('.chart-section').exists(), { timeout: 3000 })
    expect(wrapper.text()).toContain('Activité horaire')
  })

  it('affiche l état de chargement du graphique', async () => {
    // Dashboard data resolves, but hourly-stats stays pending
    api.get.mockImplementation((url) => {
      if (url === '/dashboard/hourly-stats') {
        return new Promise(() => {}) // Never resolves
      }
      return Promise.resolve({
        data: {
          quick_stats: { today_revenue: 100, today_transactions: 5, pending_orders: 2 },
          metrics: { average_ticket: 20, gross_profit: { current_value: 40 }, profit_margin: { current_value: 40 } },
          active_alerts: [],
          recent_activities: [],
        },
      })
    })

    const wrapper = mountDashboard()
    await vi.waitUntil(() => wrapper.find('.chart-loading').exists(), { timeout: 3000 })
    expect(wrapper.text()).toContain('Chargement')
  })

  it('affiche un message d erreur si les données horaires sont indisponibles', async () => {
    // Mock dashboard success but hourly-stats failure
    api.get.mockImplementation((url) => {
      if (url === '/dashboard/hourly-stats') {
        return Promise.reject(new Error('Not found'))
      }
      return Promise.resolve({
        data: {
          quick_stats: { today_revenue: 100, today_transactions: 5, pending_orders: 2 },
          metrics: { average_ticket: 20, gross_profit: { current_value: 40 }, profit_margin: { current_value: 40 } },
          active_alerts: [],
          recent_activities: [],
        },
      })
    })

    const wrapper = mountDashboard()
    await vi.waitUntil(() => wrapper.find('.chart-error').exists(), { timeout: 3000 })
    expect(wrapper.text()).toContain('non disponibles')
  })

  it('affiche les barres SVG quand les données horaires sont disponibles', async () => {
    const hourlyData = [
      { hour: 8, revenue: 120, orders: 3 },
      { hour: 9, revenue: 250, orders: 5 },
      { hour: 10, revenue: 180, orders: 4 },
      { hour: 11, revenue: 310, orders: 7 },
    ]

    api.get.mockImplementation((url) => {
      if (url === '/dashboard/hourly-stats') {
        return Promise.resolve({
          data: { hourly: hourlyData },
        })
      }
      return Promise.resolve({
        data: {
          quick_stats: { today_revenue: 860, today_transactions: 19, pending_orders: 3 },
          metrics: {},
          active_alerts: [],
          recent_activities: [],
        },
      })
    })

    const wrapper = mountDashboard()
    // Wait for chart section to render with SVG bars
    await vi.waitUntil(() => wrapper.find('.hourly-chart').exists(), { timeout: 3000 })
    // SVG should contain title elements with CA data
    expect(wrapper.html()).toContain('CA: 120')
    expect(wrapper.html()).toContain('CA: 310')
    expect(wrapper.html()).toContain('commande')
    // Legend should be visible
    expect(wrapper.text()).toContain('CA')
    expect(wrapper.text()).toContain('Commandes')
  })

  it('affiche la légende du graphique', async () => {
    api.get.mockResolvedValue({
      data: {
        quick_stats: { today_revenue: 0, today_transactions: 0, pending_orders: 0 },
        metrics: {},
        active_alerts: [],
        recent_activities: [],
      },
    })

    const wrapper = mountDashboard()
    await vi.waitUntil(() => wrapper.find('.chart-legend').exists(), { timeout: 3000 })
    const legendItems = wrapper.findAll('.legend-item')
    expect(legendItems.length).toBe(2)
    expect(legendItems[0].text()).toContain('CA')
    expect(legendItems[1].text()).toContain('Commandes')
  })
})
