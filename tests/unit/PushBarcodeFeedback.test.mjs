/**
 * Push réelles, scan code-barres stock, avis client
 * Tests: abonnement + envoi au backend, permission (demande / refus / non supporté),
 *        service worker (types de push, badge, relais premier plan), lookup code-barres,
 *        création produit inconnu, scanner (repli saisie manuelle), page /feedback, QR après solde
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import fs from 'fs'
import path from 'path'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))

const badgeStore = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../src/shared/offlineStore', () => ({
  offlineStore: {
    getBadgeCount: vi.fn(async () => badgeStore.count),
    setBadgeCount: vi.fn(async (n) => { badgeStore.count = n }),
    clearBadge: vi.fn(async () => { badgeStore.count = 0 }),
    setPushSubscription: vi.fn(async () => {}),
    getPushSubscription: vi.fn(async () => null),
  },
}))

import * as push from '../../src/shared/push'
import * as bc from '../../src/shared/barcode'
import * as fb from '../../src/shared/feedback'
import * as inv from '../../src/shared/inventory'
import PushPermissionCard from '../../src/components/PushPermissionCard.vue'
import BarcodeScanner from '../../src/components/BarcodeScanner.vue'
import InventoryItems from '../../src/views/stock/InventoryItems.vue'
import Feedback from '../../src/views/service/Feedback.vue'

const Stub = { template: '<div />' }

function notFound() {
  return Object.assign(new Error('Not Found'), { status: 404 })
}

function setOnline(v) {
  Object.defineProperty(navigator, 'onLine', { value: v, configurable: true })
}

const SUB_JSON = { endpoint: 'https://push.example/abc', keys: { p256dh: 'P256', auth: 'AUTH' } }

function installPush({ permission = 'default', existing = null, grant = 'granted' } = {}) {
  const subscription = { toJSON: () => SUB_JSON }
  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe: vi.fn(async () => subscription),
  }
  const Notification = { permission, requestPermission: vi.fn(async () => { Notification.permission = grant; return grant }) }
  window.Notification = Notification
  window.PushManager = function PushManager() {}
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager }), addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
  })
  return { pushManager, Notification }
}

function uninstallPush() {
  delete window.Notification
  delete window.PushManager
  delete navigator.serviceWorker
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  badgeStore.count = 0
  setOnline(true)
  push.resetPushState()
  inv.resetInventoryState()
  mockApi.post.mockResolvedValue({ success: true })
})

/* ═══ 1. Push ═══ */

