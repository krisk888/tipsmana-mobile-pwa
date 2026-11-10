/**
 * Carte numérique client, inventaire complet, historique des tables
 * Tests: langue du navigateur, lien / normalisation / chargement de la carte
 *        (route publique, aperçu équipe, cache), page /menu ; comptage (photo,
 *        saisies, résumé, envoi /inventory/count ou session, gel des
 *        ajustements, abandon), page /stock/count ; journal d'occupation,
 *        attente / durée / stats, appui long, feuille d'historique
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))

import { detectBrowserLocale, hasSavedLocale, setLocale, LOCALE_KEY } from '../../src/i18n'
import * as pm from '../../src/shared/publicMenu'
import * as ic from '../../src/shared/inventoryCount'
import * as inv from '../../src/shared/inventory'
import * as th from '../../src/shared/tableHistory'
import { createLongPress } from '../../src/shared/longPress'
import { normalizeTicket } from '../../src/shared/serviceOrders'
import MenuPublic from '../../src/views/service/MenuPublic.vue'
import InventoryCount from '../../src/views/stock/InventoryCount.vue'
import InventoryItems from '../../src/views/stock/InventoryItems.vue'
import TableHistorySheet from '../../src/components/TableHistorySheet.vue'

const Stub = { template: '<div />' }

function notFound() {
  return Object.assign(new Error('Not Found'), { status: 404 })
}

function setOnline(v) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }
}

beforeEach(async () => {
  localStorage.clear()
  vi.clearAllMocks()
  mockApi.getEstablishmentId.mockReturnValue('est-1')
  mockApi.getToken.mockReturnValue('tok')
  setOnline(true)
  inv.resetInventoryState()
  th.resetTableHistoryState()
  setActivePinia(createPinia())
  await setLocale('fr', { persist: false })
})

/* ═══ 1. Carte numérique ═══ */

describe('langue du navigateur', () => {
  it('prend la première langue gérée, repli français', () => {
    expect(detectBrowserLocale(['es-ES', 'en'])).toBe('es')
    expect(detectBrowserLocale(['de-DE', 'en-US'])).toBe('en')
    expect(detectBrowserLocale(['de', 'it'])).toBe('fr')
    expect(detectBrowserLocale([])).toBe('fr')
    expect(detectBrowserLocale(['EN_gb'])).toBe('en')
  })

  it('hasSavedLocale : seulement un choix explicite valide', () => {
    expect(hasSavedLocale()).toBe(false)
    localStorage.setItem(LOCALE_KEY, 'xx')
    expect(hasSavedLocale()).toBe(false)
    localStorage.setItem(LOCALE_KEY, 'es')
    expect(hasSavedLocale()).toBe(true)
  })
})

const PUBLIC_MENU = {
  data: {
    establishment_name: 'Chez Kris',
    categories: [
      {
        id: 'c1', name: 'Entrées', description: 'Pour commencer',
        items: [
          { id: 'p1', name: 'Velouté', description: 'Potimarron, noisettes', price_ttc: '8.5', image_url: '/img/veloute.jpg', allergens: ['fruits à coque'] },
          { id: 'p2', name: 'Terrine', price_ttc: 9 },
          { name: 'sans id' },
        ],
      },
      { id: 'c2', name: 'Vide', items: [] },
      { id: 'c3', name: 'Desserts', image_url: '/img/desserts.jpg', items: [{ id: 'p3', name: 'Tarte', price: 7 }] },
    ],
  },
}

