/**
 * serviceOrders.js + vues Service — unit tests
 * Tests: totaux HT/TTC, panier, fusion plan/notes, statuts, historique soldé,
 *        envoi (note + cuisine), relance, établissement courant, vues
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))

import * as svc from '../../src/shared/serviceOrders'
import TableSelect from '../../src/views/service/TableSelect.vue'
import OrderTaking from '../../src/views/service/OrderTaking.vue'
import OrderHistory from '../../src/views/service/OrderHistory.vue'

// ── Fixtures ─────────────────────────────────────────────
const MENU = {
  success: true,
  data: {
    categories: [
      { id: 'c-plat', name: 'Plats', course: 'plat', items: [{ id: 'p1', name: 'Entrecôte', price_ttc: 22 }] },
      { id: 'c-ent', name: 'Entrées', course: 'entree', items: [{ id: 'p2', name: 'Velouté', price_ttc: 8.5 }] },
      { id: 'c-bois', name: 'Boissons', course: 'autre', items: [{ id: 'p3', name: 'Coca', price_ttc: 4 }] },
      { id: 'c-vide', name: 'Vide', course: 'autre', items: [] },
    ],
  },
}

function apiTicket(overrides = {}) {
  return {
    id: 't-1',
    table_number: 4,
    status: 'open',
    total_ttc: '30.50',
    total_ht: '27.73',
    covers: 2,
    serveur_name: 'Léa',
    opened_at: '2026-11-07T12:00:00',
    items: [
      { id: 'i-1', item_name: 'Velouté', quantity: 1, unit_price_ttc: '8.50', unit_price_ht: '7.73', vat_rate: '10.00', course: 'entree', is_kitchen: true, sort_order: 0 },
      { id: 'i-2', item_name: 'Entrecôte', quantity: 1, unit_price_ttc: '22.00', unit_price_ht: '20.00', vat_rate: '10.00', options: 'À point', course: 'plat', is_kitchen: true, sort_order: 1 },
    ],
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/service', name: 'Service', component: TableSelect },
      { path: '/service/history', name: 'ServiceHistory', component: OrderHistory },
      { path: '/service/table/:number(\\d+)', name: 'ServiceOrder', component: OrderTaking },
    ],
  })
}

async function mountAt(path, component) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router, createPinia()] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  localStorage.clear()
  mockApi.get.mockReset()
  mockApi.post.mockReset()
  mockApi.getEstablishmentId.mockReturnValue('est-1')
  setActivePinia(createPinia())
  window.__showToast = vi.fn()
})

// ── Logique pure ─────────────────────────────────────────
describe('serviceOrders — panier et totaux', () => {
  const plat = { id: 'p1', name: 'Entrecôte', price: 22, vatRate: 10, course: 'plat' }
  const vin = { id: 'p9', name: 'Vin', price: 6, vatRate: 20, course: 'boisson' }

  it('fusionne les lignes identiques et sépare options / notes', () => {
    let cart = svc.addLine([], plat)
    cart = svc.addLine(cart, plat, { qty: 2 })
    expect(cart).toHaveLength(1)
    expect(cart[0].qty).toBe(3)
    cart = svc.addLine(cart, plat, { options: 'Saignant' })
    cart = svc.addLine(cart, plat, { note: 'sans sel' })
    expect(cart).toHaveLength(3)
  })

  it('setLineQty supprime la ligne à 0', () => {
    const cart = svc.addLine([], plat, { qty: 2 })
    expect(svc.setLineQty(cart, 0, 1)[0].qty).toBe(1)
    expect(svc.setLineQty(cart, 0, 0)).toEqual([])
  })

  it('calcule HT / TVA / TTC avec taux par ligne', () => {
    let cart = svc.addLine([], plat, { qty: 2 }) // 44 TTC @10 % → 40 HT
    cart = svc.addLine(cart, vin) // 6 TTC @20 % → 5 HT
    expect(svc.computeTotals(cart)).toEqual({ ttc: 50, ht: 45, tva: 5 })
  })

  it('groupe les lignes par service dans l\'ordre entrée → plat → dessert', () => {
    const lines = [{ course: 'dessert' }, { course: 'entree' }, { course: 'plat' }, { course: 'xyz' }]
    expect(svc.groupByCourse(lines).map(g => g.key)).toEqual(['entree', 'plat', 'dessert', 'autre'])
  })
})

describe('serviceOrders — normalisation', () => {
  it('déduit les boissons à partir du nom de catégorie', () => {
    expect(svc.resolveCourse({ name: 'Boissons', course: 'autre' })).toBe('boisson')
    expect(svc.resolveCourse({ name: 'Cafés', course: 'autre' })).toBe('boisson')
    expect(svc.resolveCourse({ name: 'Vinaigrettes', course: 'autre' })).toBe('autre')
    expect(svc.resolveCourse({ name: 'Plats', course: 'plat' })).toBe('plat')
  })

  it('normalise les états de table du backend', () => {
    expect(svc.normalizeTableState('occupée')).toBe('occupee')
    expect(svc.normalizeTableState('addition')).toBe('addition')
    expect(svc.normalizeTableState(undefined)).toBe('libre')
  })

  it('fusionne plan de salle et notes ouvertes (table hors plan incluse)', () => {
    const spaces = [{ id: 's1', name: 'Salle', tables: [{ number: 2, state: 'libre' }, { number: 4, state: 'libre' }] }]
    const tickets = [svc.normalizeTicket(apiTicket()), svc.normalizeTicket(apiTicket({ id: 't-9', table_number: 42 }))]
    const merged = svc.mergeTables(spaces, tickets)
    const t4 = merged[0].tables.find(t => t.number === 4)
    expect(t4).toMatchObject({ state: 'occupee', total: 30.5, itemCount: 2, ticketId: 't-1' })
    expect(merged[0].tables.find(t => t.number === 2).state).toBe('libre')
    expect(merged[1]).toMatchObject({ id: '__autres' })
    expect(merged[1].tables[0].number).toBe(42)
  })
})

describe('serviceOrders — statuts et historique', () => {
  it('orderStatus : en cours / en cuisine / servi / soldé', () => {
    expect(svc.orderStatus({ refs: [] })).toBe('en_cours')
    expect(svc.orderStatus({ refs: ['MOB-1'], kitchenItems: [{ status: 'ready' }] })).toBe('en_cuisine')
    expect(svc.orderStatus({ refs: ['MOB-1'], kitchenItems: [{ status: 'served' }] })).toBe('servi')
    expect(svc.orderStatus({ closed: true, refs: ['MOB-1'] })).toBe('solde')
  })

  it('une note connue qui n\'est plus ouverte devient soldée, puis expire', () => {
    const t = svc.normalizeTicket(apiTicket())
    let store = svc.reconcileHistory({}, [t], 1000)
    expect(store['t-1'].closedAt).toBeNull()
    store = svc.reconcileHistory(store, [], 2000)
    expect(store['t-1'].closedAt).toBe(2000)
    store = svc.reconcileHistory(store, [], 3000)
    expect(store['t-1'].closedAt).toBe(2000)
    store = svc.reconcileHistory(store, [], 2000 + 19 * 3600 * 1000)
    expect(store['t-1']).toBeUndefined()
  })

  it('historique isolé par établissement', () => {
    const t = svc.normalizeTicket(apiTicket())
    svc.syncHistory('est-1', [t])
    expect(svc.syncHistory('est-2', [])).toEqual([])
    expect(svc.syncHistory('est-1', [])[0].closedAt).toBeTruthy()
  })
})

describe('serviceOrders — envoi', () => {
  const cart = [
    { productId: 'p2', name: 'Velouté', price: 8.5, vatRate: 10, qty: 1, options: null, note: null, course: 'entree', isKitchen: true },
    { productId: 'p1', name: 'Entrecôte', price: 22, vatRate: 10, qty: 1, options: 'À point', note: null, course: 'plat', isKitchen: true },
  ]

  it('ouvre la table, enregistre la note puis envoie en cuisine avec l\'établissement courant', async () => {
    mockApi.post.mockImplementation(async (path) => {
      if (path.endsWith('/open')) return { success: true, data: {} }
      if (path === '/table-tickets/4/items') return { success: true, data: apiTicket() }
      if (path === '/cash/dispatch') return { success: true, data: { orders: [{ ticket_ref: 'MOB-AB12' }] } }
      throw new Error('unexpected ' + path)
    })
    const res = await svc.sendOrder({ tableNumber: 4, cart, covers: 3, openTable: true })

    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/floorplan/tables/4/open', { covers: 3 })
    const [, itemsBody] = mockApi.post.mock.calls[1]
    expect(itemsBody[1]).toMatchObject({ item_name: 'Entrecôte', quantity: 1, unit_price_ttc: 22, options: 'À point', course: 'plat' })
    const [, dispatch] = mockApi.post.mock.calls[2]
    expect(dispatch.establishment_id).toBe('est-1')
    expect(dispatch.table).toBe('4')
    expect(dispatch.items.map(i => i.course_number)).toEqual([0, 1])
    expect(dispatch.items[1].product_name).toBe('Entrecôte (À point)')
    expect(dispatch.notes['1']).toBe('Table 4 · Plat')

    expect(res).toMatchObject({ dispatched: true, refs: ['MOB-AB12'] })
    expect(svc.getKitchenRecord('est-1', 't-1')).toMatchObject({ refs: ['MOB-AB12'], sentItemIds: ['i-1', 'i-2'], failedItemIds: [] })
  })

  it('échec cuisine : note conservée, articles marqués à renvoyer, relance OK', async () => {
    mockApi.post.mockImplementation(async (path) => {
      if (path === '/table-tickets/4/items') return { success: true, data: apiTicket() }
      throw Object.assign(new Error('boom'), { status: 500 })
    })
    const res = await svc.sendOrder({ tableNumber: 4, cart })
    expect(res.dispatched).toBe(false)
    expect(svc.getKitchenRecord('est-1', 't-1').failedItemIds).toEqual(['i-1', 'i-2'])

    mockApi.post.mockResolvedValue({ success: true, data: { orders: [{ ticket_ref: 'MOB-RETRY' }] } })
    const retry = await svc.retryFailedDispatch(res.ticket)
    expect(retry.dispatched).toBe(true)
    expect(svc.getKitchenRecord('est-1', 't-1')).toMatchObject({ refs: ['MOB-RETRY'], failedItemIds: [] })
  })

  it('hors-ligne : note et envoi cuisine mis en file', async () => {
    mockApi.post.mockResolvedValue({ success: true, offline: true, queued: true })
    const res = await svc.sendOrder({ tableNumber: 4, cart })
    expect(res.queued).toBe(true)
    expect(mockApi.post.mock.calls.map(c => c[0])).toEqual(['/table-tickets/4/items', '/cash/dispatch'])
  })

  it('refuse l\'envoi sans établissement actif', async () => {
    mockApi.getEstablishmentId.mockReturnValue(null)
    await expect(svc.sendOrder({ tableNumber: 4, cart })).rejects.toThrow('Aucun établissement actif')
    expect(mockApi.post).not.toHaveBeenCalled()
  })
})

// ── Vues ─────────────────────────────────────────────────
describe('TableSelect.vue', () => {
  beforeEach(() => {
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/floorplan/spaces') {
        return { success: true, data: [{ id: 's1', name: 'Salle', tables: [{ number: 1, state: 'libre' }, { number: 4, state: 'occupée', covers: 2 }] }] }
      }
      if (path === '/table-tickets/list') return { success: true, data: [apiTicket()] }
      throw new Error('unexpected ' + path)
    })
  })

  it('affiche les tables avec leur statut et filtre libres / occupées', async () => {
    const { wrapper } = await mountAt('/service', TableSelect)
    const tables = wrapper.findAll('.svc-table')
    expect(tables).toHaveLength(2)
    expect(tables[0].classes()).toContain('state-libre')
    expect(tables[1].classes()).toContain('state-occupee')
    expect(tables[1].text()).toContain('30,50')

    await wrapper.findAll('.svc-chip').find(c => c.text().startsWith('Libres')).trigger('click')
    expect(wrapper.findAll('.svc-table')).toHaveLength(1)
  })

  it('table libre → couverts puis prise de commande', async () => {
    const { wrapper, router } = await mountAt('/service', TableSelect)
    await wrapper.findAll('.svc-table')[0].trigger('click')
    expect(wrapper.find('.covers-grid').exists()).toBe(true)
    await wrapper.findAll('.covers-btn')[3].trigger('click')
    await wrapper.find('.modal-actions .btn-primary').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/service/table/1?covers=4&open=1')
  })

  it('table occupée → directement la prise de commande', async () => {
    const { wrapper, router } = await mountAt('/service', TableSelect)
    await wrapper.findAll('.svc-table')[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/service/table/4')
  })
})

describe('OrderTaking.vue', () => {
  beforeEach(() => {
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/products/pos-menu') return MENU
      if (path === '/table-tickets/4') throw Object.assign(new Error('404'), { status: 404 })
      throw new Error('unexpected ' + path)
    })
  })

  it('navigue par catégories (vides masquées, entrées en premier)', async () => {
    const { wrapper } = await mountAt('/service/table/4', OrderTaking)
    const cats = wrapper.findAll('.ot-cat').map(c => c.text())
    expect(cats).toEqual(['🥗 Entrées', '🍽 Plats', '🥤 Boissons'])
    expect(wrapper.find('.ot-prod-name').text()).toBe('Velouté')
    await wrapper.findAll('.ot-cat')[2].trigger('click')
    expect(wrapper.find('.ot-prod-name').text()).toBe('Coca')
  })

  it('ajout rapide, fiche options, panier HT/TTC et envoi', async () => {
    mockApi.post.mockImplementation(async (path) => {
      if (path === '/table-tickets/4/items') return { success: true, data: apiTicket() }
      if (path === '/cash/dispatch') return { success: true, data: { orders: [{ ticket_ref: 'MOB-1' }] } }
      return { success: true, data: {} }
    })
    const { wrapper } = await mountAt('/service/table/4', OrderTaking)

    // Entrée sans options : ajout direct
    await wrapper.find('.ot-prod-main').trigger('click')
    expect(wrapper.find('.ot-prod-badge').text()).toBe('1')

    // Plat avec options : fiche
    await wrapper.findAll('.ot-cat')[1].trigger('click')
    await wrapper.find('.ot-prod-main').trigger('click')
    expect(wrapper.find('.sheet-opts').exists()).toBe(true)
    await wrapper.findAll('.sheet-opt').find(b => b.text() === 'À point').trigger('click')
    await wrapper.find('.modal-actions .btn-primary').trigger('click')

    await wrapper.find('.ot-cart-header').trigger('click')
    const totals = wrapper.find('.ot-cart .ot-totals').text()
    expect(totals).toContain('27,73') // HT
    expect(totals).toContain('30,50') // TTC

    await wrapper.find('.ot-send').trigger('click')
    await flushPromises()
    expect(mockApi.post).toHaveBeenCalledWith('/floorplan/tables/4/open', { covers: 1 })
    expect(mockApi.post).toHaveBeenCalledWith('/table-tickets/4/items', expect.any(Array))
    expect(wrapper.find('.ot-cart').exists()).toBe(false)
    expect(window.__showToast).toHaveBeenCalledWith('Table 4 envoyée en cuisine', 'success')
  })

  it('conserve le panier en brouillon par établissement et table', async () => {
    const { wrapper } = await mountAt('/service/table/4', OrderTaking)
    await wrapper.find('.ot-prod-main').trigger('click')
    await flushPromises()
    expect(svc.loadDraft('est-1', 4)).toHaveLength(1)
    expect(svc.loadDraft('est-2', 4)).toHaveLength(0)
  })
})

describe('OrderHistory.vue', () => {
  it('liste les commandes par table avec statut cuisine', async () => {
    // Note déjà envoyée en cuisine depuis ce téléphone
    localStorage.setItem('tipsmana_service_kitchen', JSON.stringify({
      'est-1': { 't-1': { refs: ['MOB-1'], sentItemIds: ['i-1', 'i-2'], failedItemIds: [], at: Date.now() } },
    }))
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/table-tickets/list') {
        return { success: true, data: [apiTicket(), apiTicket({ id: 't-2', table_number: 7, items: [] })] }
      }
      if (path.startsWith('/cash/tickets/MOB-1/kitchen-status')) {
        return { success: true, data: { items: [{ name: 'Velouté', qty: 1, status: 'ready' }, { name: 'Entrecôte', qty: 1, status: 'preparing' }] } }
      }
      throw new Error('unexpected ' + path)
    })
    const { wrapper } = await mountAt('/service/history', OrderHistory)
    const cards = wrapper.findAll('.oh-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('Table 4')
    expect(cards[0].find('.oh-badge').text()).toContain('En cuisine')
    expect(cards[0].text()).toContain('1 prêt(s) à servir')
    expect(cards[1].find('.oh-badge').text()).toContain('En cours')
  })
})