describe('push — abonnement Web Push', () => {
  afterEach(uninstallPush)

  it('permission accordée : souscrit et envoie la souscription au backend', async () => {
    const { pushManager } = installPush({ permission: 'granted' })
    expect(await push.initPushSubscription()).toBe(true)
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(mockApi.post).toHaveBeenCalledWith('/notifications/push/subscribe', SUB_JSON)
  })

  it("une seule fois par session et par établissement, renvoyée si l'établissement change", async () => {
    installPush({ permission: 'granted' })
    await push.initPushSubscription()
    await push.initPushSubscription()
    expect(mockApi.post).toHaveBeenCalledTimes(1)
    mockApi.getEstablishmentId.mockReturnValueOnce('est-2')
    await push.initPushSubscription()
    expect(mockApi.post).toHaveBeenCalledTimes(2)
  })

  it('souscription existante : réutilisée et envoyée', async () => {
    const { pushManager } = installPush({ permission: 'granted', existing: { toJSON: () => SUB_JSON } })
    expect(await push.initPushSubscription()).toBe(true)
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(mockApi.post).toHaveBeenCalledTimes(1)
  })

  it('prompt=false : ne demande pas la permission', async () => {
    const { Notification } = installPush({ permission: 'default' })
    expect(await push.initPushSubscription({ prompt: false })).toBe(false)
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('refus : false, rien envoyé, jamais redemandé', async () => {
    const { Notification } = installPush({ permission: 'default', grant: 'denied' })
    expect(await push.initPushSubscription()).toBe(false)
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
    expect(await push.initPushSubscription()).toBe(false)
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1)
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('erreur réseau du backend : false, réessayé au prochain appel', async () => {
    installPush({ permission: 'granted' })
    mockApi.post.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))
    expect(await push.initPushSubscription()).toBe(false)
    expect(await push.initPushSubscription()).toBe(true)
    expect(mockApi.post).toHaveBeenCalledTimes(2)
  })

  it('navigateur sans Web Push : no-op', async () => {
    expect(push.pushSupported()).toBe(false)
    expect(await push.initPushSubscription()).toBe(false)
  })

  it('subscriptionPayload : endpoint + clés uniquement', () => {
    expect(push.subscriptionPayload({ ...SUB_JSON, expirationTime: null })).toEqual(SUB_JSON)
    expect(push.subscriptionPayload({ endpoint: 'x' })).toBeNull()
  })

  it('listenForegroundPushes : relaie seulement les push PUSH_RECEIVED', () => {
    installPush()
    const onPush = vi.fn()
    const stop = push.listenForegroundPushes(onPush)
    const handler = navigator.serviceWorker.addEventListener.mock.calls[0][1]
    handler({ data: { type: 'ORDER_STATUS' } })
    handler({ data: { type: 'PUSH_RECEIVED', kind: 'new_order', title: 'Nouvelle commande' } })
    expect(onPush).toHaveBeenCalledTimes(1)
    expect(onPush.mock.calls[0][0].kind).toBe('new_order')
    stop()
    expect(navigator.serviceWorker.removeEventListener).toHaveBeenCalledWith('message', handler)
  })
})

describe('PushPermissionCard.vue', () => {
  afterEach(uninstallPush)

  it('jamais demandé : bouton qui demande la permission puis disparaît', async () => {
    const { Notification } = installPush({ permission: 'default' })
    const w = mount(PushPermissionCard)
    await flushPromises()
    expect(w.text()).toContain('Activer les notifications')
    await w.find('.push-btn').trigger('click')
    await flushPromises()
    expect(Notification.requestPermission).toHaveBeenCalled()
    expect(mockApi.post).toHaveBeenCalledWith('/notifications/push/subscribe', SUB_JSON)
    expect(w.find('.push-card').exists()).toBe(false)
  })

  it('refusé : explique le repli (relevé toutes les 30 s), sans bouton', async () => {
    installPush({ permission: 'denied' })
    const w = mount(PushPermissionCard)
    await flushPromises()
    expect(w.text()).toContain('Notifications bloquées')
    expect(w.text()).toContain('30 s')
    expect(w.find('.push-btn').exists()).toBe(false)
  })

  it('non supporté : message dédié', async () => {
    const w = mount(PushPermissionCard)
    await flushPromises()
    expect(w.text()).toContain('indisponibles')
  })

  it('accordé mais abonnement impossible : message « échec »', async () => {
    installPush({ permission: 'granted' })
    mockApi.post.mockRejectedValue(new Error('501'))
    const w = mount(PushPermissionCard)
    await flushPromises()
    expect(w.text()).toContain('Abonnement push impossible')
  })
})

/* ═══ 2. Service worker (public/push-sw.js) ═══ */

describe('push-sw.js', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '../../public/push-sw.js'), 'utf-8')

  function fakeIndexedDb(store) {
    const db = {
      objectStoreNames: { contains: () => true },
      close() {},
      transaction() {
        const tx = {}
        tx.objectStore = () => ({
          get(key) {
            const req = {}
            setTimeout(() => {
              req.result = store[key]
              req.onsuccess?.()
              setTimeout(() => tx.oncomplete?.())
            })
            return req
          },
          put(value, key) { store[key] = value },
          delete(key) { delete store[key] },
        })
        return tx
      },
    }
    return {
      open() {
        const req = {}
        setTimeout(() => { req.result = db; req.onsuccess?.() })
        return req
      },
    }
  }

  function loadSw({ clients = [], store = {} } = {}) {
    const listeners = {}
    const self = {
      addEventListener: (type, fn) => { listeners[type] = fn },
      registration: { showNotification: vi.fn(async () => {}) },
      clients: { matchAll: vi.fn(async () => clients), openWindow: vi.fn(async () => {}) },
      navigator: { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) },
    }
    new Function('self', 'indexedDB', SRC)(self, fakeIndexedDb(store))
    async function dispatch(type, event) {
      let done
      listeners[type]({ ...event, waitUntil: (p) => { done = p } })
      await done
    }
    return {
      self,
      store,
      push: (payload) => dispatch('push', { data: { json: () => payload, text: () => '' } }),
      click: (notification) => dispatch('notificationclick', { notification }),
    }
  }

  it('nouvelle commande, app fermée : notification système vers le KDS + badge +1', async () => {
    const sw = loadSw({ store: { tipsmana_pwa_badge: 2 } })
    await sw.push({ title: 'Nouvelle commande', body: 'Table 4 — 3 plats', data: { type: 'new_order', ticket_ref: 'MOB-7' } })
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Nouvelle commande', expect.objectContaining({
      body: 'Table 4 — 3 plats',
      tag: 'new-order-MOB-7',
      data: { url: '/mobile/cuisine/board' },
    }))
    expect(sw.store.tipsmana_pwa_badge).toBe(3)
    expect(sw.self.navigator.setAppBadge).toHaveBeenCalledWith(3)
  })

  it('commande prête : relayée en ORDER_STATUS (badge déjà compté) + notification si arrière-plan', async () => {
    const client = { postMessage: vi.fn(), focused: false, visibilityState: 'hidden', url: '/mobile/' }
    const sw = loadSw({ clients: [client] })
    await sw.push({ body: 'Table 2 prête', data: { type: 'order_ready', table: 2 } })
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'ORDER_STATUS', tableNumber: 2, status: 'ready', badgeHandled: true })
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Commande', expect.objectContaining({
      data: { url: '/mobile/service/history' },
    }))
  })

  it('message du serveur, app au premier plan : pas de notification système, relais PUSH_RECEIVED', async () => {
    const client = { postMessage: vi.fn(), focused: true, url: '/mobile/cuisine' }
    const sw = loadSw({ clients: [client] })
    await sw.push({ title: 'Julie (salle)', body: 'Table 5 sans gluten', data: { type: 'message' } })
    expect(sw.self.registration.showNotification).not.toHaveBeenCalled()
    expect(client.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PUSH_RECEIVED', kind: 'message', title: 'Julie (salle)', body: 'Table 5 sans gluten', url: '/mobile/notifications', badge: 1,
    }))
  })

  it('unread_count fourni par le backend : badge aligné dessus', async () => {
    const sw = loadSw({ store: { tipsmana_pwa_badge: 9 } })
    await sw.push({ title: 'Info', unread_count: 4, data: {} })
    expect(sw.self.navigator.setAppBadge).toHaveBeenCalledWith(4)
  })

  it('clic : badge −1, ouvre la page de la notification', async () => {
    const sw = loadSw({ store: { tipsmana_pwa_badge: 1 } })
    const notification = { close: vi.fn(), data: { url: '/mobile/cuisine/board' } }
    await sw.click(notification)
    expect(notification.close).toHaveBeenCalled()
    expect(sw.store.tipsmana_pwa_badge).toBeUndefined()
    expect(sw.self.navigator.clearAppBadge).toHaveBeenCalled()
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('/mobile/cuisine/board')
  })
})