describe('publicMenu — lien et normalisation', () => {
  it('menuUrl / menuParamsFromRoute', () => {
    expect(pm.menuUrl({ table: 12, establishmentId: 'est-1' }, { origin: 'https://app.tipsmana.fr' }))
      .toBe('https://app.tipsmana.fr/mobile/menu?table=12&est=est-1')
    expect(pm.menuUrl({}, { origin: 'https://x' })).toBe('https://x/mobile/menu')
    expect(pm.menuParamsFromRoute({ params: {}, query: { table: '4', est: 'e9' } })).toEqual({ table: 4, establishmentId: 'e9' })
    expect(pm.menuParamsFromRoute({ params: {}, query: {} })).toEqual({ table: null, establishmentId: null })
  })

  it('catégories vides et articles sans id écartés, image de catégorie déduite', () => {
    const menu = pm.normalizePublicMenu(PUBLIC_MENU)
    expect(menu.establishmentName).toBe('Chez Kris')
    expect(menu.categories.map(c => c.name)).toEqual(['Entrées', 'Desserts'])
    const [entrees, desserts] = menu.categories
    expect(entrees.items).toHaveLength(2)
    expect(entrees.imageUrl).toBe('/img/veloute.jpg')
    expect(entrees.items[0]).toMatchObject({ price: 8.5, description: 'Potimarron, noisettes', allergens: ['fruits à coque'] })
    expect(entrees.items[1]).toMatchObject({ price: 9, description: null, imageUrl: null })
    expect(desserts.imageUrl).toBe('/img/desserts.jpg')
  })

  it('searchMenu filtre nom et description', () => {
    const { categories } = pm.normalizePublicMenu(PUBLIC_MENU)
    expect(pm.searchMenu(categories, 'noisette').map(c => c.items.map(i => i.id))).toEqual([['p1']])
    expect(pm.searchMenu(categories, 'TARTE').map(c => c.name)).toEqual(['Desserts'])
    expect(pm.searchMenu(categories, '  ')).toBe(categories)
  })
})

describe('publicMenu — chargement', () => {
  it('route publique : appel sans JWT avec est + lang, carte mise en cache', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(PUBLIC_MENU)))
    const res = await pm.fetchPublicMenu({ establishmentId: 'est-1', lang: 'en' }, { fetchImpl, now: 1000 })
    expect(res).toMatchObject({ ok: true, source: 'public' })
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/public/menu?lang=en&est=est-1')
    expect(opts.headers.Authorization).toBeUndefined()
    expect(pm.readCachedMenu('est-1')).toMatchObject({ lang: 'en', at: 1000, establishmentName: 'Chez Kris' })
  })

  it('route absente → aperçu équipe, sinon dernière carte, sinon « unavailable »', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({}, 404)))
    const staffMenu = { categories: [{ id: 'c', name: 'Plats', items: [{ id: 'x', name: 'Steak', price: 20 }] }] }
    expect(await pm.fetchPublicMenu({ establishmentId: 'est-1' }, { fetchImpl, staffLoader: () => Promise.resolve(staffMenu) }))
      .toMatchObject({ ok: true, source: 'staff', menu: staffMenu })

    const noStaff = () => Promise.resolve(null)
    expect(await pm.fetchPublicMenu({ establishmentId: 'est-1' }, { fetchImpl, staffLoader: noStaff }))
      .toEqual({ ok: false, reason: 'unavailable' })

    await pm.fetchPublicMenu({ establishmentId: 'est-1' }, { fetchImpl: () => Promise.resolve(jsonResponse(PUBLIC_MENU)), now: 5 })
    expect(await pm.fetchPublicMenu({ establishmentId: 'est-1' }, { fetchImpl, staffLoader: noStaff }))
      .toMatchObject({ ok: true, source: 'cache', at: 5 })
  })

  it('hors-ligne : cache ou « offline »', async () => {
    const fetchImpl = vi.fn()
    setOnline(false)
    expect(await pm.fetchPublicMenu({ establishmentId: 'e' }, { fetchImpl })).toEqual({ ok: false, reason: 'offline' })
    expect(fetchImpl).not.toHaveBeenCalled()
    setOnline(true)
    const failing = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await pm.fetchPublicMenu({ establishmentId: 'e' }, { fetchImpl: failing })).toEqual({ ok: false, reason: 'offline' })
  })

  it('erreur serveur → « error »', async () => {
    const res = await pm.fetchPublicMenu({}, { fetchImpl: () => Promise.resolve(jsonResponse({}, 500)), staffLoader: () => Promise.resolve(null) })
    expect(res).toEqual({ ok: false, reason: 'error' })
  })
})

