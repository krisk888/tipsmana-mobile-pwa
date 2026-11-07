/**
 * Service — scan QR table, notifications de statut, profil serveur
 * Tests: parsing QR, scanner (repli manuel / caméra indisponible), TableSelect,
 *        transitions en_cuisine → servi, permission, watcher, stats, ServiceProfile
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
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))
const mockPush = vi.hoisted(() => ({ initPushSubscription: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../../src/shared/push', () => ({ ...mockPush, default: mockPush.initPushSubscription }))

import * as svc from '../../src/shared/serviceOrders'
import * as notif from '../../src/shared/orderNotifications'
import QrTableScanner from '../../src/components/QrTableScanner.vue'
import TableSelect from '../../src/views/service/TableSelect.vue'
import ServiceProfile from '../../src/views/service/ServiceProfile.vue'
import { useAuthStore } from '../../src/stores/authStore'

const Stub = { template: '<div />' }

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: Stub },
      { path: '/service', name: 'Service', component: TableSelect },
      { path: '/service/history', name: 'ServiceHistory', component: Stub },
      { path: '/service/profile', name: 'ServiceProfile', component: ServiceProfile },
      { path: '/service/table/:number(\\d+)', name: 'ServiceOrder', component: Stub },
    ],
  })
}

async function mountAt(path, component, pinia = createPinia()) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router, pinia] } })
  await flushPromises()
  return { wrapper, router }
}

function seedKitchen(records) {
  localStorage.setItem('tipsmana_service_kitchen', JSON.stringify({ 'est-1': records }))
}

function kitchenStatusResponse(statuses) {
  return { success: true, data: { items: statuses.map((status, i) => ({ id: `k${i}`, status, qty: 1 })) } }
}

const originalMediaDevices = navigator.mediaDevices

beforeEach(() => {
  localStorage.clear()
  mockApi.get.mockReset()
  mockApi.post.mockReset()
  mockApi.getEstablishmentId.mockReturnValue('est-1')
  setActivePinia(createPinia())
  window.__showToast = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true })
  vi.unstubAllGlobals()
})

// ── QR ───────────────────────────────────────────────────
describe('parseTableQr', () => {
  it.each([
    ['12', 12],
    [' T7 ', 7],
    ['Table 4', 4],
    ['TABLE:15', 15],
    ['table#3', 3],
    ['https://app.tipsmana.fr/mobile/service?table=9', 9],
    ['https://app.tipsmana.fr/r/abc?t=21', 21],
    ['https://app.tipsmana.fr/mobile/service/table/42', 42],
    ['https://tipsmana.fr/tables/8/', 8],
  ])('%s → %s', (text, expected) => {
    expect(svc.parseTableQr(text)).toBe(expected)
  })

  it.each(['', 'bonjour', '0', '1000', '12.5', 'https://tipsmana.fr/menu', 'https://x.fr/?table=abc', null])(
    'rejette %s', (text) => {
      expect(svc.parseTableQr(text)).toBeNull()
    },
  )
})

describe('QrTableScanner', () => {
  it('sans caméra : message de repli et saisie manuelle', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    const wrapper = mount(QrTableScanner)
    await flushPromises()
    expect(wrapper.find('.qr-error').text()).toContain('saisissez le numéro')
    const btn = wrapper.find('.qr-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    await wrapper.find('.qr-manual-input').setValue('14')
    await btn.trigger('click')
    expect(wrapper.emitted('detected')).toEqual([[14]])
  })

  it('caméra refusée : message dédié', async () => {
    const err = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockRejectedValue(err) }, configurable: true,
    })
    const wrapper = mount(QrTableScanner)
    await flushPromises()
    expect(wrapper.find('.qr-error').text()).toContain('refusé')
  })

  it('arrête la caméra à la fermeture', async () => {
    const stop = vi.fn()
    const media = { getTracks: () => [{ stop }] }
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(media) }, configurable: true,
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    // happy-dom n'accepte qu'un vrai MediaStream
    vi.spyOn(HTMLMediaElement.prototype, 'srcObject', 'set').mockImplementation(() => {})
    const wrapper = mount(QrTableScanner)
    await vi.waitFor(() => expect(wrapper.find('.qr-viewport-state').exists()).toBe(false))
    expect(wrapper.find('.qr-error').exists()).toBe(false)
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { facingMode: 'environment' } }),
    )
    wrapper.unmount()
    expect(stop).toHaveBeenCalled()
  })
})

describe('TableSelect — scan', () => {
  it('table scannée : ouvre la note si occupée, couverts si libre', async () => {
    mockApi.get.mockImplementation((url) => {
      if (url === '/floorplan/spaces') {
        return Promise.resolve({ success: true, data: [{ id: 's1', name: 'Salle', tables: [{ number: 3, state: 'occupee' }, { number: 5, state: 'libre' }] }] })
      }
      return Promise.resolve({ success: true, data: [] })
    })
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    const { wrapper, router } = await mountAt('/service', TableSelect)

    await wrapper.find('.svc-scan-btn').trigger('click')
    expect(wrapper.findComponent(QrTableScanner).exists()).toBe(true)

    wrapper.findComponent(QrTableScanner).vm.$emit('detected', 3)
    await flushPromises()
    expect(wrapper.findComponent(QrTableScanner).exists()).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/service/table/3')

    await router.push('/service')
    await flushPromises()
    await wrapper.find('.svc-scan-btn').trigger('click')
    wrapper.findComponent(QrTableScanner).vm.$emit('detected', 5)
    await flushPromises()
    expect(wrapper.find('.modal-title').text()).toContain('Table 5')
    wrapper.unmount()
  })
})

// ── Statuts / notifications ──────────────────────────────
describe('checkKitchenTransitions', () => {
  it('notifie en_cuisine → servi une seule fois', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], sentItemIds: [], failedItemIds: [], tableNumber: 4, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockResolvedValue(kitchenStatusResponse(['served', 'served']))

    const first = await svc.checkKitchenTransitions('est-1')
    expect(first).toEqual([{ ticketId: 't-1', tableNumber: 4, from: 'en_cuisine', to: 'servi' }])
    expect(svc.getKitchenRecord('est-1', 't-1').status).toBe('servi')

    mockApi.get.mockClear()
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([])
    expect(mockApi.get).not.toHaveBeenCalled() // note servie : plus suivie
  })

  it('pas de notification tant que tout n’est pas servi', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 4, status: 'en_cuisine', at: Date.now() } })
    mockApi.get.mockResolvedValue(kitchenStatusResponse(['served', 'ready']))
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([])
    expect(svc.getKitchenRecord('est-1', 't-1').status).toBe('en_cuisine')
  })

  it('note antérieure au suivi (sans statut) : mémorise sans notifier', async () => {
    seedKitchen({ 't-1': { refs: ['MOB-1'], at: Date.now() } })
    mockApi.get.mockResolvedValue(kitchenStatusResponse(['served']))
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([])
    expect(svc.getKitchenRecord('est-1', 't-1').status).toBe('servi')
  })

  it('ignore les erreurs réseau et les bons trop anciens', async () => {
    seedKitchen({
      't-1': { refs: ['MOB-1'], status: 'en_cuisine', at: Date.now() },
      't-2': { refs: ['MOB-2'], status: 'en_cuisine', at: Date.now() - 7 * 3600 * 1000 },
    })
    mockApi.get.mockRejectedValue(new Error('offline'))
    expect(await svc.checkKitchenTransitions('est-1')).toEqual([])
    expect(svc.getKitchenRecord('est-1', 't-1').status).toBe('en_cuisine')
    expect(mockApi.get).toHaveBeenCalledTimes(1) // t-2 non relevé
  })

  it('un envoi cuisine remet la note « en cuisine » et mémorise la table', async () => {
    mockApi.post.mockResolvedValue({ success: true, data: { orders: [{ ticket_ref: 'MOB-7' }] } })
    const ticket = { id: 't-9', tableNumber: 6, items: [] }
    await svc.dispatchTicketItems({
      establishmentId: 'est-1',
      ticket,
      items: [{ id: 'i-1', productId: 'p1', name: 'Plat', qty: 1, course: 'plat' }],
    })
    const rec = svc.getKitchenRecord('est-1', 't-9')
    expect(rec).toMatchObject({ refs: ['MOB-7'], tableNumber: 6, status: 'en_cuisine' })
  })
})

describe('orderNotifications', () => {
  function stubNotification(permission, result = 'granted') {
    const Notif = vi.fn()
    Notif.permission = permission
    Notif.requestPermission = vi.fn().mockResolvedValue(result)
    vi.stubGlobal('Notification', Notif)
    return Notif
  }

  it('demande la permission une seule fois', async () => {
    const N = stubNotification('default', 'default')
    expect(await notif.ensureNotificationPermission()).toBe('default')
    expect(await notif.ensureNotificationPermission()).toBe('default')
    expect(N.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('permission accordée : abonnement Web Push', async () => {
    mockPush.initPushSubscription.mockClear()
    stubNotification('default', 'granted')
    expect(await notif.ensureNotificationPermission()).toBe('granted')
    expect(mockPush.initPushSubscription).toHaveBeenCalledTimes(1)
  })

  it('ne redemande pas si déjà accordée / refusée', async () => {
    const N = stubNotification('denied')
    expect(await notif.ensureNotificationPermission()).toBe('denied')
    expect(N.requestPermission).not.toHaveBeenCalled()
  })

  it('statusMessage', () => {
    expect(notif.statusMessage({ tableNumber: 4, to: 'servi' })).toBe('✅ Table 4 : commande servie')
    expect(notif.statusMessage({ to: 'en_cuisine' })).toContain('Commande')
  })

  it('toast au premier plan, notification système en arrière-plan', async () => {
    const N = stubNotification('granted')
    await notif.notifyOrderStatus({ ticketId: 't-1', tableNumber: 4, to: 'servi' })
    expect(window.__showToast).toHaveBeenCalledWith('✅ Table 4 : commande servie', 'success')
    expect(N).not.toHaveBeenCalled()

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await notif.notifyOrderStatus({ ticketId: 't-1', tableNumber: 4, to: 'servi' })
    expect(N).toHaveBeenCalledWith('Tipsmana — Service', expect.objectContaining({ body: '✅ Table 4 : commande servie' }))
    visibility.mockRestore()
  })

  it('le watcher relève les statuts et s’arrête proprement', async () => {
    vi.useFakeTimers()
    try {
      seedKitchen({ 't-1': { refs: ['MOB-1'], tableNumber: 2, status: 'en_cuisine', at: Date.now() } })
      mockApi.get.mockResolvedValue(kitchenStatusResponse(['ready']))
      const stop = notif.startOrderStatusWatcher({ getEstId: () => 'est-1', interval: 1000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(window.__showToast).not.toHaveBeenCalled()

      mockApi.get.mockResolvedValue(kitchenStatusResponse(['served']))
      await vi.advanceTimersByTimeAsync(1000)
      expect(window.__showToast).toHaveBeenCalledWith('✅ Table 2 : commande servie', 'success')

      stop()
      mockApi.get.mockClear()
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockApi.get).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Profil serveur ───────────────────────────────────────
describe('stats serveur', () => {
  it('compte commandes et tables du jour, par utilisateur et établissement', () => {
    const now = new Date(2026, 10, 8, 20).getTime()
    const yesterday = new Date(2026, 10, 7, 20).getTime()
    svc.recordServiceOrder({ estId: 'est-1', userId: 1, tableNumber: 4, itemCount: 3, at: yesterday })
    svc.recordServiceOrder({ estId: 'est-1', userId: 1, tableNumber: 4, itemCount: 2, at: now })
    svc.recordServiceOrder({ estId: 'est-1', userId: 1, tableNumber: 2, itemCount: 1, at: now })
    svc.recordServiceOrder({ estId: 'est-1', userId: 1, tableNumber: 4, itemCount: 1, at: now })
    svc.recordServiceOrder({ estId: 'est-1', userId: 2, tableNumber: 9, itemCount: 1, at: now })
    svc.recordServiceOrder({ estId: 'est-2', userId: 1, tableNumber: 7, itemCount: 1, at: now })

    expect(svc.getServiceStats({ estId: 'est-1', userId: 1, now })).toEqual({
      ordersToday: 3, itemsToday: 4, tablesToday: [2, 4],
    })
    // purge des jours précédents à l'écriture
    expect(JSON.parse(localStorage.getItem('tipsmana_service_stats')).some(e => e.at === yesterday)).toBe(false)
  })
})

describe('ServiceProfile', () => {
  async function mountProfile() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useAuthStore()
    store.user = { id: 1, first_name: 'Léa', last_name: 'Martin', email: 'lea@resto.fr' }
    store.roleCode = 'SERVEUR'
    store.establishment = { id: 'est-1', name: 'Le Bistrot' }
    return { store, ...(await mountAt('/service/profile', ServiceProfile, pinia)) }
  }

  it('affiche identité, rôle et statistiques', async () => {
    svc.recordServiceOrder({ estId: 'est-1', userId: 1, tableNumber: 4, itemCount: 2 })
    svc.recordServiceOrder({ estId: 'est-1', userId: 1, tableNumber: 6, itemCount: 1 })
    mockApi.get.mockResolvedValue({
      success: true,
      data: [
        { id: 't-1', table_number: 4, serveur_name: 'Léa Martin', items: [] },
        { id: 't-2', table_number: 8, serveur_name: 'Paul Durand', items: [] },
      ],
    })
    const { wrapper } = await mountProfile()
    expect(mockApi.get).toHaveBeenCalledWith('/table-tickets/list')
    expect(wrapper.find('.sp-name').text()).toBe('Léa Martin')
    expect(wrapper.find('.sp-email').text()).toBe('lea@resto.fr')
    expect(wrapper.find('.sp-role').text()).toBe('Serveur')
    expect(wrapper.find('.sp-avatar').text()).toBe('LM')
    const values = wrapper.findAll('.sp-stat-value').map(v => v.text())
    expect(values).toEqual(['2', '2', '1'])
    expect(wrapper.findAll('.sp-table-chip').map(c => c.text())).toEqual(['4', '6'])
  })

  it('tables ouvertes indisponibles hors-ligne', async () => {
    mockApi.get.mockRejectedValue(new Error('offline'))
    const { wrapper } = await mountProfile()
    expect(wrapper.find('.sp-warning').exists()).toBe(true)
    expect(wrapper.findAll('.sp-stat-value')[2].text()).toBe('—')
  })

  it('déconnexion', async () => {
    mockApi.get.mockResolvedValue({ success: true, data: [] })
    const { wrapper, router, store } = await mountProfile()
    await wrapper.find('.sp-logout').trigger('click')
    await flushPromises()
    expect(store.user).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