/* ═══ 3. Code-barres ═══ */

const ITEMS = [
  { id: 'p1', product_id: 'p1', name: 'Farine T55', quantity: 12, threshold: 5, unit: 'kg', barcode: '3017620422003' },
  { id: 'p2', product_id: 'p2', name: 'Beurre doux', quantity: 2, threshold: 4, unit: 'kg' },
]

describe('barcode — résolution et création', () => {
  const items = ITEMS.map(inv.normalizeInventoryItem)

  it('normalise le code (espaces retirés), valide les chiffres', () => {
    expect(bc.normalizeBarcode(' 3017 6204 22003 ')).toBe('3017620422003')
    expect(bc.isNumericBarcode('3017620422003')).toBe(true)
    expect(bc.isNumericBarcode('TIP-abc')).toBe(false)
  })

  it('GET /inventory/barcode/lookup → produit de la liste', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { product_id: 'p2', product_name: 'Beurre doux' } })
    const res = await bc.lookupBarcode('3250390000013', items)
    expect(mockApi.get).toHaveBeenCalledWith('/inventory/barcode/lookup?code=3250390000013')
    expect(res.status).toBe('found')
    expect(res.item.id).toBe('p2')
  })

  it('produit connu mais absent de la liste : item à 0 marqué notInList', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { product_id: 'p9', product_name: 'Sel', unit_abbreviation: 'kg' } })
    const res = await bc.lookupBarcode('123456', items)
    expect(res).toMatchObject({ status: 'found', notInList: true, item: { id: 'p9', name: 'Sel', quantity: 0, unit: 'kg' } })
  })

  it('404 → inconnu ; hors-ligne → correspondance locale ou « offline »', async () => {
    mockApi.get.mockRejectedValueOnce(notFound())
    expect(await bc.lookupBarcode('999999', items)).toEqual({ status: 'unknown', code: '999999' })
    mockApi.get.mockRejectedValueOnce(new TypeError('fetch'))
    expect((await bc.lookupBarcode('3017620422003', items)).item.id).toBe('p1')
    mockApi.get.mockRejectedValueOnce(new TypeError('fetch'))
    expect(await bc.lookupBarcode('999999', items)).toEqual({ status: 'offline', code: '999999' })
  })

  it('options du formulaire : unités et TVA (défaut repéré)', async () => {
    mockApi.get.mockImplementation(async (url) => url.startsWith('/settings/units')
      ? { items: [{ id: 'u1', name: 'Kilogramme', abbreviation: 'kg' }] }
      : { items: [{ id: 't1', name: 'Réduit', rate: '5.5', is_default: true }] })
    const opts = await bc.fetchProductFormOptions()
    expect(opts.units).toEqual([{ id: 'u1', label: 'Kilogramme (kg)', abbreviation: 'kg' }])
    expect(opts.taxRates).toEqual([{ id: 't1', label: 'Réduit — 5.5 %', isDefault: true }])
  })

  it('création : POST /products avec le code-barres puis mouvement de quantité initiale', async () => {
    mockApi.post.mockImplementation(async (url) => url === '/products'
      ? { success: true, data: { id: 'new-1', name: 'Sucre', barcode: '3123' } }
      : { success: true })
    mockApi.patch.mockRejectedValue(notFound())
    const { item, queued } = await bc.createStockProduct({
      name: ' Sucre ', barcode: '3123', unitId: 'u1', taxRateId: 't1', price: 1.2, quantity: 3, unit: 'kg',
    })
    expect(mockApi.post).toHaveBeenCalledWith('/products', {
      name: 'Sucre', barcode: '3123', unit_id: 'u1', tax_rate_id: 't1', current_price: 1.2, section: 'kitchen', stock_tracking_enabled: true,
    })
    expect(mockApi.post).toHaveBeenCalledWith('/inventory/movements', expect.objectContaining({
      product_id: 'new-1', movement_type: 'adjustment', quantity: 3,
    }))
    expect(item).toMatchObject({ id: 'new-1', quantity: 3, unit: 'kg', barcode: '3123' })
    expect(queued).toBe(false)
  })

  it('création hors-ligne (requête mise en file) : erreur explicite', async () => {
    mockApi.post.mockResolvedValueOnce({ success: true, queued: true })
    await expect(bc.createStockProduct({ name: 'X', barcode: '1234', unitId: 'u', taxRateId: 't', price: 1 }))
      .rejects.toMatchObject({ offline: true })
  })
})