describe('MenuPublic.vue', () => {
  // fetch reste simulé jusqu'à la fin du bloc : les rechargements de fin de test
  // (changement de langue) ne doivent pas partir sur le réseau
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  afterAll(() => fetchSpy.mockRestore())

  async function mountAt(path) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/menu', component: MenuPublic }, { path: '/mon-add/:table?', component: Stub }],
    })
    router.push(path)
    await router.isReady()
    const w = mount(MenuPublic, { global: { plugins: [router] } })
    await flushPromises()
    return w
  }

  it('affiche catégories, descriptions, prix et lien d\'appel serveur', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(PUBLIC_MENU))
    const w = await mountAt('/menu?table=7&est=est-1')
    expect(w.find('.mn-title').text()).toBe('Chez Kris')
    expect(w.find('.mn-table').text()).toBe('Table 7')
    expect(w.findAll('.mn-section-title').map(e => e.text())).toEqual(['Entrées', 'Desserts'])
    expect(w.findAll('.mn-cat-chip')).toHaveLength(2)
    const first = w.find('.mn-item')
    expect(first.classes()).toContain('with-image')
    expect(first.find('.mn-item-img').attributes('src')).toBe('/img/veloute.jpg')
    expect(first.text()).toContain('Potimarron, noisettes')
    expect(first.find('.mn-item-price').text()).toMatch(/8,50\s€/)
    expect(first.text()).toContain('Allergènes : fruits à coque')
    expect(w.find('.mn-call').attributes('href')).toBe('/mon-add/7')

    await w.find('.mn-search').setValue('tarte')
    expect(w.findAll('.mn-item-name').map(e => e.text())).toEqual(['Tarte'])
    w.unmount()
  })

  it('carte indisponible : message client + réessayer', async () => {
    mockApi.getToken.mockReturnValue(null)
    fetchSpy.mockResolvedValue(jsonResponse({}, 404))
    const w = await mountAt('/menu?table=3')
    expect(w.find('.mn-state-title').text()).toBe('Carte bientôt disponible')
    expect(w.find('.mn-retry').exists()).toBe(true)
    w.unmount()
  })

  it('textes dans la langue active (anglais)', async () => {
    await setLocale('en', { persist: false })
    fetchSpy.mockResolvedValue(jsonResponse(PUBLIC_MENU))
    const w = await mountAt('/menu?table=2')
    expect(fetchSpy.mock.calls[0][0]).toContain('lang=en')
    expect(w.find('.mn-call').text()).toContain('Call the waiter')
    expect(w.find('.mn-item-price').text()).toContain('€8.50')
    w.unmount()
  })
})

/* ═══ 2. Inventaire complet ═══ */

const STOCK = [
  { id: 'a', productId: 'a', name: 'Tomates', quantity: 10, unit: 'kg', barcode: '3017620422003', unitCost: 2 },
  { id: 'b', productId: 'b', name: 'Beurre', quantity: 4, unit: 'kg', barcode: null, unitCost: 8.5 },
  { id: 'c', productId: 'c', name: 'Sel', quantity: 1, unit: 'kg', barcode: null, unitCost: null },
]

