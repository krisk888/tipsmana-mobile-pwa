/**
 * Édition du panier avant envoi, fusion / séparation de tables, écran client
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
  baseUrl: '/api/v1',
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }))

import * as svc from '../../src/shared/serviceOrders'
import TableSelect from '../../src/views/service/TableSelect.vue'
import OrderTaking from '../../src/views/service/OrderTaking.vue'
import CustomerDisplay from '../../src/views/service/CustomerDisplay.vue'

const MENU = {
  success: true,
  data: {
    categories: [
      { id: 'c-plat', name: 'Plats', course: 'plat', items: [{ id: 'p1', name: 'Entrecôte', price_ttc: 22 }] },
      { id: 'c-ent', name: 'Entrées', course: 'entree', items: [{ id: 'p2', name: 'Velouté', price_ttc: 8.5 }, { id: 'p4', name: 'Salade', price_ttc: 7 }] },
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
    items: [
      { id: 'i-1', item_name: 'Velouté', quantity: 1, unit_price_ttc: '8.50', unit_price_ht: '7.73', vat_rate: '10.00', course: 'entree', sort_order: 0 },
      { id: 'i-2', item_name: 'Entrecôte', quantity: 1, unit_price_ttc: '22.00', unit_price_ht: '20.00', vat_rate: '10.00', course: 'plat', sort_order: 1 },
    ],
    ...overrides,
  }
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/service', name: 'Service', component: TableSelect },
      { path: '/service/history', name: 'ServiceHistory', component: { template: '<div />' } },
      { path: '/service/profile', name: 'ServiceProfile', component: { template: '<div />' } },
      { path: '/service/table/:number(\\d+)', name: 'ServiceOrder', component: OrderTaking },
      { path: '/note/:ticketId', name: 'CustomerDisplay', component: CustomerDisplay },
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
  mockApi.getToken.mockReturnValue('tok')
  mockApi.getEstablishmentId.mockReturnValue('est-1')
  setActivePinia(createPinia())
  window.__showToast = vi.fn()
})

// ── Édition du panier (logique) ──────────────────────────
describe('serviceOrders — édition du panier', () => {
  const plat = { id: 'p1', name: 'Entrecôte', price: 22, course: 'plat' }
  const ent = { id: 'p2', name: 'Velouté', price: 8.5, course: 'entree' }
  const ent2 = { id: 'p4', name: 'Salade', price: 7, course: 'entree' }

  it('supprime une ligne et édite sa note (regroupe si identique)', () => {
    let cart = svc.addLine([], plat, { note: 'saignant' })
    cart = svc.addLine(cart, plat)
    expect(svc.removeLine(cart, 0)).toHaveLength(1)
    const edited = svc.setLineNote(cart, 0, '  Sans gluten ')
    expect(edited[0].note).toBe('Sans gluten')
    // Note vidée → identique à la 2e ligne : quantités regroupées
    const merged = svc.setLineNote(cart, 0, '')
    expect(merged).toHaveLength(1)
    expect(merged[0].qty).toBe(2)
  })

  it('change de service et déplace une ligne parmi celles du même service', () => {
    let cart = svc.addLine([], ent)
    cart = svc.addLine(cart, plat)
    cart = svc.addLine(cart, ent2)
    // Salade (index 2) monte au-dessus de Velouté en sautant le plat
    const moved = svc.moveLine(cart, 2, -1)
    expect(moved.map(l => l.name)).toEqual(['Salade', 'Entrecôte', 'Velouté'])
    expect(svc.moveLine(moved, 0, -1)).toBe(moved) // déjà en tête : inchangé
    expect(svc.setLineCourse(cart, 1, 'dessert')[1].course).toBe('dessert')
    expect(svc.setLineCourse(cart, 1, 'inconnu')).toBe(cart)
  })

  it('envoie le panier trié par service', async () => {
    mockApi.post.mockImplementation(async (path) => {
      if (path === '/table-tickets/4/items') return { success: true, data: apiTicket() }
      return { success: true, data: { orders: [] } }
    })
    let cart = svc.addLine([], plat)
    cart = svc.addLine(cart, ent)
    await svc.sendOrder({ tableNumber: 4, cart })
    const body = mockApi.post.mock.calls.find(c => c[0] === '/table-tickets/4/items')[1]
    expect(body.map(b => b.item_name)).toEqual(['Velouté', 'Entrecôte'])
  })
})

describe('OrderTaking.vue — édition avant envoi', () => {
  beforeEach(() => {
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/products/pos-menu') return MENU
      if (path === '/table-tickets/4') throw Object.assign(new Error('404'), { status: 404 })
      throw new Error('unexpected ' + path)
    })
  })

  it('note, quantité et suppression avec confirmation', async () => {
    const { wrapper } = await mountAt('/service/table/4', OrderTaking)
    await wrapper.find('.ot-prod-main').trigger('click') // Velouté (entrées en premier)
    await wrapper.find('.ot-cart-header').trigger('click')

    // Édition : preset allergène + validation
    await wrapper.find('.ot-line-edit').trigger('click')
    await wrapper.findAll('.sheet-opt').find(b => b.text() === 'Sans gluten').trigger('click')
    await wrapper.findAll('.modal-actions .btn-primary').find(b => b.text() === 'Valider').trigger('click')
    expect(svc.loadDraft('est-1', 4)[0].note).toBe('Sans gluten')
    expect(wrapper.find('.ot-cart').text()).toContain('📝 Sans gluten')

    // −1 à 1 : confirmation, annulation puis suppression
    await wrapper.find('.ot-cart .ot-qty-btn').trigger('click')
    expect(wrapper.find('.modal-overlay.confirm').exists()).toBe(true)
    await wrapper.find('.modal-overlay.confirm .btn-ghost').trigger('click')
    expect(wrapper.find('.ot-cart').exists()).toBe(true)
    await wrapper.find('.ot-cart .ot-qty-btn').trigger('click')
    await wrapper.find('.modal-overlay.confirm .btn-danger').trigger('click')
    expect(wrapper.find('.ot-cart').exists()).toBe(false)
  })

  it('change le service d\'une ligne depuis l\'éditeur', async () => {
    const { wrapper } = await mountAt('/service/table/4', OrderTaking)
    await wrapper.find('.ot-prod-main').trigger('click')
    await wrapper.find('.ot-cart-header').trigger('click')
    await wrapper.find('.ot-line-edit').trigger('click')
    await wrapper.findAll('.sheet-opt').find(b => b.text().includes('Dessert')).trigger('click')
    expect(svc.loadDraft('est-1', 4)[0].course).toBe('dessert')
    expect(wrapper.find('.ot-cart .ot-group-title').text()).toContain('Dessert')
  })
})

// ── Fusion / séparation ──────────────────────────────────
describe('serviceOrders — fusion / séparation', () => {
  it('valide le corps de fusion', () => {
    expect(svc.buildMergePayload([5, 4, 5], 4)).toEqual({ table_numbers: [4, 5], target_table: 4 })
    expect(() => svc.buildMergePayload([4], 4)).toThrow(/2 tables/)
    expect(() => svc.buildMergePayload([4, 5], 9)).toThrow(/cible/)
  })

  it('fusionne et mémorise les tables rattachées', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: apiTicket() })
    const res = await svc.mergeTableTickets({ tableNumbers: [4, 5, 6], targetTable: 4 })
    expect(mockApi.post).toHaveBeenCalledWith('/table-tickets/merge', { table_numbers: [4, 5, 6], target_table: 4 })
    expect(res.ticket.tables).toEqual([4, 5, 6])
    // Les notes rechargées gardent l'information
    const [t] = svc.applyMergeRecords([svc.normalizeTicket(apiTicket())], 'est-1')
    expect(t.tables).toEqual([4, 5, 6])
  })

  it('refuse la fusion hors-ligne', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(svc.mergeTableTickets({ tableNumbers: [4, 5], targetTable: 4 })).rejects.toThrow(/Connexion/)
    expect(mockApi.post).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sépare par table (articles restants non envoyés) et oublie la fusion', async () => {
    const ticket = { ...svc.normalizeTicket(apiTicket()), tables: [4, 5] }
    expect(() => svc.buildSplitPayload(ticket, {})).toThrow(/Aucun article/)
    mockApi.post.mockResolvedValue({ success: true, data: { tickets: [apiTicket(), apiTicket({ id: 't-2', table_number: 5 })] } })
    const res = await svc.splitTableTicket({ ticket, assignments: { 'i-1': 4, 'i-2': 5 } })
    expect(mockApi.post).toHaveBeenCalledWith('/table-tickets/split', {
      table_number: 4,
      splits: [{ table_number: 5, item_ids: ['i-2'] }],
    })
    expect(res.tickets).toHaveLength(2)
  })

  it('plan de salle : table rattachée pointe vers la table principale', () => {
    const tickets = [{ ...svc.normalizeTicket(apiTicket()), tables: [4, 5] }]
    const [space] = svc.mergeTables([{ id: 's', tables: [{ number: 4 }, { number: 5 }] }], tickets)
    expect(space.tables[0].mergedWith).toEqual([5])
    expect(space.tables[1]).toMatchObject({ linkedTo: 4, state: 'occupee' })
  })
})

describe('TableSelect.vue — fusion', () => {
  beforeEach(() => {
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/floorplan/spaces') {
        return { success: true, data: [{ id: 's1', name: 'Salle', tables: [{ number: 4, state: 'occupée' }, { number: 5, state: 'libre' }] }] }
      }
      if (path === '/table-tickets/list') return { success: true, data: [apiTicket()] }
      throw new Error('unexpected ' + path)
    })
  })

  it('sélection multiple puis fusion sur la table principale', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: apiTicket() })
    const { wrapper, router } = await mountAt('/service', TableSelect)
    await wrapper.find('.svc-merge-btn').trigger('click')
    const tables = wrapper.findAll('.svc-table')
    await tables[0].trigger('click')
    expect(wrapper.find('.svc-merge-bar .btn-primary').attributes('disabled')).toBeDefined()
    await tables[1].trigger('click')
    expect(wrapper.findAll('.svc-table.selected')).toHaveLength(2)
    await wrapper.find('.svc-merge-bar .btn-primary').trigger('click')
    await wrapper.find('.modal-actions .btn-primary').trigger('click')
    await flushPromises()
    expect(mockApi.post).toHaveBeenCalledWith('/table-tickets/merge', { table_numbers: [4, 5], target_table: 4 })
    expect(router.currentRoute.value.path).toBe('/service/table/4')
  })
})

// ── Écran client ─────────────────────────────────────────
describe('Écran client', () => {
  afterEach(() => vi.useRealTimers())

  it('encode / décode l\'instantané de la note (accents compris)', () => {
    const ticket = svc.normalizeTicket(apiTicket())
    const snap = svc.decodeSnapshot(svc.encodeSnapshot(ticket, 1000))
    expect(snap).toMatchObject({ tableNumber: 4, totalTtc: 30.5, snapshotAt: 1000 })
    expect(snap.items.map(i => i.name)).toEqual(['Velouté', 'Entrecôte'])
    expect(svc.decodeSnapshot('%%%')).toBeNull()
    const url = svc.customerDisplayUrl(ticket, { origin: 'https://x.fr', base: '/mobile/' })
    expect(url).toMatch(/^https:\/\/x\.fr\/mobile\/note\/t-1\?t=4#s=[\w-]+$/)
  })

  it('appareil connecté : lit la note de la table, détecte la note réglée', async () => {
    mockApi.get.mockResolvedValueOnce({ success: true, data: apiTicket() })
    expect((await svc.fetchCustomerNote({ ticketId: 't-1', tableNumber: 4 })).ticket.id).toBe('t-1')
    mockApi.get.mockResolvedValueOnce({ success: true, data: apiTicket({ id: 't-9' }) })
    expect(await svc.fetchCustomerNote({ ticketId: 't-1', tableNumber: 4 })).toEqual({ ticket: null, closed: true })
  })

  it('client sans compte : endpoint public, sinon instantané', async () => {
    mockApi.getToken.mockReturnValue(null)
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    const ticket = svc.normalizeTicket(apiTicket())
    const { wrapper } = await mountAt(`/note/t-1?t=4#s=${svc.encodeSnapshot(ticket)}`, CustomerDisplay)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/public/table-tickets/t-1')
    expect(wrapper.find('.cd-title').text()).toBe('Table 4')
    expect(wrapper.findAll('.cd-line')).toHaveLength(2)
    expect(wrapper.find('.cd-total-amount').text()).toContain('30,50')
    expect(wrapper.find('.cd-status').classes()).toContain('stale')
    vi.unstubAllGlobals()
  })

  it('rafraîchit toutes les 10 s et affiche la note réglée', async () => {
    vi.useFakeTimers()
    mockApi.get.mockResolvedValueOnce({ success: true, data: apiTicket() })
    const { wrapper } = await mountAt('/note/t-1?t=4', CustomerDisplay)
    expect(wrapper.findAll('.cd-line')).toHaveLength(2)
    expect(wrapper.find('.cd-status').classes()).not.toContain('stale')

    mockApi.get.mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }))
    await vi.advanceTimersByTimeAsync(10000)
    await flushPromises()
    expect(mockApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Note réglée')
    wrapper.unmount()
  })
})