describe('BarcodeScanner.vue', () => {
  afterEach(() => {
    delete window.BarcodeDetector
    delete navigator.mediaDevices
  })

  it('sans API Barcode Detection : saisie manuelle', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
    const w = mount(BarcodeScanner)
    await flushPromises()
    expect(w.text()).toContain('Chrome ou Edge')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    await w.find('.bs-input').setValue(' 3017 620422003 ')
    await w.find('form').trigger('submit')
    expect(w.emitted('detected')).toEqual([['3017620422003']])
  })

  it('caméra refusée : message + saisie manuelle', async () => {
    window.BarcodeDetector = class { detect() { return [] } }
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(async () => { throw new Error('NotAllowed') }) }, configurable: true,
    })
    const w = mount(BarcodeScanner)
    await flushPromises()
    expect(w.text()).toContain('Accès à la caméra refusé')
  })

  it('code détecté : émis une fois, caméra coupée', async () => {
    vi.useFakeTimers()
    const track = { stop: vi.fn() }
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['ean_13', 'qr_code'] }
      constructor(opts) { this.opts = opts }
      async detect() { return [{ rawValue: '3017620422003' }] }
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => Object.assign(new window.MediaStream(), { getTracks: () => [track] })),
      },
      configurable: true,
    })
    const w = mount(BarcodeScanner)
    await vi.advanceTimersByTimeAsync(0)
    const video = w.find('video').element
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true })
    await vi.advanceTimersByTimeAsync(450)
    expect(w.emitted('detected')).toEqual([['3017620422003']])
    expect(track.stop).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('InventoryItems.vue — scan', () => {
  async function mountView(path = '/stock/inventory') {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/stock', component: Stub }, { path: '/stock/inventory', component: InventoryItems }],
    })
    router.push(path)
    await router.isReady()
    const w = mount(InventoryItems, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return w
  }

  beforeEach(() => {
    mockApi.get.mockImplementation(async (url) => {
      if (url === '/inventory/items') return { data: ITEMS.map(i => ({ ...i })) }
      if (url.startsWith('/inventory/barcode/lookup')) {
        if (url.endsWith('3017620422003')) return { data: { product_id: 'p1', product_name: 'Farine T55' } }
        throw notFound()
      }
      if (url.startsWith('/settings/units')) return { items: [{ id: 'u1', name: 'Kilogramme', abbreviation: 'kg' }] }
      if (url.startsWith('/settings/tax-rates')) return { items: [{ id: 't1', name: 'Normal', rate: 20, is_default: true }] }
      throw notFound()
    })
    mockApi.patch.mockResolvedValue({ success: true })
  })

  async function scanCode(w, code) {
    await w.find('[aria-label="Scanner un code-barres"]').trigger('click')
    w.findComponent(BarcodeScanner).vm.$emit('detected', code)
    await flushPromises()
  }

  it('produit connu : fiche avec quantité 1 par défaut, + ajoute au stock', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const w = await mountView()
    await scanCode(w, '3017620422003')
    expect(w.find('.inv-sheet-title').text()).toBe('Farine T55')
    expect(w.find('#inv-scan-qty').element.value).toBe('1')
    await w.find('.inv-sheet-actions .primary').trigger('click')
    expect(w.find('.inv-sheet').exists()).toBe(false)
    // Liste triée stock bas d'abord : Beurre doux, puis Farine T55
    expect(w.findAll('.inv-name').map(n => n.text())).toEqual(['Beurre doux', 'Farine T55'])
    expect(w.findAll('.inv-qty-value')[1].text()).toBe('13')
    await vi.advanceTimersByTimeAsync(800)
    expect(mockApi.patch).toHaveBeenCalledWith('/inventory/items/p1/adjust', { delta: 1 })
    vi.useRealTimers()
    w.unmount()
  })

  it('produit inconnu : « Ajouter au stock » avec le code-barres pré-rempli, puis création', async () => {
    mockApi.post.mockImplementation(async (url) => url === '/products'
      ? { success: true, data: { id: 'new-1', name: 'Sucre' } }
      : { success: true })
    const w = await mountView()
    await scanCode(w, '5000000000017')
    expect(w.text()).toContain('Produit inconnu')
    await w.find('.inv-sheet-actions .primary').trigger('click')
    await flushPromises()
    const inputs = w.findAll('.inv-form input')
    expect(inputs[0].element.value).toBe('5000000000017')
    expect(inputs[2].element.value).toBe('1')
    await inputs[1].setValue('Sucre')
    await inputs[3].setValue('1.5')
    await w.find('.inv-form').trigger('submit')
    await flushPromises()
    expect(mockApi.post).toHaveBeenCalledWith('/products', expect.objectContaining({
      name: 'Sucre', barcode: '5000000000017', unit_id: 'u1', tax_rate_id: 't1', current_price: 1.5,
    }))
    expect(mockApi.patch).toHaveBeenCalledWith('/inventory/items/new-1/adjust', { delta: 1 })
    expect(w.find('.inv-sheet').exists()).toBe(false)
    expect(w.text()).toContain('Sucre')
    w.unmount()
  })

  it('?scan=1 : scanner ouvert directement', async () => {
    const w = await mountView('/stock/inventory?scan=1')
    expect(w.findComponent(BarcodeScanner).exists()).toBe(true)
    w.unmount()
  })
})

