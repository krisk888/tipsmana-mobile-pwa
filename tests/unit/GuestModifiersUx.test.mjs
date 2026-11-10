/**
 * App client, modificateurs, améliorations UX
 * Tests: modificateurs (normalisation, chargement /admin/menu/modifiers et
 *        replis, ciblage par article / catégorie / service, sélection,
 *        obligatoires, suppléments, prise de commande) ; app client (lien,
 *        paramètres, addition et replis, statut des plats, manifeste, page
 *        /guest) ; tirer pour rafraîchir ; cuisine (compteur en attente,
 *        badge, vibration aux nouvelles commandes)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))

import { setLocale } from '../../src/i18n'
import * as svc from '../../src/shared/serviceOrders'
import * as mods from '../../src/shared/menuModifiers'
import * as guest from '../../src/shared/guestTicket'
import * as kw from '../../src/shared/kitchenWatch'
import { createPullTracker, usePullToRefresh, PULL_THRESHOLD } from '../../src/shared/pullToRefresh'
import OrderTaking from '../../src/views/service/OrderTaking.vue'
import GuestApp from '../../src/views/guest/GuestApp.vue'
import PullIndicator from '../../src/components/PullIndicator.vue'

const Stub = { template: '<div />' }

function notFound() {
  return Object.assign(new Error('Not Found'), { status: 404, data: { detail: 'Not Found' } })
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }
}

function setOnline(v) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

const MENU = {
  success: true,
  data: {
    categories: [
      { id: 'c-plat', name: 'Plats', course: 'plat', items: [
        { id: 'p1', name: 'Entrecôte', price_ttc: 22 },
        { id: 'p4', name: 'Burger', price_ttc: 16, modifier_group_ids: ['g-sauce'] },
      ] },
      { id: 'c-ent', name: 'Entrées', course: 'entree', items: [{ id: 'p2', name: 'Velouté', price_ttc: 8.5 }] },
    ],
  },
}

const API_GROUPS = [
  {
    id: 'g-cuisson', name: 'Cuisson', required: true, category_ids: ['c-plat'],
    options: [{ id: 'o-s', name: 'Saignant' }, { id: 'o-p', name: 'À point' }],
  },
  {
    id: 'g-sauce', name: 'Sauces', max_select: 2,
    options: [{ id: 'o-poivre', name: 'Poivre', price_delta: '1.50' }, { id: 'o-bbq', name: 'Barbecue', price_delta: 1 }, { id: 'o-mayo', name: 'Mayo' }],
  },
]

beforeEach(async () => {
  localStorage.clear()
  mockApi.get.mockReset()
  mockApi.post.mockReset()
  mockApi.getEstablishmentId.mockReturnValue('est-1')
  mockApi.getToken.mockReturnValue('tok')
  mods.resetModifiersEndpointCache()
  kw.resetKitchenWatch()
  setOnline(true)
  setActivePinia(createPinia())
  window.__showToast = vi.fn()
  navigator.vibrate = vi.fn(() => true)
  navigator.setAppBadge = vi.fn(() => Promise.resolve())
  navigator.clearAppBadge = vi.fn(() => Promise.resolve())
  await setLocale('fr', { persist: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══ 1. Modificateurs ═══════════════════════════════════════════════

describe('modificateurs — normalisation et ciblage', () => {
  it('groupes intégrés : cuisson, garniture et sauce sur les plats', () => {
    const groups = mods.defaultModifierGroups()
    expect(groups.map(g => g.id)).toEqual(['cuisson', 'garniture', 'sauce'])
    expect(groups.every(g => g.courses.includes('plat') && g.max === 1 && !g.required)).toBe(true)
    expect(mods.groupLabel(groups[2])).toBe('Sauce')
    expect(mods.modifierOptionLabel(groups[2], groups[2].options[3])).toBe('Sans sauce')
  })

  it('normalise obligatoire, choix multiples, suppléments et cibles', () => {
    const [cuisson, sauce] = mods.normalizeModifierGroups({ success: true, data: API_GROUPS })
    expect(cuisson).toMatchObject({ id: 'g-cuisson', required: true, min: 1, max: 1, categoryIds: ['c-plat'], labelKey: null })
    expect(sauce).toMatchObject({ required: false, min: 0, max: 2 })
    expect(sauce.options[0]).toEqual({ id: 'o-poivre', name: 'Poivre', priceDelta: 1.5 })
    expect(mods.normalizeModifierGroup({ id: 'x', options: [] })).toBeNull()
    expect(mods.normalizeModifierGroup({ id: 'y', multiple: true, options: ['A', 'B', 'C'] })).toMatchObject({ max: 3 })
    // Réponse sans liste reconnaissable : null (le repli s'applique)
    expect(mods.normalizeModifierGroups({ success: true, data: {} })).toBeNull()
    expect(mods.normalizeModifierGroups({ data: { groups: API_GROUPS } })).toHaveLength(2)
  })

  it('groupes d’un article : liste explicite, puis article / catégorie, puis service', () => {
    const groups = [...mods.normalizeModifierGroups(API_GROUPS), ...mods.defaultModifierGroups()]
    const [plats] = MENU.data.categories.map(svc.normalizeCategory)
    const [entrecote, burger] = plats.items
    expect(entrecote).toMatchObject({ categoryId: 'c-plat', modifierGroupIds: [] })
    // Burger : seulement les groupes qu'il liste
    expect(mods.modifierGroupsFor(burger, groups).map(g => g.id)).toEqual(['g-sauce'])
    // Entrecôte : cuisson (catégorie) + intégrés du service « plat » ; la sauce API ne vise personne
    expect(mods.modifierGroupsFor(entrecote, groups).map(g => g.id)).toEqual(['g-cuisson', 'cuisson', 'garniture', 'sauce'])
    expect(mods.modifierGroupsFor({ id: 'p2', course: 'entree', categoryId: 'c-ent' }, groups)).toEqual([])
  })

  it('sélection : choix unique, maximum, obligatoires, texte et supplément', () => {
    const [cuisson, sauce] = mods.normalizeModifierGroups(API_GROUPS)
    let sel = {}
    sel = mods.toggleModifier(sel, cuisson, 'o-s')
    sel = mods.toggleModifier(sel, cuisson, 'o-p')
    expect(sel['g-cuisson']).toEqual(['o-p'])
    expect(mods.toggleModifier(sel, cuisson, 'o-p')['g-cuisson']).toEqual([])
    sel = mods.toggleModifier(sel, sauce, 'o-bbq')
    sel = mods.toggleModifier(sel, sauce, 'o-poivre')
    expect(mods.toggleModifier(sel, sauce, 'o-mayo')).toBe(sel) // maximum atteint
    expect(mods.missingRequired([cuisson, sauce], {})).toEqual([cuisson])
    expect(mods.missingRequired([cuisson, sauce], sel)).toEqual([])
    const chosen = mods.selectedModifiers([cuisson, sauce], sel)
    expect(mods.modifiersText(chosen)).toBe('À point + Poivre + Barbecue')
    expect(mods.modifiersPrice(chosen)).toBe(2.5)
    expect(mods.modifiersText([])).toBeNull()
  })

  it('panier : supplément dans le prix unitaire, détail gardé pour le récap', () => {
    const [, sauce] = mods.normalizeModifierGroups(API_GROUPS)
    const chosen = mods.selectedModifiers([sauce], { 'g-sauce': ['o-poivre'] })
    let cart = svc.addLine([], { id: 'p4', name: 'Burger', price: 16, course: 'plat' }, { options: 'Poivre', modifiers: chosen })
    cart = svc.addLine(cart, { id: 'p4', name: 'Burger', price: 16, course: 'plat' }, { options: 'Poivre', modifiers: chosen })
    expect(cart).toHaveLength(1)
    expect(cart[0]).toMatchObject({ price: 17.5, qty: 2, options: 'Poivre', modifiers: [{ name: 'Poivre', priceDelta: 1.5, builtin: false }] })
    expect(mods.modifierChips(cart[0])).toEqual([{ label: 'Poivre', priceDelta: 1.5 }])
    // Ligne relue depuis la note : texte découpé, valeurs intégrées traduites
    expect(mods.modifierChips({ options: 'Saignant + Frites' })).toEqual([{ label: 'Saignant', priceDelta: 0 }, { label: 'Frites', priceDelta: 0 }])
  })
})

describe('modificateurs — GET /admin/menu/modifiers', () => {
  it('liste de l’API mise en cache par établissement', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: API_GROUPS })
    const res = await mods.fetchModifierGroups('est-1')
    expect(mockApi.get).toHaveBeenCalledWith('/admin/menu/modifiers')
    expect(res.source).toBe('api')
    expect(mods.cachedModifierGroups('est-1').map(g => g.id)).toEqual(['g-cuisson', 'g-sauce'])
    expect(mods.cachedModifierGroups('est-2').map(g => g.id)).toEqual(['cuisson', 'garniture', 'sauce'])
    // Réseau coupé ensuite : dernière liste reçue
    mockApi.get.mockRejectedValue(new Error('network'))
    expect((await mods.fetchModifierGroups('est-1')).source).toBe('cache')
  })

  it('route absente ou interdite : groupes intégrés, sans redemander', async () => {
    mockApi.get.mockRejectedValue(notFound())
    expect((await mods.fetchModifierGroups('est-1')).source).toBe('default')
    expect((await mods.fetchModifierGroups('est-1')).groups.map(g => g.id)).toEqual(['cuisson', 'garniture', 'sauce'])
    expect(mockApi.get).toHaveBeenCalledTimes(1)
  })
})

describe('modificateurs — prise de commande', () => {
  async function mountOrder() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/service', component: Stub },
        { path: '/service/history', component: Stub },
        { path: '/service/table/:number(\\d+)', component: OrderTaking },
      ],
    })
    router.push('/service/table/4')
    await router.isReady()
    const wrapper = mount(OrderTaking, { global: { plugins: [router, createPinia()] } })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/products/pos-menu') return MENU
      if (path === '/admin/menu/modifiers') return { success: true, data: API_GROUPS }
      if (path === '/table-tickets/4') throw notFound()
      throw new Error('unexpected ' + path)
    })
  })

  it('choix obligatoire avant ajout, supplément affiché et envoyé', async () => {
    mockApi.post.mockImplementation(async (path, body) => {
      if (path === '/table-tickets/4/items') {
        return { success: true, data: { id: 't-1', table_number: 4, status: 'open', items: body.map((b, i) => ({ id: `i-${i}`, ...b, sort_order: i })) } }
      }
      return { success: true, data: { orders: [{ ticket_ref: 'MOB-1' }] } }
    })
    const w = await mountOrder()
    await w.findAll('.ot-cat').find(c => c.text().includes('Plats')).trigger('click')
    // Burger : sa propre liste (sauces, 2 au plus), pas de cuisson
    await w.findAll('.ot-prod-main')[1].trigger('click')
    expect(w.findAll('.sheet-group .sheet-label').map(l => l.text())).toEqual(['Sauces Jusqu\'à 2', 'Note cuisine'])
    expect(w.findAll('.sheet-opt')[0].text()).toMatch(/Poivre\s*\+1,50\s€/)
    w.findAll('.modal-close').at(-1).trigger('click')
    await flushPromises()

    // Entrecôte : cuisson obligatoire
    await w.findAll('.ot-prod-main')[0].trigger('click')
    const add = () => w.find('.modal-actions .btn-primary')
    expect(add().attributes('disabled')).toBeDefined()
    expect(w.find('.sheet-missing').text()).toBe('À choisir : Cuisson')
    // Liste de l'API : elle remplace les groupes intégrés (pas de garniture / sauce ici)
    expect(w.findAll('.sheet-opt').map(b => b.text())).toEqual(['Saignant', 'À point'])
    await w.findAll('.sheet-opt').find(b => b.text() === 'Saignant').trigger('click')
    expect(w.find('.sheet-missing').exists()).toBe(false)
    await add().trigger('click')

    await w.find('.ot-cart-header').trigger('click')
    expect(w.findAll('.ot-cart .ot-mod').map(m => m.text())).toEqual(['⚙️ Saignant'])
    await w.find('.ot-send').trigger('click')
    await flushPromises()
    const body = mockApi.post.mock.calls.find(c => c[0] === '/table-tickets/4/items')[1]
    expect(body[0]).toMatchObject({ item_name: 'Entrecôte', options: 'Saignant', unit_price_ttc: 22 })
  })

  it('supplément ajouté au prix de la ligne', async () => {
    const w = await mountOrder()
    await w.findAll('.ot-cat').find(c => c.text().includes('Plats')).trigger('click')
    await w.findAll('.ot-prod-main')[1].trigger('click')
    await w.findAll('.sheet-opt').find(b => b.text().startsWith('Poivre')).trigger('click')
    expect(w.find('.modal-price').text()).toMatch(/17,50/)
    await w.find('.modal-actions .btn-primary').trigger('click')
    await w.find('.ot-cart-header').trigger('click')
    expect(w.find('.ot-cart .ot-mod').text()).toMatch(/Poivre\s*\+1,50\s€/)
    expect(w.find('.ot-cart-total').text()).toMatch(/17,50/)
  })
})

// ═══ 2. App client ═══════════════════════════════════════════════════

const GUEST_BILL = {
  success: true,
  data: {
    table_number: 7,
    establishment_name: 'Chez Kris',
    show_prices: true,
    ticket: {
      id: 't-7', status: 'open', total_ttc: '41.00',
      items: [
        { id: 'a', item_name: 'Velouté', quantity: 2, unit_price_ttc: '8.50', course: 'entree', status: 'served' },
        { id: 'b', item_name: 'Entrecôte', quantity: 1, unit_price_ttc: '22.00', options: 'Saignant + Frites', status: 'preparing' },
        { id: 'c', item_name: 'Coca', quantity: 1, unit_price_ttc: '2.00', status: null },
      ],
    },
  },
}

const PUBLIC_MENU = {
  establishment_name: 'Chez Kris',
  categories: [{ id: 'e', name: 'Entrées', items: [{ id: '1', name: 'Velouté', price_ttc: 8.5, description: 'Potimarron' }] }],
}

describe('app client — liens et données', () => {
  it('lien du QR de table et paramètres lus dans l’URL', () => {
    expect(guest.guestUrl({ table: 7, establishmentId: 'est-1' }, { origin: 'https://app.tipsmana.fr' }))
      .toBe('https://app.tipsmana.fr/mobile/guest/7?est=est-1')
    expect(guest.guestParamsFromRoute({ params: { tableId: '7' }, query: { est: 'est-1', prices: '0' } }))
      .toEqual({ table: 7, establishmentId: 'est-1', ticketId: null, token: null, hidePrices: true })
    expect(guest.guestParamsFromRoute({ params: { tableId: '0' }, query: {} }).table).toBeNull()
    // App installée ouverte sur /guest/ : dernière table consultée
    guest.rememberGuestTable(7, 'est-1')
    expect(guest.guestParamsFromRoute({ params: {}, query: {} })).toMatchObject({ table: 7, establishmentId: 'est-1' })
  })

  it('normalise l’addition : statuts KDS → en cours / prêt / servi, réglage des prix', () => {
    const bill = guest.normalizeGuestBill(GUEST_BILL, 7)
    expect(bill).toMatchObject({ tableNumber: 7, establishmentName: 'Chez Kris', showPrices: true })
    expect(bill.ticket.items.map(i => i.status)).toEqual(['servi', 'en_cours', null])
    expect(bill.ticket.totalTtc).toBe(41)
    expect(guest.statusCounts(bill.ticket.items)).toEqual({ en_cours: 1, pret: 0, servi: 2 })
    expect(guest.normalizeGuestStatus('ready')).toBe('pret')
    expect(guest.normalizeGuestStatus('pending')).toBe('en_cours')
    expect(guest.normalizeGuestBill({ data: { show_prices: false, ticket: null } }, 3)).toMatchObject({ showPrices: false, ticket: null, tableNumber: 3 })
  })

  it('statut des plats vu par l’équipe : rapproché des bons KDS', () => {
    const items = [
      { id: 'a', name: 'Entrecôte', options: 'Saignant', qty: 1 },
      { id: 'b', name: 'Entrecôte', options: 'Saignant', qty: 1 },
      { id: 'c', name: 'Coca', isKitchen: false, qty: 1 },
      { id: 'd', name: 'Tarte', qty: 1 },
    ]
    const kitchen = [{ name: 'Entrecôte (Saignant)', status: 'served' }, { name: 'Entrecôte (Saignant)', status: 'ready' }]
    expect(guest.itemStatusesFromKitchen(items, kitchen, ['a', 'b', 'c']).map(i => i.status)).toEqual(['servi', 'pret', null, null])
  })

  it('GET /tickets/{table}/guest : addition et cache', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(GUEST_BILL))
    const res = await guest.fetchGuestBill({ table: 7, establishmentId: 'est-1' }, { fetchImpl, now: 1000 })
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/tickets/7/guest?est=est-1')
    expect(res).toMatchObject({ ok: true, source: 'guest' })
    // Hors-ligne : dernière addition reçue
    setOnline(false)
    const off = await guest.fetchGuestBill({ table: 7, establishmentId: 'est-1' }, { fetchImpl })
    expect(off).toMatchObject({ ok: true, source: 'cache', at: 1000 })
    expect(off.bill.ticket.items).toHaveLength(3)
  })

  it('route absente : lien signé de l’addition, puis téléphone de l’équipe, puis indisponible', async () => {
    const fetchImpl = vi.fn(async (url) => (url.startsWith('/api/v1/public/tickets/t-7/bill?token=abc')
      ? jsonResponse({ success: true, data: { items: [{ name: 'Velouté', qty: 2, price: '8.50' }], total: '17.00', table_number: 7, status: 'open' } })
      : jsonResponse({ detail: 'Not Found' }, 404)))
    const signed = await guest.fetchGuestBill({ table: 7, ticketId: 't-7', token: 'abc' }, { fetchImpl, staffLoader: async () => null })
    expect(signed).toMatchObject({ ok: true, source: 'bill' })
    expect(signed.bill.ticket).toMatchObject({ id: 't-7', open: true, totalTtc: 17 })
    expect(signed.bill.ticket.items[0]).toMatchObject({ name: 'Velouté', qty: 2, price: 8.5, status: null })

    localStorage.clear()
    const staffLoader = vi.fn(async () => ({ tableNumber: 8, establishmentName: null, showPrices: true, ticket: null }))
    expect(await guest.fetchGuestBill({ table: 8 }, { fetchImpl, staffLoader })).toMatchObject({ ok: true, source: 'staff' })
    expect(staffLoader).toHaveBeenCalledWith(8, undefined)

    localStorage.clear()
    expect(await guest.fetchGuestBill({ table: 9 }, { fetchImpl, staffLoader: async () => null })).toEqual({ ok: false, reason: 'unavailable' })
    expect(await guest.fetchGuestBill({}, { fetchImpl })).toEqual({ ok: false, reason: 'noTable' })
  })

  it('téléphone de l’équipe : note de la table + statut cuisine des bons envoyés', async () => {
    localStorage.setItem('tipsmana_service_kitchen', JSON.stringify({ 'est-1': {
      't-1': { refs: ['MOB-1'], sentItemIds: ['i-1'], failedItemIds: [], tableNumber: 4, at: Date.now() },
    } }))
    mockApi.get.mockImplementation(async (path) => {
      if (path === '/table-tickets/4') {
        return { success: true, data: { id: 't-1', table_number: 4, status: 'open', total_ttc: '30.50', items: [
          { id: 'i-1', item_name: 'Entrecôte', quantity: 1, unit_price_ttc: '22.00', options: 'À point', sort_order: 0 },
          { id: 'i-2', item_name: 'Velouté', quantity: 1, unit_price_ttc: '8.50', sort_order: 1 },
        ] } }
      }
      if (path.startsWith('/cash/tickets/MOB-1/kitchen-status')) return { success: true, data: { items: [{ name: 'Entrecôte (À point)', status: 'ready' }] } }
      throw new Error('unexpected ' + path)
    })
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404))
    const res = await guest.fetchGuestBill({ table: 4, establishmentId: 'est-1' }, { fetchImpl })
    expect(res.source).toBe('staff')
    expect(res.bill.ticket.items.map(i => [i.name, i.status])).toEqual([['Entrecôte', 'pret'], ['Velouté', null]])
    // Autre établissement que celui du téléphone : pas d'aperçu équipe
    localStorage.removeItem('tipsmana_guest_bill')
    expect(await guest.fetchGuestBill({ table: 4, establishmentId: 'est-2' }, { fetchImpl })).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('manifeste « Tipsmana Client » posé puis rétabli', () => {
    document.head.innerHTML = '<link rel="manifest" href="/mobile/manifest.webmanifest"><link rel="apple-touch-icon" href="/mobile/icons/icon-192.png">'
    const restore = guest.applyGuestManifest(document)
    expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('/mobile/guest.webmanifest')
    expect(document.head.querySelector('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('/mobile/icons/guest-192.png')
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('Tipsmana Client')
    restore()
    expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('/mobile/manifest.webmanifest')
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')).toBeNull()
  })
})

describe('app client — page /guest', () => {
  let fetchSpy
  beforeEach(() => {
    mockApi.getToken.mockReturnValue(null)
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  async function mountGuest(path) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/guest/:tableId(\\d+)?', component: GuestApp }, { path: '/mon-add/:table?', component: Stub }],
    })
    router.push(path)
    await router.isReady()
    const w = mount(GuestApp, { global: { plugins: [router] } })
    await flushPromises()
    return w
  }

  it('addition : articles, modificateurs, statut de chaque plat, total', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(GUEST_BILL))
    const w = await mountGuest('/guest/7?est=est-1')
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/v1/tickets/7/guest?est=est-1')
    expect(w.find('.gu-title').text()).toBe('Chez Kris')
    expect(w.find('.gu-table').text()).toBe('Table 7')
    expect(w.find('.gu-tab.active').text()).toContain('Mon addition')
    const lines = w.findAll('.gu-line')
    expect(lines).toHaveLength(3)
    expect(lines[0].find('.gu-status').text()).toBe('✅ Servi')
    expect(lines[1].findAll('.gu-mod').map(m => m.text())).toEqual(['Saignant', 'Frites'])
    expect(lines[1].find('.gu-status').text()).toBe('🔥 En préparation')
    expect(lines[2].find('.gu-status').exists()).toBe(false)
    expect(w.find('.gu-total-amount').text()).toMatch(/41,00\s€/)
    expect(w.findAll('.gu-progress-chip').map(c => c.text())).toEqual(['🔥 1 en préparation', '🛎️ 0 prêt', '✅ 2 servis'])
    // Appel serveur dans l'app (feuille), plus de saut vers /mon-add
    expect(w.find('.gu-call').exists()).toBe(true)
    expect(JSON.parse(localStorage.getItem('tipsmana_guest_last'))).toEqual({ table: 7, establishmentId: 'est-1' })
    w.unmount()
  })

  it('rien de commandé : carte ouverte, sans prix si l’établissement le demande', async () => {
    fetchSpy.mockImplementation(async (url) => (url.includes('/guest')
      ? jsonResponse({ data: { table_number: 3, show_prices: false, ticket: null } })
      : jsonResponse(PUBLIC_MENU)))
    const w = await mountGuest('/guest/3?est=est-1')
    expect(w.find('.gu-tab.active').text()).toContain('La carte')
    expect(w.find('.gu-dish-name').text()).toBe('Velouté')
    expect(w.find('.gu-dish-desc').text()).toBe('Potimarron')
    expect(w.find('.gu-dish-price').exists()).toBe(false)
    await w.findAll('.gu-tab')[0].trigger('click')
    expect(w.find('.gu-state-title').text()).toBe("Rien de commandé pour l'instant")
    w.unmount()
  })

  it('?prices=0 sur le QR : carte sans prix ; addition réglée affichée', async () => {
    fetchSpy.mockImplementation(async (url) => (url.includes('/guest')
      ? jsonResponse({ data: { ticket: { id: 't', status: 'closed', total_ttc: 8.5, items: [{ id: 'a', item_name: 'Velouté', quantity: 1, unit_price_ttc: 8.5, status: 'served' }] } } })
      : jsonResponse(PUBLIC_MENU)))
    const w = await mountGuest('/guest/5?prices=0')
    expect(w.find('.gu-banner.ok').text()).toContain('Addition réglée')
    expect(w.find('.gu-status').exists()).toBe(false)
    await w.findAll('.gu-tab')[1].trigger('click')
    await flushPromises()
    expect(w.find('.gu-dish-name').exists()).toBe(true)
    expect(w.find('.gu-dish-price').exists()).toBe(false)
    w.unmount()
  })

  it('sans table : invite à scanner le QR code', async () => {
    const w = await mountGuest('/guest')
    expect(w.find('.gu-state-title').text()).toBe('Scannez le QR code de votre table')
    expect(fetchSpy).not.toHaveBeenCalled()
    w.unmount()
  })

  it('addition indisponible : message et bouton réessayer', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ detail: 'Not Found' }, 404))
    const w = await mountGuest('/guest/2')
    await w.findAll('.gu-tab')[0].trigger('click')
    expect(w.find('.gu-state-title').text()).toBe('Addition indisponible')
    expect(w.find('.gu-btn').exists()).toBe(true)
    w.unmount()
  })
})

// ═══ 3. Tirer pour rafraîchir ═══════════════════════════════════════

describe('tirer pour rafraîchir', () => {
  it('suivi du geste : résistance, seuil, abandon horizontal ou vers le haut', () => {
    const tr = createPullTracker({ threshold: 70, max: 110 })
    tr.start(100, 100)
    expect(tr.move(100, 200)).toBe(50)
    expect(tr.armed).toBe(false)
    expect(tr.move(102, 260)).toBe(80)
    expect(tr.armed).toBe(true)
    expect(tr.move(100, 600)).toBe(110) // plafond
    expect(tr.end()).toBe(true)

    tr.start(100, 100)
    tr.move(180, 120) // horizontal d'abord : onglets qui défilent
    expect(tr.active).toBe(false)
    expect(tr.move(100, 300)).toBe(0)
    expect(tr.end()).toBe(false)

    tr.start(100, 100)
    tr.move(100, 60) // vers le haut : défilement normal
    expect(tr.active).toBe(false)
  })

  function touch(type, x, y, target = window) {
    const e = new Event(type, { bubbles: true })
    Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] })
    target.dispatchEvent(e)
  }

  it('composable : rafraîchit au-delà du seuil, ignore les éléments exclus', async () => {
    let resolve
    const onRefresh = vi.fn(() => new Promise(r => { resolve = r }))
    const Host = defineComponent({
      setup() {
        const pull = usePullToRefresh(onRefresh, { ignore: '.no-pull' })
        return () => h('div', [
          h(PullIndicator, { distance: pull.distance.value, refreshing: pull.refreshing.value, threshold: PULL_THRESHOLD }),
          h('span', { class: 'no-pull' }, 'table'),
        ])
      },
    })
    const w = mount(Host, { attachTo: document.body })
    expect(document.documentElement.style.overscrollBehaviorY).toBe('contain')

    touch('touchstart', 50, 10)
    touch('touchmove', 50, 80)
    await flushPromises()
    expect(w.find('.ptr-label').text()).toBe('Tirer pour actualiser')
    touch('touchmove', 50, 200)
    await flushPromises()
    expect(w.find('.ptr-label').text()).toBe('Relâcher pour actualiser')
    expect(navigator.vibrate).toHaveBeenCalledWith(10)
    touch('touchend')
    await flushPromises()
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(w.find('.ptr-spinner').exists()).toBe(true)
    resolve()
    await flushPromises()
    expect(w.find('.ptr').exists()).toBe(false)

    // Geste parti d'une table (élément exclu) : rien
    const table = w.find('.no-pull').element
    touch('touchstart', 50, 10, table)
    touch('touchmove', 50, 300)
    touch('touchend')
    await flushPromises()
    expect(onRefresh).toHaveBeenCalledTimes(1)

    w.unmount()
    expect(document.documentElement.style.overscrollBehaviorY).toBe('')
  })
})

// ═══ 4. Cuisine : en attente, badge, vibration ══════════════════════

describe('cuisine — commandes en attente', () => {
  const order = (id, status = 'pending') => ({ id, status, created_at: '2026-11-10T12:00:00' })

  it('compte les bons non servis ; premier relevé sans alerte, puis vibration aux nouveaux', () => {
    expect(kw.countWaitingOrders([order('a'), order('b', 'preparing'), order('c', 'ready'), order('d', 'served')])).toBe(3)
    expect(kw.reportKitchenOrders([order('a')], { alert: true })).toEqual([])
    expect(navigator.vibrate).not.toHaveBeenCalled()
    expect(kw.kitchenPendingCount.value).toBe(1)
    const fresh = kw.reportKitchenOrders([order('a'), order('b'), order('c', 'served')], { alert: true })
    expect(fresh.map(o => o.id)).toEqual(['b'])
    expect(navigator.vibrate).toHaveBeenCalledWith(kw.NEW_ORDER_VIBRATION)
    expect(kw.kitchenPendingCount.value).toBe(2)
    // Écran cuisine : il alerte lui-même (pas de vibration ici)
    kw.reportKitchenOrders([order('a'), order('b'), order('e')])
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('cuisine vide au premier relevé : la première commande alerte quand même', () => {
    kw.reportKitchenOrders([], { alert: true })
    expect(kw.reportKitchenOrders([order('x')], { alert: true })).toHaveLength(1)
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('relevé de fond : badge de l’icône = commandes en attente, remis à zéro à l’arrêt', async () => {
    vi.useFakeTimers()
    mockApi.get.mockResolvedValueOnce({ success: true, data: [order('a')] })
      .mockResolvedValueOnce({ success: true, data: [order('a'), order('b', 'preparing')] })
    const stop = kw.startKitchenWatcher({ alert: true, appBadge: true, interval: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockApi.get).toHaveBeenCalledWith('/cash/kds/cuisine?include_served=false')
    expect(navigator.setAppBadge).toHaveBeenLastCalledWith(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(navigator.setAppBadge).toHaveBeenLastCalledWith(2)
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
    expect(kw.kitchenPendingCount.value).toBe(2)
    stop()
    expect(navigator.clearAppBadge).toHaveBeenCalled()
    expect(kw.kitchenPendingCount.value).toBe(0)
  })

  it('écran cuisine actif : le relevé de fond est sauté', async () => {
    vi.useFakeTimers()
    mockApi.get.mockResolvedValue({ success: true, data: [] })
    const stop = kw.startKitchenWatcher({ interval: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(800)
    kw.reportKitchenOrders([order('a')]) // l'écran vient de charger les bons
    await vi.advanceTimersByTimeAsync(200)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    expect(kw.kitchenPendingCount.value).toBe(1)
    stop()
  })
})

describe('app client — rafraîchissement', () => {
  it('pas encore de note : continue de relever ; addition réglée : s’arrête', async () => {
    vi.useFakeTimers()
    mockApi.getToken.mockReturnValue(null)
    const bills = [
      { data: { ticket: null } },
      { data: { ticket: { id: 't', status: 'open', items: [{ id: 'a', item_name: 'Velouté', quantity: 1, unit_price_ttc: 8.5, status: 'pending' }] } } },
      { data: { ticket: { id: 't', status: 'closed', items: [{ id: 'a', item_name: 'Velouté', quantity: 1, unit_price_ttc: 8.5, status: 'served' }] } } },
    ]
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url.includes('/guest')
      ? jsonResponse(bills.shift() || { data: { ticket: null } })
      : jsonResponse(PUBLIC_MENU)))
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/guest/:tableId(\\d+)?', component: GuestApp }, { path: '/mon-add/:table?', component: Stub }] })
    router.push('/guest/6')
    await router.isReady()
    const w = mount(GuestApp, { global: { plugins: [router] } })
    await vi.advanceTimersByTimeAsync(0)
    const guestCalls = () => fetchSpy.mock.calls.filter(c => c[0].includes('/guest')).length
    expect(guestCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(guest.GUEST_POLL_MS)
    expect(guestCalls()).toBe(2)
    await w.findAll('.gu-tab')[0].trigger('click')
    expect(w.find('.gu-status').text()).toBe('🔥 En préparation')
    await vi.advanceTimersByTimeAsync(guest.GUEST_POLL_MS)
    expect(w.find('.gu-banner.ok').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(guest.GUEST_POLL_MS * 2)
    expect(guestCalls()).toBe(3)
    w.unmount()
  })
})
