/**
 * Appel serveur (page client), images de la carte, stock mobile
 * Tests: table lue dans la route, appel + délai, erreurs, page /mon-add,
 *        image_url / galerie / préchargement, liste stock, filtre stock bas,
 *        ajustements (+1/-1/saisie, regroupement, repli sur les mouvements)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))

import * as wc from '../../src/shared/waiterCall'
import * as img from '../../src/shared/menuImages'
import * as inv from '../../src/shared/inventory'
import { fetchMenu } from '../../src/shared/serviceOrders'
import WaiterCall from '../../src/views/service/WaiterCall.vue'
import InventoryItems from '../../src/views/stock/InventoryItems.vue'
import MenuThumb from '../../src/components/MenuThumb.vue'

const Stub = { template: '<div />' }

function notFound() {
  return Object.assign(new Error('Not Found'), { status: 404 })
}

function setOnline(v) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  setOnline(true)
  img.resetMenuImagesState()
  inv.resetInventoryState()
  setActivePinia(createPinia())
})

/* ═══ 1. Appel serveur ═══ */

describe('waiterCall — table et appel', () => {
  it('lit la table dans le chemin ou la query', () => {
    expect(wc.tableFromRoute({ params: { table: '12' }, query: {} })).toBe(12)
    expect(wc.tableFromRoute({ params: {}, query: { table: '7' } })).toBe(7)
    expect(wc.tableFromRoute({ params: {}, query: { t: '3' } })).toBe(3)
    expect(wc.tableFromRoute({ params: {}, query: { table: 'abc' } })).toBeNull()
    expect(wc.tableFromRoute({ params: {}, query: { table: '0' } })).toBeNull()
    expect(wc.tableFromRoute({ params: {}, query: {} })).toBeNull()
    // Paramètre optionnel absent : vue-router donne ''
    expect(wc.tableFromRoute({ params: { table: '' }, query: { table: '9' } })).toBe(9)
  })

  it('POST /mobile/tables/{n}/call-waiter?message= (texte français)', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, status: 200 }))
    const res = await wc.callWaiter(12, 'bill', { fetchImpl, now: 1000 })
    expect(res).toEqual({ ok: true, at: 1000 })
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/mobile/tables/12/call-waiter?message=Addition%20SVP', { method: 'POST' })
  })

  it('bloque le même appel pendant le délai, pas les autres', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, status: 200 }))
    await wc.callWaiter(12, 'bread', { fetchImpl, now: 1000 })
    expect(await wc.callWaiter(12, 'bread', { fetchImpl, now: 2000 })).toEqual({ ok: false, reason: 'cooldown' })
    expect(wc.lastCallAt(12, 'bread', 2000)).toBe(1000)
    expect((await wc.callWaiter(12, 'order', { fetchImpl, now: 2000 })).ok).toBe(true)
    expect((await wc.callWaiter(5, 'bread', { fetchImpl, now: 2000 })).ok).toBe(true)
    // Délai écoulé
    expect(wc.cooldownRemaining(12, 'bread', 1000 + wc.CALL_COOLDOWN_MS)).toBe(0)
    expect((await wc.callWaiter(12, 'bread', { fetchImpl, now: 1000 + wc.CALL_COOLDOWN_MS })).ok).toBe(true)
  })

  it('route absente, erreur serveur, réseau coupé : pas de délai mémorisé', async () => {
    expect(await wc.callWaiter(1, 'call', { fetchImpl: () => Promise.resolve({ ok: false, status: 404 }) }))
      .toMatchObject({ ok: false, reason: 'unavailable' })
    expect(await wc.callWaiter(1, 'call', { fetchImpl: () => Promise.resolve({ ok: false, status: 500 }) }))
      .toMatchObject({ ok: false, reason: 'error' })
    expect(await wc.callWaiter(1, 'call', { fetchImpl: () => Promise.reject(new TypeError('fetch')) }))
      .toMatchObject({ ok: false, reason: 'offline' })
    setOnline(false)
    const fetchImpl = vi.fn()
    expect(await wc.callWaiter(1, 'call', { fetchImpl })).toMatchObject({ reason: 'offline' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(wc.cooldownRemaining(1, 'call')).toBe(0)
  })
})

