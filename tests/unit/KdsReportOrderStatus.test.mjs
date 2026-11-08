/**
 * Statut commande (push / polling), KDS mobile en colonnes, rapport de fin de service
 * Tests: GET /mobile/orders/{id}/status + repli, badge / vibration / intervalle,
 *        logique KDS (colonnes, minuteur, PATCH + repli validate), vue KdsBoard
 *        (boutons, glisser-déposer, son), rapport (normalisation, PDF, partage)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))
vi.mock('../../src/shared/push', () => ({ initPushSubscription: vi.fn(() => Promise.resolve(true)), default: vi.fn() }))
const badgeStore = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../src/shared/offlineStore', () => ({
  offlineStore: {
    getBadgeCount: vi.fn(async () => badgeStore.count),
    setBadgeCount: vi.fn(async (n) => { badgeStore.count = n }),
    clearBadge: vi.fn(async () => { badgeStore.count = 0 }),
  },
}))

import * as svc from '../../src/shared/serviceOrders'
import * as notif from '../../src/shared/orderNotifications'
import * as kds from '../../src/shared/kds'
import * as report from '../../src/shared/serviceReport'
import { createPdf, encodePdfText } from '../../src/shared/pdf'
import { t } from '../../src/i18n'
import KdsBoard from '../../src/views/cuisine/KdsBoard.vue'
import ServiceReport from '../../src/views/service/ServiceReport.vue'

const Stub = { template: '<div />' }

async function mountView(component, path) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/cuisine', component: Stub },
      { path: '/cuisine/board', component: KdsBoard },
      { path: '/service', component: Stub },
      { path: '/service/report', component: ServiceReport },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router, createPinia()] }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function notFoundRoute() {
  const err = new Error('Not Found')
  err.status = 404
  err.data = { detail: 'Not Found' }
  return err
}

function seedKitchen(records) {
  localStorage.setItem('tipsmana_service_kitchen', JSON.stringify({ 'est-1': records }))
}

beforeEach(() => {
  localStorage.clear()
  mockApi.get.mockReset()
  mockApi.post.mockReset()
  mockApi.patch.mockReset()
  badgeStore.count = 0
  window.__showToast = vi.fn()
  navigator.vibrate = vi.fn(() => true)
  navigator.setAppBadge = vi.fn(() => Promise.resolve())
  navigator.clearAppBadge = vi.fn(() => Promise.resolve())
  svc.resetOrderStatusEndpointCache()
  kds.resetKdsEndpointCache()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

// ═══ 1. Notifications de statut commande ═══════════════════════════

describe('statut commande — GET /mobile/orders/{id}/status', () => {
  it('normalise les statuts KDS et mobiles', () => {
    expect(svc.normalizeRemoteStatus('preparing')).toBe('en_cuisine')
    expect(svc.normalizeRemoteStatus('READY')).toBe('pret')
    expect(svc.normalizeRemoteStatus('prêt')).toBe('pret')
    expect(svc.normalizeRemoteStatus('served')).toBe('servi')
    expect(svc.normalizeRemoteStatus('???')).toBeNull()
  })

  it('utilise l’endpoint mobile quand il répond', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 7, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockResolvedValue({ success: true, data: { status: 'ready' } })
    const transitions = await svc.checkKitchenTransitions('est-1')
    expect(mockApi.get).toHaveBeenCalledWith('/mobile/orders/t-1/status')
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    expect(transitions).toEqual([{ ticketId: 't-1', tableNumber: 7, from: 'en_cuisine', to: 'pret' }])
  })

  it('route absente (404 Not Found) : repli kitchen-status, sans réessayer ensuite', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 7, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockImplementation(async (url) => {
      if (url.startsWith('/mobile/')) throw notFoundRoute()
      return { success: true, data: { items: [{ status: 'served' }] } }
    })
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([{ ticketId: 't-1', tableNumber: 7, from: 'en_cuisine', to: 'servi' }])
    expect(mockApi.get.mock.calls.map(c => c[0])).toEqual([
      '/mobile/orders/t-1/status',
      '/cash/tickets/MOB-1/kitchen-status?ticket_ref=MOB-1',
    ])

    seedKitchen({ 't-2': { refs: ['MOB-2'], tableNumber: 8, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockClear()
    await svc.checkKitchenTransitions('est-1')
    expect(mockApi.get.mock.calls.map(c => c[0])).toEqual(['/cash/tickets/MOB-2/kitchen-status?ticket_ref=MOB-2'])
  })

  it('un 404 « note introuvable » ne désactive pas l’endpoint', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], status: 'en_cuisine', at: Date.now() } })
    const err = new Error('Ticket introuvable')
    err.status = 404
    err.data = { detail: 'Ticket introuvable' }
    mockApi.get.mockRejectedValue(err)
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([])
    mockApi.get.mockClear()
    await svc.checkKitchenTransitions('est-1')
    expect(mockApi.get).toHaveBeenCalledWith('/mobile/orders/t-1/status')
  })

  it('statut reçu par push : mémorisé sur la note de la table (pas de double alerte)', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 3, status: 'en_cuisine', at: Date.now() } })
    svc.applyPushedStatus('est-1', 3, 'ready')
    expect(svc.getKitchenRecord('est-1', 't-1').status).toBe('pret')
    mockApi.get.mockResolvedValue({ success: true, data: { status: 'ready' } })
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([])
  })
})

describe('notifyOrderStatus — toast, vibration, badge', () => {
  it('message « prêt » avec le numéro de table', () => {
    expect(notif.statusMessage({ tableNumber: 5, to: 'pret' })).toBe('🛎️ Table 5 : commande prête')
  })

  it('toast + vibration + badge incrémenté', async () => {
    await notif.notifyOrderStatus({ ticketId: 't-1', tableNumber: 5, to: 'pret' })
    await notif.notifyOrderStatus({ ticketId: 't-2', tableNumber: 6, to: 'servi' })
    expect(window.__showToast).toHaveBeenCalledWith('🛎️ Table 5 : commande prête', 'success')
    expect(navigator.vibrate).toHaveBeenCalledTimes(2)
    expect(navigator.setAppBadge).toHaveBeenLastCalledWith(2)
    expect(badgeStore.count).toBe(2)
  })

  it('incréments simultanés : aucun perdu', async () => {
    await Promise.all([notif.incrementOrderBadge(), notif.incrementOrderBadge(), notif.incrementOrderBadge()])
    expect(badgeStore.count).toBe(3)
    await notif.clearOrderBadge()
    expect(badgeStore.count).toBe(0)
    expect(navigator.clearAppBadge).toHaveBeenCalled()
  })

  it('notification système locale quand l’app est en arrière-plan', async () => {
    const N = vi.fn()
    N.permission = 'granted'
    vi.stubGlobal('Notification', N)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await notif.notifyOrderStatus({ ticketId: 't-1', tableNumber: 9, to: 'pret' })
    expect(N).toHaveBeenCalledWith('Tipsmana — Service', expect.objectContaining({ body: '🛎️ Table 9 : commande prête', tag: 'order-t-1' }))
    visibility.mockRestore()
  })
})

describe('startOrderStatusWatcher — polling 15 s, ralenti quand le push arrive', () => {
  function fakeSw() {
    const listeners = {}
    const sw = {
      addEventListener: vi.fn((type, fn) => { listeners[type] = fn }),
      removeEventListener: vi.fn(),
      emit: (data) => listeners.message?.({ data }),
    }
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true })
    return sw
  }

  afterEach(() => { delete navigator.serviceWorker })

  it('relève toutes les 15 s par défaut', async () => {
    vi.useFakeTimers()
    seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 2, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockResolvedValue({ success: true, data: { status: 'preparing' } })
    const stop = notif.startOrderStatusWatcher({ getEstId: () => 'est-1' })
    await vi.advanceTimersByTimeAsync(0)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(14000)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockApi.get).toHaveBeenCalledTimes(2)
    stop()
  })

  it('message push du service worker : toast, badge, et relevé ralenti', async () => {
    vi.useFakeTimers()
    const sw = fakeSw()
    seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 2, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockResolvedValue({ success: true, data: { status: 'preparing' } })
    const stop = notif.startOrderStatusWatcher({ getEstId: () => 'est-1', interval: 1000, pushInterval: 10000 })
    await vi.advanceTimersByTimeAsync(0)

    sw.emit({ type: 'ORDER_STATUS', tableNumber: 2, status: 'ready' })
    await vi.advanceTimersByTimeAsync(0)
    expect(window.__showToast).toHaveBeenCalledWith('🛎️ Table 2 : commande prête', 'success')
    expect(navigator.vibrate).toHaveBeenCalled()
    expect(badgeStore.count).toBe(1)
    expect(svc.getKitchenRecord('est-1', 't-1').status).toBe('pret')

    mockApi.get.mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockApi.get).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockApi.get).toHaveBeenCalledTimes(1)
    stop()
    expect(sw.removeEventListener).toHaveBeenCalled()
  })
})

// ═══ 2. KDS mobile ════════════════════════════════════════════════

const MIN = 60000

function kdsOrder(id, status, minutesAgo, extra = {}) {
  return {
    id, status, ticket_ref: `MOB-${id}`,
    created_at: new Date(Date.now() - minutesAgo * MIN).toISOString(),
    items: [{ name: `Plat ${id}`, qty: 1, status }],
    ...extra,
  }
}

describe('kds — logique', () => {
  it('colonnes : en attente / en cours / prêt, servis exclus, plus ancien en premier', () => {
    const cols = kds.groupByColumn([
      kdsOrder('a', 'pending', 2), kdsOrder('b', 'printed', 8), kdsOrder('c', 'preparing', 1),
      kdsOrder('d', 'ready', 3), kdsOrder('e', 'served', 30),
    ])
    expect(cols.pending.map(o => o.id)).toEqual(['b', 'a'])
    expect(cols.preparing.map(o => o.id)).toEqual(['c'])
    expect(cols.ready.map(o => o.id)).toEqual(['d'])
  })

  it('minuteur : vert < 10 min, orange 10–15 min, rouge > 15 min', () => {
    expect(kds.ageLevel(9.9 * MIN)).toBe('ok')
    expect(kds.ageLevel(10 * MIN)).toBe('warn')
    expect(kds.ageLevel(15 * MIN)).toBe('warn')
    expect(kds.ageLevel(15.1 * MIN)).toBe('late')
    expect(kds.formatElapsed(65 * 1000)).toBe('1:05')
    expect(kds.formatElapsed(3725 * 1000)).toBe('1:02:05')
    expect(kds.elapsedMs('nope')).toBe(0)
  })

  it('nouveaux bons : rien au premier chargement, puis les ids inconnus non servis', () => {
    const list = [kdsOrder('a', 'pending', 1), kdsOrder('b', 'served', 1)]
    expect(kds.findNewOrders(new Set(), list)).toEqual([])
    expect(kds.findNewOrders(new Set(['x']), list).map(o => o.id)).toEqual(['a'])
  })

  it('PATCH /kds/orders/{id}/status', async () => {
    mockApi.patch.mockResolvedValue({ success: true })
    await kds.changeOrderStatus(kdsOrder('a', 'pending', 1), 'ready')
    expect(mockApi.patch).toHaveBeenCalledWith('/kds/orders/a/status', { status: 'ready' })
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('PATCH absent : repli validate autant de fois que de crans, une seule tentative PATCH', async () => {
    mockApi.patch.mockRejectedValue(notFoundRoute())
    mockApi.post.mockResolvedValue({ success: true })
    await kds.changeOrderStatus(kdsOrder('a', 'pending', 1), 'ready')
    expect(mockApi.post).toHaveBeenCalledTimes(2)
    expect(mockApi.post).toHaveBeenCalledWith('/cash/kds/cuisine/orders/a/validate', { item_index: null })

    await kds.changeOrderStatus(kdsOrder('b', 'ready', 1), 'served')
    expect(mockApi.patch).toHaveBeenCalledTimes(1)
    expect(mockApi.post).toHaveBeenCalledTimes(3)

    await expect(kds.changeOrderStatus(kdsOrder('c', 'ready', 1), 'pending'))
      .rejects.toMatchObject({ code: 'backward_unsupported' })
  })

  it('autre erreur du PATCH : remontée telle quelle', async () => {
    const err = new Error('Bon déjà servi')
    err.status = 409
    mockApi.patch.mockRejectedValue(err)
    await expect(kds.changeOrderStatus(kdsOrder('a', 'pending', 1), 'preparing')).rejects.toBe(err)
    expect(mockApi.post).not.toHaveBeenCalled()
  })

  it('withStatus aligne les plats (sans toucher aux servis en arrière)', () => {
    const o = { id: 'a', status: 'ready', items: [{ status: 'ready' }, { status: 'served' }] }
    expect(kds.withStatus(o, 'preparing').items.map(i => i.status)).toEqual(['preparing', 'served'])
    expect(kds.withStatus(o, 'served').items.map(i => i.status)).toEqual(['served', 'served'])
  })
})

describe('KdsBoard.vue', () => {
  function listResponse(orders) {
    return { success: true, data: { items: orders } }
  }

  it('affiche les 3 colonnes avec la couleur du minuteur', async () => {
    mockApi.get.mockResolvedValue(listResponse([
      kdsOrder('a', 'pending', 3), kdsOrder('b', 'preparing', 12), kdsOrder('c', 'ready', 20, { table_number: 14 }),
    ]))
    const w = await mountView(KdsBoard, '/cuisine/board')
    expect(mockApi.get).toHaveBeenCalledWith('/cash/kds/cuisine?include_served=false')
    const cols = w.findAll('[data-kds-column]')
    expect(cols.map(c => c.attributes('data-kds-column'))).toEqual(['pending', 'preparing', 'ready'])
    expect(cols[0].text()).toContain('En attente')
    expect(cols[1].text()).toContain('En cours')
    expect(w.find('[data-order-id="a"]').classes()).toContain('age-ok')
    expect(w.find('[data-order-id="b"]').classes()).toContain('age-warn')
    expect(w.find('[data-order-id="c"]').classes()).toContain('age-late')
    expect(w.find('[data-order-id="c"]').text()).toContain('Table 14')
    w.unmount()
  })

  it('bouton suivant : PATCH + déplacement ; erreur : retour à l’état initial', async () => {
    mockApi.get.mockResolvedValue(listResponse([kdsOrder('a', 'pending', 3)]))
    mockApi.patch.mockResolvedValue({ success: true })
    const w = await mountView(KdsBoard, '/cuisine/board')
    await w.find('[data-order-id="a"] .kdsb-move-next').trigger('click')
    await flushPromises()
    expect(mockApi.patch).toHaveBeenCalledWith('/kds/orders/a/status', { status: 'preparing' })
    expect(w.find('[data-kds-column="preparing"] [data-order-id="a"]').exists()).toBe(true)

    mockApi.patch.mockRejectedValue(Object.assign(new Error('Conflit'), { status: 409 }))
    await w.find('[data-order-id="a"] .kdsb-move-next').trigger('click')
    await flushPromises()
    expect(w.find('[data-kds-column="preparing"] [data-order-id="a"]').exists()).toBe(true)
    expect(window.__showToast).toHaveBeenCalledWith('Conflit', 'error')
    w.unmount()
  })

  it('« Servir » depuis la colonne Prêt retire le bon du tableau', async () => {
    mockApi.get.mockResolvedValue(listResponse([kdsOrder('a', 'ready', 3)]))
    mockApi.patch.mockResolvedValue({ success: true })
    const w = await mountView(KdsBoard, '/cuisine/board')
    await w.find('[data-order-id="a"] .kdsb-move-next').trigger('click')
    await flushPromises()
    expect(mockApi.patch).toHaveBeenCalledWith('/kds/orders/a/status', { status: 'served' })
    expect(w.find('[data-order-id="a"]').exists()).toBe(false)
    w.unmount()
  })

  it('glisser-déposer au doigt vers une autre colonne', async () => {
    mockApi.get.mockResolvedValue(listResponse([kdsOrder('a', 'pending', 3)]))
    mockApi.patch.mockResolvedValue({ success: true })
    const w = await mountView(KdsBoard, '/cuisine/board')
    const readyCol = w.find('[data-kds-column="ready"]').element
    document.elementFromPoint = vi.fn(() => readyCol)

    await w.find('[data-order-id="a"] .kdsb-card-head').trigger('pointerdown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 40 }))
    await flushPromises()
    expect(w.find('[data-kds-column="ready"]').classes()).toContain('drop-target')
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: 40 }))
    await flushPromises()
    expect(mockApi.patch).toHaveBeenCalledWith('/kds/orders/a/status', { status: 'ready' })
    expect(w.find('[data-kds-column="ready"] [data-order-id="a"]').exists()).toBe(true)
    delete document.elementFromPoint
    w.unmount()
  })

  it('un simple appui (sans glisser) ne change rien', async () => {
    mockApi.get.mockResolvedValue(listResponse([kdsOrder('a', 'pending', 3)]))
    const w = await mountView(KdsBoard, '/cuisine/board')
    await w.find('[data-order-id="a"] .kdsb-card-head').trigger('pointerdown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 12, clientY: 11 }))
    await flushPromises()
    expect(mockApi.patch).not.toHaveBeenCalled()
    w.unmount()
  })

  it('nouvelle commande au relevé : son + toast', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    const osc = { connect: vi.fn(), frequency: { setValueAtTime: vi.fn() }, start: vi.fn(), stop: vi.fn() }
    const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }
    const Ctx = vi.fn(function () {
      return { state: 'running', currentTime: 0, destination: {}, createOscillator: () => osc, createGain: () => gain }
    })
    vi.stubGlobal('AudioContext', Ctx)
    mockApi.get.mockResolvedValue(listResponse([kdsOrder('a', 'pending', 3)]))
    const w = await mountView(KdsBoard, '/cuisine/board')
    expect(osc.start).not.toHaveBeenCalled()

    mockApi.get.mockResolvedValue(listResponse([kdsOrder('a', 'pending', 3), kdsOrder('b', 'pending', 0)]))
    await vi.advanceTimersByTimeAsync(10000)
    await flushPromises()
    expect(osc.start).toHaveBeenCalled()
    expect(window.__showToast).toHaveBeenCalledWith(t('kitchen.toast.newOrders', { count: 1 }), 'success')
    expect(w.find('[data-order-id="b"]').classes()).toContain('fresh')
    w.unmount()
  })
})

// ═══ 3. Rapport de fin de service ═════════════════════════════════

const RAW_REPORT = {
  date: '2026-11-08',
  total_revenue: 1840.5,
  covers: 62,
  tickets_count: 24,
  tables_count: 18,
  payments: [
    { method: 'CB', amount: 1000 },
    { method: 'especes', amount: 340.5 },
    { method: 'ticket_resto', amount: 300 },
    { method: 'AMEX', amount: 200 },
  ],
  top_items: [
    { name: 'Café', quantity: 40, amount: 80 },
    { name: 'Burger', quantity: 22, amount: 396 },
    { name: 'Frites', quantity: 22, amount: 110 },
    { name: 'Tiramisu', quantity: 15, amount: 120 },
    { name: 'Bière', quantity: 30, amount: 180 },
    { name: 'Salade', quantity: 3, amount: 36 },
  ],
}

describe('serviceReport — normalisation', () => {
  it('chiffres clés, moyennes, top 5 trié par quantité', () => {
    const r = report.normalizeReport(RAW_REPORT, '2026-11-08')
    expect(r).toMatchObject({ revenue: 1840.5, covers: 62, tickets: 24, tables: 18, averageTicket: 76.69, averageCover: 29.69 })
    expect(r.payments).toMatchObject({ card: 1000, cash: 340.5, meal_voucher: 300, amex: 200, other: 0 })
    expect(r.topItems.map(i => i.name)).toEqual(['Café', 'Bière', 'Burger', 'Frites', 'Tiramisu'])
  })

  it('variantes de champs et paiements en objet', () => {
    const r = report.normalizeReport({ ca: '100', nb_covers: 4, nb_tickets: 2, nb_tables: 2, payment_breakdown: { cb: 60, cash: 30, cheque: 10 } }, '2026-11-01')
    expect(r).toMatchObject({ date: '2026-11-01', revenue: 100, covers: 4, tickets: 2, averageTicket: 50 })
    expect(r.payments).toMatchObject({ card: 60, cash: 30, other: 10 })
    expect(report.paymentRows(r).map(p => p.key)).toEqual(['cash', 'card', 'meal_voucher', 'amex', 'other'])
    expect(report.paymentRows(report.normalizeReport({}, 'x')).map(p => p.key)).toEqual(['cash', 'card', 'meal_voucher', 'amex'])
    expect(report.normalizeReport(null, '2026-11-01')).toMatchObject({ revenue: 0, averageTicket: 0, topItems: [] })
  })

  it('parts de paiement', () => {
    const rows = report.paymentRows(report.normalizeReport(RAW_REPORT))
    expect(rows.find(r => r.key === 'card').share).toBeCloseTo(1000 / 1840.5)
  })

  it('GET /mobile/service-report?date=…', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: RAW_REPORT })
    const r = await report.fetchServiceReport('2026-11-08')
    expect(mockApi.get).toHaveBeenCalledWith('/mobile/service-report?date=2026-11-08')
    expect(r.tickets).toBe(24)
  })

  it('date locale (pas UTC)', () => {
    expect(report.localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('texte de partage', () => {
    const txt = report.reportText(report.normalizeReport(RAW_REPORT), { t, fmt: v => `${v} €`, dateLabel: '8 nov.' })
    expect(txt).toContain('Rapport de service — 8 nov.')
    expect(txt).toContain('Couverts : 62')
    expect(txt).toContain('Carte bancaire : 1000 € (54 %)')
    expect(txt).toContain('1. Café × 40 — 80 €')
  })
})

describe('pdf — générateur minimal', () => {
  function decode(bytes) {
    return Array.from(bytes, b => String.fromCharCode(b)).join('')
  }

  it('encode WinAnsi : accents, €, échappement des parenthèses', () => {
    expect(encodePdfText('Café (5 €)')).toBe('Caf\xe9 \\(5 \x80\\)')
    expect(encodePdfText('1 840,50')).toBe('1 840,50')
    expect(encodePdfText('🍔')).toBe('?')
  })

  it('structure PDF valide : en-tête, xref aux bons offsets, trailer', () => {
    const doc = createPdf().text('Rapport', { bold: true }).row('CA', '12 €').bar(0.5).rule()
    const pdf = decode(doc.toBytes())
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    const startxref = Number(pdf.match(/startxref\n(\d+)/)[1])
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref')
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]))
    offsets.forEach((off, i) => expect(pdf.slice(off).startsWith(`${i + 1} 0 obj`)).toBe(true))
    const stream = pdf.match(/<< \/Length (\d+) >>\nstream\n/)
    const start = stream.index + stream[0].length
    expect(pdf.slice(start + Number(stream[1]), start + Number(stream[1]) + 10)).toBe('\nendstream')
  })

  it('saut de page automatique', () => {
    const doc = createPdf()
    for (let i = 0; i < 80; i++) doc.text(`Ligne ${i}`)
    expect(doc.pageCount).toBeGreaterThan(1)
    expect(decode(doc.toBytes())).toContain(`/Count ${doc.pageCount}`)
  })

  it('rapport complet en PDF', async () => {
    const blob = report.buildReportPdf(report.normalizeReport(RAW_REPORT), { t, fmt: v => `${v} €`, dateLabel: '8 nov.' })
    expect(blob.type).toBe('application/pdf')
    const pdf = decode(new Uint8Array(await blob.arrayBuffer()))
    expect(pdf).toContain('(Rapport de fin de service)')
    expect(pdf).toContain('(Ticket restaurant)')
    expect(pdf).toContain('(1. Caf\xe9)')
  })
})

describe('shareReport', () => {
  const blob = new Blob(['%PDF'], { type: 'application/pdf' })

  it('partage le fichier PDF si le navigateur le permet', async () => {
    navigator.share = vi.fn(() => Promise.resolve())
    navigator.canShare = vi.fn(() => true)
    expect(await report.shareReport({ blob, fileName: 'r.pdf', title: 'T', text: 'X' })).toBe('shared-file')
    expect(navigator.share.mock.calls[0][0].files[0].name).toBe('r.pdf')
    delete navigator.share
    delete navigator.canShare
  })

  it('sinon le texte, sinon téléchargement ; annulation respectée', async () => {
    navigator.share = vi.fn(() => Promise.resolve())
    navigator.canShare = vi.fn(() => false)
    expect(await report.shareReport({ blob, fileName: 'r.pdf', title: 'T', text: 'X' })).toBe('shared-text')
    navigator.share = vi.fn(() => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })))
    expect(await report.shareReport({ blob, fileName: 'r.pdf', title: 'T', text: 'X' })).toBe('cancelled')
    delete navigator.share
    delete navigator.canShare
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    expect(await report.shareReport({ blob, fileName: 'r.pdf', title: 'T', text: 'X' })).toBe('downloaded')
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
  })
})

describe('ServiceReport.vue', () => {
  it('affiche CA, couverts, tickets, tables, paiements et top 5', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: RAW_REPORT })
    const w = await mountView(ServiceReport, '/service/report')
    expect(mockApi.get.mock.calls[0][0]).toMatch(/^\/mobile\/service-report\?date=\d{4}-\d{2}-\d{2}$/)
    expect(w.find('[data-test="revenue"]').text()).toMatch(/1\s?840,50\s?€/)
    expect(w.find('[data-test="covers"]').text()).toBe('62')
    expect(w.find('[data-test="tickets"]').text()).toBe('24')
    expect(w.find('[data-test="tables"]').text()).toBe('18')
    expect(w.findAll('.sr-pay').map(p => p.attributes('data-method'))).toEqual(['cash', 'card', 'meal_voucher', 'amex'])
    expect(w.findAll('.sr-top-item')).toHaveLength(5)
    w.unmount()
  })

  it('changement de date : nouveau chargement', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: RAW_REPORT })
    const w = await mountView(ServiceReport, '/service/report')
    await w.find('input[type="date"]').setValue('2026-11-01')
    await w.find('input[type="date"]').trigger('change')
    await flushPromises()
    expect(mockApi.get).toHaveBeenLastCalledWith('/mobile/service-report?date=2026-11-01')
    w.unmount()
  })

  it('erreur 404 : message « indisponible » + réessayer', async () => {
    mockApi.get.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
    const w = await mountView(ServiceReport, '/service/report')
    expect(w.text()).toContain('Rapport indisponible pour cette date')
    mockApi.get.mockResolvedValue({ success: true, data: RAW_REPORT })
    await w.find('.sr-state .sr-btn').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="covers"]').text()).toBe('62')
    w.unmount()
  })

  it('export PDF : téléchargement d’un fichier daté', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: RAW_REPORT })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const w = await mountView(ServiceReport, '/service/report')
    await w.find('[data-test="export"]').trigger('click')
    expect(URL.createObjectURL.mock.calls[0][0].type).toBe('application/pdf')
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    w.unmount()
  })
})