/* ═══ 4. Avis client ═══ */

describe('feedback — lien et envoi', () => {
  it('lien /mobile/feedback?table=X&est=…', () => {
    expect(fb.feedbackUrl({ table: 12, establishmentId: 'est-1' }, { origin: 'https://app.tipsmana.fr' }))
      .toBe('https://app.tipsmana.fr/mobile/feedback?table=12&est=est-1')
    expect(fb.feedbackParamsFromRoute({ params: {}, query: { table: '12', est: 'est-1' } }))
      .toEqual({ table: 12, establishmentId: 'est-1' })
    expect(fb.feedbackParamsFromRoute({ params: {}, query: {} })).toEqual({ table: null, establishmentId: null })
  })

  it('POST /feedback { table, rating, comment, establishment_id }', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, status: 201 }))
    const res = await fb.submitFeedback({ table: 12, rating: 5, comment: '  Parfait  ', establishmentId: 'est-1' }, { fetchImpl, now: 1000 })
    expect(res).toEqual({ ok: true, at: 1000 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/feedback')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ table: 12, rating: 5, comment: 'Parfait', establishment_id: 'est-1' })
  })

  it('note hors 1–5 refusée, commentaire vide omis, un avis par table', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, status: 201 }))
    expect(await fb.submitFeedback({ table: 1, rating: 0 }, { fetchImpl })).toEqual({ ok: false, reason: 'invalid' })
    expect(await fb.submitFeedback({ table: 1, rating: 6 }, { fetchImpl })).toEqual({ ok: false, reason: 'invalid' })
    await fb.submitFeedback({ table: 1, rating: 3, comment: '   ', establishmentId: 'e' }, { fetchImpl, now: 1000 })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).not.toHaveProperty('comment')
    expect(await fb.submitFeedback({ table: 1, rating: 4, establishmentId: 'e' }, { fetchImpl, now: 2000 }))
      .toEqual({ ok: false, reason: 'already' })
    expect((await fb.submitFeedback({ table: 2, rating: 4, establishmentId: 'e' }, { fetchImpl, now: 2000 })).ok).toBe(true)
    expect((await fb.submitFeedback({ table: 1, rating: 4, establishmentId: 'e' }, { fetchImpl, now: 1000 + fb.RESEND_DELAY_MS })).ok).toBe(true)
  })

  it('route absente / erreur / hors-ligne : pas mémorisé', async () => {
    expect(await fb.submitFeedback({ table: 1, rating: 4 }, { fetchImpl: () => Promise.resolve({ ok: false, status: 404 }) }))
      .toMatchObject({ ok: false, reason: 'unavailable' })
    expect(await fb.submitFeedback({ table: 1, rating: 4 }, { fetchImpl: () => Promise.resolve({ ok: false, status: 500 }) }))
      .toMatchObject({ ok: false, reason: 'error' })
    expect(await fb.submitFeedback({ table: 1, rating: 4 }, { fetchImpl: () => Promise.reject(new TypeError('x')) }))
      .toMatchObject({ ok: false, reason: 'offline' })
    expect(fb.lastFeedbackAt(1, undefined)).toBeNull()
  })
})