describe('inventoryCount — comptage', () => {
  it('démarrer : photo des quantités, session ouverte, mouvements gelés', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'sess-1' } })
    const state = await ic.startCount(STOCK, { now: new Date(2026, 10, 10, 9).getTime() })
    expect(mockApi.post).toHaveBeenCalledWith('/inventory/sessions', expect.objectContaining({
      session_date: '2026-11-10', session_type: 'physical_count',
    }))
    expect(state.sessionId).toBe('sess-1')
    expect(state.items.map(i => i.theoretical)).toEqual([10, 4, 1])
    expect(ic.isStockFrozen()).toBe(true)
    expect(ic.isStockFrozen('autre-est')).toBe(false)
    expect(ic.getActiveCount()).toMatchObject({ sessionId: 'sess-1' })
  })

  it('session impossible (hors-ligne) : le comptage démarre quand même', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('réseau'))
    const state = await ic.startCount(STOCK)
    expect(state.sessionId).toBeNull()
    expect(ic.isStockFrozen()).toBe(true)
  })

  it('saisies, écarts valorisés et résumé', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    const state = await ic.startCount(STOCK)
    expect(ic.setCounted(state, 'a', '7,5')).toBe(true)
    expect(ic.setCounted(state, 'b', 5)).toBe(true)
    expect(ic.setCounted(state, 'c', '0.4')).toBe(true)
    expect(ic.setCounted(state, 'c', -1)).toBe(false)
    expect(ic.setCounted(state, 'x', 'abc')).toBe(false)

    const lines = ic.countLines(state)
    expect(lines.find(l => l.id === 'a')).toMatchObject({ counted: 7.5, variance: -2.5, varianceValue: -5 })
    expect(lines.find(l => l.id === 'b')).toMatchObject({ variance: 1, varianceValue: 8.5 })
    expect(lines.find(l => l.id === 'c')).toMatchObject({ variance: -0.6, varianceValue: null })

    expect(ic.summarizeCount(state)).toEqual({
      total: 3, counted: 3, notCounted: 0, variances: 3,
      varianceValue: 3.5, lossValue: -5, gainValue: 8.5, unvalued: 1,
    })

    // Effacer une saisie
    ic.setCounted(state, 'c', '')
    expect(ic.summarizeCount(state)).toMatchObject({ counted: 2, notCounted: 1 })
    // Persisté
    expect(ic.getActiveCount().counts).toEqual({ a: 7.5, b: 5 })
  })

  it('compté = théorique : pas un écart', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    const state = await ic.startCount(STOCK)
    ic.setCounted(state, 'a', 10)
    expect(ic.summarizeCount(state)).toMatchObject({ counted: 1, variances: 0, varianceValue: 0 })
  })

  it('scan : produit retrouvé par code-barres ou ajouté (théorique 0)', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    const state = await ic.startCount(STOCK)
    expect(ic.findByBarcode(state, ' 3017620422003 ').id).toBe('a')
    expect(ic.findByBarcode(state, '999')).toBeNull()
    const added = ic.addCountItem(state, { id: 'z', productId: 'z', name: 'Nouveau', quantity: 12 })
    expect(added).toMatchObject({ id: 'z', theoretical: 0, added: true })
    expect(ic.addCountItem(state, { id: 'z', name: 'Nouveau' })).toBe(added)
  })

  it('terminer : POST /inventory/count avec les écarts, puis dégel', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'sess-1' } })
    const state = await ic.startCount(STOCK, { now: 1000 })
    ic.setCounted(state, 'a', 8)
    state.scanned.a = true
    mockApi.post.mockResolvedValueOnce({ success: true })
    const res = await ic.finishCount(state, { now: 2000 })
    expect(res).toMatchObject({ via: 'count', sessionId: 'sess-1', summary: { counted: 1, variances: 1, varianceValue: -4 } })
    const [path, body] = mockApi.post.mock.calls[1]
    expect(path).toBe('/inventory/count')
    expect(body).toMatchObject({ session_id: 'sess-1', started_at: new Date(1000).toISOString(), finished_at: new Date(2000).toISOString() })
    expect(body.counts).toEqual([{
      product_id: 'a', theoretical_quantity: 10, counted_quantity: 8, variance: -2,
      unit_cost: 2, variance_value: -4, barcode_scanned: true,
    }])
    expect(ic.isStockFrozen()).toBe(false)
  })

  it('route absente → session : comptages en masse puis clôture', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('réseau')) // pas de session au démarrage
    const state = await ic.startCount(STOCK)
    ic.setCounted(state, 'b', 3)
    mockApi.post
      .mockRejectedValueOnce(notFound()) // /inventory/count
      .mockResolvedValueOnce({ data: { id: 'sess-9' } }) // session créée à la fin
      .mockResolvedValueOnce({ data: { counts_added: 1 } })
    mockApi.put.mockResolvedValueOnce({ data: {} })
    const res = await ic.finishCount(state)
    expect(res).toMatchObject({ via: 'session', sessionId: 'sess-9' })
    expect(mockApi.post).toHaveBeenCalledWith('/inventory/sessions/sess-9/counts/bulk', {
      counts: [{ product_id: 'b', counted_quantity: 3, barcode_scanned: false }],
    })
    expect(mockApi.put).toHaveBeenCalledWith('/inventory/sessions/sess-9/complete', expect.objectContaining({ notes: expect.stringContaining('1 produits') }))
    expect(ic.isStockFrozen()).toBe(false)
  })

  it('hors-ligne ou erreur : le comptage reste gelé et enregistré', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    const state = await ic.startCount(STOCK)
    ic.setCounted(state, 'a', 1)
    setOnline(false)
    await expect(ic.finishCount(state)).rejects.toMatchObject({ offline: true })
    setOnline(true)
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
    await expect(ic.finishCount(state)).rejects.toMatchObject({ status: 500 })
    expect(ic.isStockFrozen()).toBe(true)
    expect(ic.getActiveCount().counts).toEqual({ a: 1 })
  })

  it('rien de compté : refus', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    const state = await ic.startCount(STOCK)
    await expect(ic.finishCount(state)).rejects.toMatchObject({ empty: true })
  })

  it('abandon : dégel + suppression de la session ouverte', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'sess-2' } })
    const state = await ic.startCount(STOCK)
    mockApi.del.mockResolvedValueOnce({})
    await ic.abandonCount(state)
    expect(mockApi.del).toHaveBeenCalledWith('/inventory/sessions/sess-2')
    expect(ic.isStockFrozen()).toBe(false)
  })

  it('gel : adjustItem refuse tout mouvement', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    await ic.startCount(STOCK)
    mockApi.post.mockClear()
    await expect(inv.adjustItem({ id: 'a', productId: 'a' }, 1)).rejects.toMatchObject({ frozen: true })
    expect(mockApi.patch).not.toHaveBeenCalled()
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('coût moyen lu dans le stock théorique', () => {
    expect(inv.normalizeInventoryItem({ product_id: 'p', product_name: 'X', theoretical_quantity: 2, average_unit_cost: 3.2 }).unitCost).toBe(3.2)
    expect(inv.normalizeInventoryItem({ id: 'p', name: 'X' }).unitCost).toBeNull()
  })
})