describe('WaiterCall.vue (/mon-add)', () => {
  async function mountAt(path) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/mon-add/:table(\\d+)?', component: WaiterCall }],
    })
    router.push(path)
    await router.isReady()
    return mount(WaiterCall, { global: { plugins: [router] } })
  }

  afterEach(() => { vi.unstubAllGlobals() })

  it('sans table : invite à scanner le QR code', async () => {
    const w = await mountAt('/mon-add')
    expect(w.text()).toContain('Scannez le QR code')
    expect(w.find('.wc-call').exists()).toBe(false)
  })

  it('appelle le serveur avec un message prédéfini puis grise le bouton', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const w = await mountAt('/mon-add?table=8')
    expect(w.text()).toContain('Table 8')
    const presets = w.findAll('.wc-preset')
    expect(presets.map(b => b.text())).toEqual(["🧾L'addition, s'il vous plaît", '🥖Plus de pain', '➕Commande supplémentaire'])

    await presets[0].trigger('click')
    await flushPromises()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/mobile/tables/8/call-waiter?message=Addition%20SVP')
    expect(w.find('.wc-feedback.ok').exists()).toBe(true)
    expect(w.findAll('.wc-preset')[0].attributes('disabled')).toBeDefined()
    expect(w.find('.wc-call').attributes('disabled')).toBeUndefined()
  })

  it('appel indisponible : demande de faire signe', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    const w = await mountAt('/mon-add/4')
    await w.find('.wc-call').trigger('click')
    await flushPromises()
    expect(w.find('.wc-feedback.error').text()).toContain('Faites signe')
    expect(w.find('.wc-call').attributes('disabled')).toBeUndefined()
  })
})

/* ═══ 2. Menu avec images ═══ */

const POS_MENU = {
  data: {
    categories: [
      { id: 'c1', name: 'Plats', items: [
        { id: 'p1', name: 'Burger', price_ttc: 15 },
        { id: 'p2', name: 'Salade', price_ttc: 12, image_url: '/img/salade.jpg' },
      ] },
    ],
  },
}

describe('menuImages', () => {
  it('fusionne les images de /mobile/menu/items?with_images=true', async () => {
    mockApi.get.mockImplementation(path => {
      if (path === '/products/pos-menu') return Promise.resolve(POS_MENU)
      if (path === '/mobile/menu/items?with_images=true') {
        return Promise.resolve({ data: [{ id: 'p1', image_url: 'https://cdn/burger.webp' }, { id: 'p2', image_url: '/other.jpg' }] })
      }
      return Promise.reject(new Error(path))
    })
    const [cat] = await fetchMenu()
    const byId = Object.fromEntries(cat.items.map(i => [i.id, i.imageUrl]))
    // L'image portée par le pos-menu reste prioritaire
    expect(byId).toEqual({ p1: 'https://cdn/burger.webp', p2: '/img/salade.jpg' })
  })

  it('route absente : carte sans images, la route n\'est plus rappelée', async () => {
    mockApi.get.mockImplementation(path =>
      path === '/products/pos-menu' ? Promise.resolve(POS_MENU) : Promise.reject(notFound()))
    const [cat] = await fetchMenu()
    expect(cat.items.find(i => i.id === 'p1').imageUrl).toBeNull()
    await fetchMenu()
    expect(mockApi.get.mock.calls.filter(c => c[0].startsWith('/mobile/menu')).length).toBe(1)
  })

  it('imageMapFrom accepte tableau ou { items }', () => {
    expect(img.imageMapFrom({ items: [{ id: 1, image_url: ' a.jpg ' }, { id: 2, image_url: '' }] })).toEqual({ 1: 'a.jpg' })
    expect(img.imageMapFrom(null)).toEqual({})
  })

  it('précharge chaque image une seule fois, rien hors-ligne', () => {
    const load = vi.fn()
    const cats = [{ items: [{ imageUrl: 'a.jpg' }, { imageUrl: null }, { imageUrl: 'b.jpg' }, { imageUrl: 'a.jpg' }] }]
    expect(img.warmMenuImages(cats, { load })).toBe(2)
    expect(img.warmMenuImages(cats, { load })).toBe(0)
    expect(load.mock.calls.map(c => c[0])).toEqual(['a.jpg', 'b.jpg'])
    setOnline(false)
    expect(img.warmMenuImages([{ items: [{ imageUrl: 'c.jpg' }] }], { load })).toBe(0)
  })

  it('mémorise le mode liste / galerie', () => {
    expect(img.getMenuView()).toBe('list')
    img.saveMenuView('gallery')
    expect(img.getMenuView()).toBe('gallery')
    localStorage.setItem('tipsmana_menu_view', 'bogus')
    expect(img.getMenuView()).toBe('list')
  })

  it('MenuThumb : image 80×80, pictogramme si absente ou en erreur', async () => {
    const w = mount(MenuThumb, { props: { src: '/x.jpg', icon: '🍝' } })
    expect(w.attributes('style')).toContain('width: 80px')
    expect(w.find('img').attributes('loading')).toBe('lazy')
    await w.find('img').trigger('error')
    expect(w.find('img').exists()).toBe(false)
    expect(w.text()).toBe('🍝')
    await w.setProps({ src: '/y.jpg' })
    expect(w.find('img').exists()).toBe(true)
    expect(mount(MenuThumb, { props: { src: null } }).text()).toBe('🍽')
  })
})