describe('Feedback.vue (/feedback)', () => {
  async function mountAt(path) {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/feedback', component: Feedback }] })
    router.push(path)
    await router.isReady()
    return mount(Feedback, { global: { plugins: [router] } })
  }

  afterEach(() => { vi.unstubAllGlobals() })

  it('sans table : invite à scanner le QR code', async () => {
    const w = await mountAt('/feedback')
    expect(w.text()).toContain('Table inconnue')
    expect(w.find('.fb-star').exists()).toBe(false)
  })

  it('note 4 étoiles + commentaire → envoi sans connexion puis remerciement', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const w = await mountAt('/feedback?table=7&est=est-9')
    expect(w.text()).toContain('Table 7')
    expect(w.find('.fb-submit').element.disabled).toBe(true)
    await w.findAll('.fb-star')[3].trigger('click')
    expect(w.findAll('.fb-star.on')).toHaveLength(4)
    expect(w.text()).toContain('Très bien')
    await w.find('textarea').setValue('Service rapide')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ table: 7, rating: 4, comment: 'Service rapide', establishment_id: 'est-9' })
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(w.text()).toContain('Merci pour votre avis')
  })

  it('route absente côté backend : message, formulaire conservé', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })))
    const w = await mountAt('/feedback?table=3')
    await w.findAll('.fb-star')[4].trigger('click')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('.fb-error').text()).toContain('pas encore disponible')
    expect(w.find('form').exists()).toBe(true)
  })

  it('avis déjà laissé depuis ce téléphone : remerciement direct', async () => {
    await fb.submitFeedback({ table: 5, rating: 5, establishmentId: 'e' }, { fetchImpl: () => Promise.resolve({ ok: true, status: 201 }) })
    const w = await mountAt('/feedback?table=5&est=e')
    expect(w.text()).toContain('Merci pour votre avis')
  })
})