describe('InventoryCount.vue', () => {
  async function mountView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/stock', component: Stub }, { path: '/stock/count', component: InventoryCount }],
    })
    router.push('/stock/count')
    await router.isReady()
    const w = mount(InventoryCount, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return w
  }

  beforeEach(() => {
    mockApi.get.mockResolvedValue({
      data: STOCK.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, barcode: i.barcode, unit_cost: i.unitCost })),
    })
  })

  it('démarrer → saisir → terminer avec résumé', async () => {
    const w = await mountView()
    expect(w.find('.cnt-intro-text').text()).toContain('3 produits')
    mockApi.post.mockResolvedValueOnce({ data: { id: 'sess-1' } })
    await w.find('.cnt-intro .inv-btn.primary').trigger('click')
    await flushPromises()

    expect(w.find('.inv-banner').text()).toContain('mouvements de stock gelés')
    expect(w.findAll('.cnt-item')).toHaveLength(3)
    expect(w.find('.inv-subtitle').text()).toBe('0 / 3 comptés')

    const row = name => w.findAll('.cnt-item').find(r => r.text().includes(name))
    const tomates = row('Tomates').find('.cnt-input')
    tomates.element.value = '6'
    await tomates.trigger('change')
    await row('Beurre').find('.cnt-same').trigger('click')
    expect(w.find('.inv-subtitle').text()).toBe('2 / 3 comptés')
    expect(row('Tomates').text()).toContain('écart -4')
    expect(row('Beurre').text()).toContain('✓')

    // Filtre « Écarts »
    await w.findAll('.inv-filter')[2].trigger('click')
    expect(w.findAll('.cnt-item').map(r => r.find('.inv-name').text())).toEqual(['Tomates'])

    await w.find('.cnt-footer .inv-btn.primary').trigger('click')
    const sheet = w.find('.inv-sheet')
    expect(sheet.text()).toContain('Terminer le comptage ?')
    expect(sheet.findAll('.cnt-stat strong').map(s => s.text())).toEqual(['2', '1', expect.stringMatching(/-8,00\s€/)])
    expect(sheet.text()).toContain('1 produit non compté')

    mockApi.post.mockResolvedValueOnce({ success: true })
    await sheet.find('.inv-btn.primary').trigger('click')
    await flushPromises()
    expect(w.find('.cnt-result-title').text()).toBe('Comptage envoyé')
    expect(ic.isStockFrozen()).toBe(false)
    w.unmount()
  })

  it('reprend un comptage en cours sans recharger le stock', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    const state = await ic.startCount(STOCK)
    ic.setCounted(state, 'a', 10)
    mockApi.get.mockClear()
    const w = await mountView()
    expect(mockApi.get).not.toHaveBeenCalled()
    expect(w.find('.inv-subtitle').text()).toBe('1 / 3 comptés')
    // « À compter » d'abord
    expect(w.findAll('.cnt-item .inv-name').map(e => e.text())).toEqual(['Beurre', 'Sel', 'Tomates'])
    w.unmount()
  })
})