/* ═══ 3. Stock mobile ═══ */

const ITEMS = [
  { id: 'a', name: 'Tomates', quantity: 2, threshold: 5, unit: 'kg' },
  { id: 'b', name: 'Beurre', quantity: 10, threshold: 4, unit: 'kg' },
  { id: 'c', name: 'Sel', quantity: 1 },
]

describe('inventory — données', () => {
  it('normalise /inventory/items et détecte le stock bas', async () => {
    mockApi.get.mockResolvedValue({ data: ITEMS })
    const { items, fallback } = await inv.fetchInventoryItems()
    expect(mockApi.get).toHaveBeenCalledWith('/inventory/items')
    expect(fallback).toBe(false)
    expect(items.filter(inv.isLowStock).map(i => i.name)).toEqual(['Tomates'])
    // Pas de seuil → jamais « stock bas »
    expect(inv.isLowStock(items.find(i => i.id === 'c'))).toBe(false)
  })

  it('filtre stock bas + recherche, stock bas en tête', () => {
    const items = ITEMS.map(inv.normalizeInventoryItem)
    expect(inv.filterItems(items).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(inv.filterItems(items, { lowOnly: true }).map(i => i.id)).toEqual(['a'])
    expect(inv.filterItems(items, { search: 'BEU' }).map(i => i.id)).toEqual(['b'])
  })

  it('repli sur /inventory/stock/theoretical (sections cumulées, pagination)', async () => {
    mockApi.get.mockImplementation(path => {
      if (path === '/inventory/items') return Promise.reject(notFound())
      if (path.includes('page=1')) {
        return Promise.resolve({ data: {
          kitchen: { pages: 2, stock_levels: [{ product_id: 'p1', product_name: 'Farine', theoretical_quantity: 3, minimum_stock_level: 5 }] },
          dining_room: { pages: 1, stock_levels: [{ product_id: 'p1', product_name: 'Farine', theoretical_quantity: 1.5, minimum_stock_level: 5 }] },
        } })
      }
      return Promise.resolve({ data: { kitchen: { pages: 2, stock_levels: [{ product_id: 'p2', product_name: 'Lait', theoretical_quantity: 8, minimum_stock_level: null }] } } })
    })
    const { items, fallback } = await inv.fetchInventoryItems()
    expect(fallback).toBe(true)
    expect(items).toMatchObject([
      { id: 'p1', name: 'Farine', quantity: 4.5, threshold: 5 },
      { id: 'p2', name: 'Lait', quantity: 8, threshold: null },
    ])
    expect(inv.usesFallback()).toBe(true)
  })

  it('PATCH /inventory/items/{id}/adjust { delta }', async () => {
    mockApi.patch.mockResolvedValue({ success: true })
    await inv.adjustItem({ id: 'a', productId: 'a' }, -1)
    expect(mockApi.patch).toHaveBeenCalledWith('/inventory/items/a/adjust', { delta: -1 })
    expect(await inv.adjustItem({ id: 'a' }, 0)).toEqual({ queued: false })
    expect(mockApi.patch).toHaveBeenCalledTimes(1)
  })

  it('PATCH absent : mouvement « adjustment » signé, puis directement', async () => {
    mockApi.patch.mockRejectedValue(notFound())
    mockApi.post.mockResolvedValue({ offline: true, queued: true })
    const res = await inv.adjustItem({ id: 'a', productId: 'a' }, 2.5)
    expect(res).toEqual({ queued: true })
    expect(mockApi.post).toHaveBeenCalledWith('/inventory/movements', expect.objectContaining({
      product_id: 'a', movement_type: 'adjustment', quantity: 2.5, movement_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
    await inv.adjustItem({ id: 'a', productId: 'a' }, -1)
    expect(mockApi.patch).toHaveBeenCalledTimes(1)
    expect(mockApi.post).toHaveBeenCalledTimes(2)
  })

  it('regroupe les taps rapides en un seul envoi', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn(() => Promise.resolve({ queued: false }))
      const adj = inv.createAdjuster({ send, delay: 500 })
      const item = { id: 'a' }
      adj.push(item, 1); adj.push(item, 1); adj.push(item, 1); adj.push(item, -1)
      expect(adj.pendingDelta('a')).toBe(2)
      await vi.advanceTimersByTimeAsync(500)
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(item, 2)
      // +1 -1 : rien à envoyer
      adj.push(item, 1); adj.push(item, -1)
      await adj.flush()
      expect(send).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('InventoryItems.vue', () => {
  async function mountView() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/stock', component: Stub }, { path: '/stock/inventory', component: InventoryItems }],
    })
    router.push('/stock/inventory')
    await router.isReady()
    const w = mount(InventoryItems, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return w
  }

  beforeEach(() => {
    mockApi.get.mockResolvedValue({ data: ITEMS.map(i => ({ ...i })) })
    mockApi.patch.mockResolvedValue({ success: true })
  })

  it('liste quantité + seuil, filtre « Stock bas »', async () => {
    const w = await mountView()
    expect(w.findAll('.inv-item').length).toBe(3)
    const first = w.find('.inv-item')
    expect(first.classes()).toContain('low')
    expect(first.text()).toContain('Tomates')
    expect(first.text()).toContain('Seuil 5 kg')
    expect(w.findAll('.inv-filter')[1].text()).toContain('1')

    await w.findAll('.inv-filter')[1].trigger('click')
    expect(w.findAll('.inv-item').map(i => i.find('.inv-name').text())).toEqual(['Tomates'])
    w.unmount()
  })

  it('+1 / −1 : mise à jour immédiate, un seul PATCH regroupé', async () => {
    vi.useFakeTimers()
    try {
      const w = await mountView()
      const row = () => w.findAll('.inv-item').find(r => r.text().includes('Beurre'))
      const [minus, plus] = row().findAll('.inv-step')
      await plus.trigger('click')
      await plus.trigger('click')
      await minus.trigger('click')
      expect(row().find('.inv-qty-value').text()).toBe('11')
      await vi.advanceTimersByTimeAsync(800)
      expect(mockApi.patch).toHaveBeenCalledTimes(1)
      expect(mockApi.patch).toHaveBeenCalledWith('/inventory/items/b/adjust', { delta: 1 })
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('saisie manuelle : envoie l\'écart avec la quantité affichée', async () => {
    const w = await mountView()
    const row = () => w.findAll('.inv-item').find(r => r.text().includes('Tomates'))
    await row().find('.inv-qty').trigger('click')
    const input = row().find('.inv-qty-input')
    await input.setValue('7.5')
    await input.trigger('keydown', { key: 'Enter' })
    expect(row().find('.inv-qty-value').text()).toBe('7,5')
    // Au-dessus du seuil : plus en stock bas
    expect(row().classes()).not.toContain('low')
    w.unmount() // sortie de page : envoi immédiat
    await flushPromises()
    expect(mockApi.patch).toHaveBeenCalledWith('/inventory/items/a/adjust', { delta: 5.5 })
  })

  it('−1 désactivé à zéro, échec serveur : quantité restaurée', async () => {
    vi.useFakeTimers()
    try {
      mockApi.get.mockResolvedValue({ data: [{ id: 'z', name: 'Vide', quantity: 0, threshold: 1 }, { id: 'y', name: 'Huile', quantity: 3 }] })
      mockApi.patch.mockRejectedValue(Object.assign(new Error('Refusé'), { status: 403 }))
      const w = await mountView()
      const row = name => w.findAll('.inv-item').find(r => r.text().includes(name))
      expect(row('Vide').findAll('.inv-step')[0].attributes('disabled')).toBeDefined()
      await row('Huile').findAll('.inv-step')[1].trigger('click')
      expect(row('Huile').find('.inv-qty-value').text()).toBe('4')
      await vi.advanceTimersByTimeAsync(800)
      await flushPromises()
      expect(row('Huile').find('.inv-qty-value').text()).toBe('3')
      expect(w.find('.inv-toast').text()).toContain('Refusé')
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