describe('InventoryItems.vue — comptage en cours', () => {
  it('bandeau + ajustements désactivés', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 's' } })
    await ic.startCount(STOCK)
    mockApi.get.mockResolvedValue({ data: [{ id: 'a', name: 'Tomates', quantity: 3, unit: 'kg' }] })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/stock', component: Stub }, { path: '/stock/count', component: Stub }, { path: '/stock/inventory', component: InventoryItems }],
    })
    router.push('/stock/inventory')
    await router.isReady()
    const w = mount(InventoryItems, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('.inv-frozen').text()).toContain('Comptage d\'inventaire en cours')
    const steps = w.findAll('.inv-step')
    expect(steps.every(s => s.attributes('disabled') !== undefined)).toBe(true)
    expect(w.find('.inv-qty').attributes('disabled')).toBeDefined()
    w.unmount()
  })
})

/* ═══ 3. Historique des tables ═══ */

const H = (h, m = 0) => new Date(2026, 10, 10, h, m).getTime()

describe('tableHistory — journal et stats', () => {
  it('parseServerTime : ISO sans fuseau = UTC', () => {
    expect(th.parseServerTime('2026-11-10T12:00:00')).toBe(Date.UTC(2026, 10, 10, 12))
    expect(th.parseServerTime('2026-11-10T12:00:00+01:00')).toBe(Date.UTC(2026, 10, 10, 11))
    expect(th.parseServerTime('2026-11-10T12:00:00Z')).toBe(Date.UTC(2026, 10, 10, 12))
    expect(th.parseServerTime(null)).toBeNull()
    expect(th.parseServerTime('n/a')).toBeNull()
  })

  it('normalizeTicket garde l\'heure du premier article', () => {
    const t = normalizeTicket({
      id: 't', table_number: 3, opened_at: '2026-11-10T11:00:00',
      items: [{ id: 'i2', created_at: '2026-11-10T11:20:00' }, { id: 'i1', created_at: '2026-11-10T11:08:00' }],
    })
    expect(t.firstOrderAt).toBe('2026-11-10T11:08:00')
  })

  it('note disparue de la liste = fermée ; montant rafraîchi', () => {
    const t1 = { id: 't1', tableNumber: 4, openedAt: H(12), firstOrderAt: H(12, 10), totalTtc: 20, covers: 2, serveur: 'Ana' }
    th.recordOpenTickets('est-1', [t1], H(12, 30))
    th.recordOpenTickets('est-1', [{ ...t1, totalTtc: 54.5 }], H(13))
    let day = th.localDayTickets('est-1', '2026-11-10')
    expect(day).toEqual([{ id: 't1', table: 4, openedAt: H(12), firstOrderAt: H(12, 10), closedAt: null, total: 54.5, covers: 2, serveur: 'Ana' }])

    th.recordOpenTickets('est-1', [], H(13, 5))
    day = th.localDayTickets('est-1', '2026-11-10')
    expect(day[0].closedAt).toBe(H(13, 5))
    // Relevé suivant : la fermeture ne bouge plus
    th.recordOpenTickets('est-1', [], H(14))
    expect(th.localDayTickets('est-1', '2026-11-10')[0].closedAt).toBe(H(13, 5))
  })

  it('long trou sans relevé : fermeture datée du dernier relevé', () => {
    th.recordOpenTickets('est-1', [{ id: 't', tableNumber: 1, openedAt: H(12), totalTtc: 10 }], H(12, 30))
    th.recordOpenTickets('est-1', [], H(16))
    expect(th.localDayTickets('est-1', '2026-11-10')[0].closedAt).toBe(H(12, 30))
  })

  it('journal séparé par établissement et par jour', () => {
    th.recordOpenTickets('est-1', [{ id: 'a', tableNumber: 1, openedAt: H(12), totalTtc: 1 }], H(12))
    th.recordOpenTickets('est-2', [{ id: 'b', tableNumber: 1, openedAt: H(12), totalTtc: 1 }], H(12))
    expect(th.localDayTickets('est-1', '2026-11-10').map(t => t.id)).toEqual(['a'])
    expect(th.localDayTickets('est-1', '2026-11-09')).toEqual([])
  })

  it('attente, durée et stats par table / globales', () => {
    const tickets = [
      { id: '1', table: 4, openedAt: H(12), firstOrderAt: H(12, 10), closedAt: H(13), total: 60, covers: 2 },
      { id: '2', table: 4, openedAt: H(19), firstOrderAt: H(19, 20), closedAt: null, total: 40, covers: 4 },
      { id: '3', table: 2, openedAt: H(12, 30), firstOrderAt: null, closedAt: H(13, 0), total: 25, covers: 1 },
    ]
    const now = H(20)
    expect(th.waitMs(tickets[0])).toBe(10 * 60000)
    expect(th.waitMs(tickets[2])).toBeNull()
    expect(th.durationMs(tickets[1], now)).toBe(60 * 60000)

    const stats = th.tableDayStats(tickets, now)
    expect(stats.tables.map(s => s.table)).toEqual([2, 4])
    expect(stats.tables[1]).toEqual({ table: 4, tickets: 2, covers: 6, avgDurationMs: 60 * 60000, avgWaitMs: 15 * 60000, revenue: 100 })
    expect(stats.tables[0]).toMatchObject({ avgDurationMs: 30 * 60000, avgWaitMs: null, revenue: 25 })
    expect(stats.overall).toMatchObject({ tickets: 3, avgDurationMs: 50 * 60000, revenue: 125, revenuePerTable: 62.5 })

    expect(th.ticketsOfTable(tickets, '4').map(t => t.id)).toEqual(['2', '1'])
  })

  it('fetchDayHistory : route backend si présente', async () => {
    mockApi.get.mockResolvedValueOnce({ data: [{ id: 'x', table_number: 5, opened_at: '2026-11-10T11:00:00', closed_at: '2026-11-10T12:00:00', total_ttc: '42.00', covers: 3 }] })
    const res = await th.fetchDayHistory({ day: '2026-11-10' })
    expect(mockApi.get).toHaveBeenCalledWith('/table-tickets/history?date=2026-11-10')
    expect(res.source).toBe('api')
    expect(res.tickets[0]).toMatchObject({ table: 5, total: 42, covers: 3, openedAt: Date.UTC(2026, 10, 10, 11) })
  })

  it('fetchDayHistory : route absente → journal local (notes ouvertes relues)', async () => {
    mockApi.get.mockRejectedValueOnce(notFound())
    const fetchOpen = vi.fn(async () => th.recordOpenTickets('est-1', [{ id: 'o', tableNumber: 8, openedAt: H(12), totalTtc: 15 }], H(12, 5)))
    const res = await th.fetchDayHistory({ day: '2026-11-10', fetchOpen })
    expect(fetchOpen).toHaveBeenCalled()
    expect(res).toMatchObject({ source: 'local', tickets: [{ id: 'o', table: 8, total: 15 }] })
    // Route mémorisée absente : plus d'appel
    mockApi.get.mockClear()
    await th.fetchDayHistory({ day: '2026-11-10', fetchOpen })
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})

describe('appui long', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('déclenché après le délai sans bouger', () => {
    const onLongPress = vi.fn()
    const lp = createLongPress({ onLongPress, delay: 500 })
    lp.start('t4', 100, 100)
    lp.move(104, 103) // tremblement toléré
    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledWith('t4')
  })

  it('annulé par un déplacement (drag) ou un relâcher', () => {
    const onLongPress = vi.fn()
    const lp = createLongPress({ onLongPress, delay: 500 })
    lp.start('a', 0, 0)
    lp.move(30, 0)
    lp.start('b', 0, 0)
    vi.advanceTimersByTime(200)
    lp.cancel()
    expect(lp.pending).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
  })
})

describe('TableHistorySheet.vue', () => {
  it('notes de la table, stats du jour, QR de la carte', async () => {
    const now = Date.now()
    const iso = ms => new Date(ms).toISOString()
    mockApi.get.mockResolvedValueOnce({
      data: [
        { id: '1', table_number: 4, opened_at: iso(now - 90 * 60000), first_order_at: iso(now - 80 * 60000), closed_at: iso(now - 30 * 60000), total_ttc: 60, covers: 2, serveur_name: 'Ana' },
        { id: '2', table_number: 4, opened_at: iso(now - 20 * 60000), total_ttc: 18, covers: 2 },
        { id: '3', table_number: 9, opened_at: iso(now - 50 * 60000), closed_at: iso(now - 10 * 60000), total_ttc: 30 },
      ],
    })
    const w = mount(TableHistorySheet, { props: { table: 4 } })
    await flushPromises()
    expect(w.find('.th-title').text()).toBe('Table 4 — historique')
    expect(w.findAll('.th-stat strong').map(s => s.text())).toEqual(['2', '40 min', '10 min', expect.stringMatching(/78,00\s€/)])
    const rows = w.findAll('.th-ticket')
    expect(rows).toHaveLength(2)
    expect(rows[0].classes()).toContain('open')
    expect(rows[1].text()).toContain('attente 10 min')
    expect(rows[1].text()).toContain('durée 1 h 00')
    expect(rows[1].text()).toContain('Ana')
    expect(w.findAll('.th-table tbody tr').map(r => r.find('td').text())).toEqual(['4', '9'])
    expect(w.find('.th-table tr.current td').text()).toBe('4')
    expect(w.find('.th-note').exists()).toBe(false)

    await w.findAll('.th-icon')[0].trigger('click')
    expect(w.find('.th-qr-link').text()).toMatch(/\/mobile\/guest\/4\?est=est-1$/)
    await w.findAll('.th-icon')[1].trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})
