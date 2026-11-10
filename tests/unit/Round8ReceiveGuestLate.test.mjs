/**
 * Réception fournisseur, app client (appel, historique, paiement), tables en retard
 * Tests: commandes fournisseurs (normalisation, liste et repli, pointage gardé,
 *        écarts, scan, validation par route dédiée ou par livraisons, échec
 *        partiel, hors-ligne → stock local, page /stock/receive) ; paiement
 *        client (prestataires, page de paiement, replis, QR table) ;
 *        historique client ; page /guest (appel serveur, historique, payer) ;
 *        retard (> 15 min) au KDS et en salle ; QR client lu par le scanner table
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
// Pas de canvas dans happy-dom : QR code simulé
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }))

import { setLocale } from '../../src/i18n'
import * as po from '../../src/shared/purchaseOrders'
import * as inv from '../../src/shared/inventory'
import * as pay from '../../src/shared/guestPayment'
import * as gh from '../../src/shared/guestHistory'
import * as late from '../../src/shared/lateAlerts'
import * as svc from '../../src/shared/serviceOrders'
import { callMessage, WAITER_CALL_MESSAGES } from '../../src/shared/waiterCall'
import ReceiveOrders from '../../src/views/stock/ReceiveOrders.vue'
import GuestApp from '../../src/views/guest/GuestApp.vue'
import KdsBoard from '../../src/views/cuisine/KdsBoard.vue'

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

const PO = {
  id: 42,
  reference: 'PO-2026-042',
  supplier_name: 'Metro',
  expected_date: '2026-11-10',
  status: 'sent',
  lines: [
    { id: 1, product_id: 10, product_name: 'Farine', barcode: '3000000000010', quantity: 5, unit: 'kg', unit_price: 1.2 },
    { id: 2, product_id: 11, product_name: 'Beurre', barcode: '3000000000027', quantity: 2, unit: 'kg' },
  ],
}

beforeEach(async () => {
  localStorage.clear()
  mockApi.get.mockReset()
  mockApi.post.mockReset()
  mockApi.getEstablishmentId.mockReturnValue('est-1')
  mockApi.getToken.mockReturnValue('tok')
  po.resetPurchaseOrderState()
  inv.resetInventoryState()
  late.kitchenLateAlert.reset()
  late.tableLateAlert.reset()
  setOnline(true)
  setActivePinia(createPinia())
  window.__showToast = vi.fn()
  navigator.vibrate = vi.fn(() => true)
  await setLocale('fr', { persist: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ═══ 1. Commandes fournisseurs ══════════════════════════════════════

describe('réception fournisseur — logique', () => {
  it('normalise une commande et ses lignes', () => {
    const o = po.normalizePurchaseOrder(PO)
    expect(o).toMatchObject({ id: '42', reference: 'PO-2026-042', supplier: 'Metro', status: 'sent', local: false })
    expect(o.lines[0]).toEqual({ id: '1', productId: '10', name: 'Farine', barcode: '3000000000010', ordered: 5, unit: 'kg', unitCost: 1.2 })
    expect(o.lines[1].unitCost).toBe(null)
    expect(po.normalizePurchaseOrder({})).toBe(null)
  })

  it('liste : commandes « sent » seulement ; route absente → réception libre', async () => {
    mockApi.get.mockResolvedValueOnce({ data: [PO, { ...PO, id: 43, status: 'received' }] })
    const res = await po.fetchSentOrders()
    expect(mockApi.get).toHaveBeenCalledWith('/purchase-orders?status=sent')
    expect(res.available).toBe(true)
    expect(res.orders.map(o => o.id)).toEqual(['42'])

    po.resetPurchaseOrderState()
    mockApi.get.mockRejectedValueOnce(notFound())
    expect(await po.fetchSentOrders()).toEqual({ orders: [], available: false })
    // Route absente mémorisée : plus d'appel
    expect(await po.fetchSentOrders()).toEqual({ orders: [], available: false })
    expect(mockApi.get).toHaveBeenCalledTimes(2)
  })

  it('pointage : écarts par ligne, résumé, gardé sur le téléphone', () => {
    const o = po.normalizePurchaseOrder(PO)
    let p = po.loadProgress(o.id)
    p = po.setReceived(p, '1', 5)
    p = po.setReceived(p, '2', 1.5)
    const lines = po.receiptLines(o, p)
    expect(lines.map(l => [l.received, l.gap, po.gapStatus(l)])).toEqual([[5, 0, 'ok'], [1.5, -0.5, 'short']])
    expect(po.receiptSummary(o, p)).toMatchObject({ total: 2, pointed: 2, ok: 1, short: 1, over: 0, pending: 0 })
    po.saveProgress(o.id, p)
    expect(po.loadProgress(o.id).received).toEqual({ 1: 5, 2: 1.5 })
    expect(po.startedOrderIds().has('42')).toBe(true)
    // Quantité négative bornée à 0 ; retrait du pointage
    expect(po.setReceived(p, '1', -3).received['1']).toBe(0)
    expect(po.clearReceived(p, '1').received).toEqual({ 2: 1.5 })
  })

  it('scan : code de la ligne, puis produit résolu, hors commande, inconnu', async () => {
    const o = po.normalizePurchaseOrder(PO)
    const lookup = vi.fn()
    let r = await po.scanIntoReceipt(o, po.loadProgress(o.id), ' 3000000000010 ', lookup)
    expect(r).toMatchObject({ lineId: '1', status: 'matched' })
    expect(r.progress.received['1']).toBe(5) // premier scan : quantité commandée
    r = await po.scanIntoReceipt(o, r.progress, '3000000000010', lookup)
    expect(r.progress.received['1']).toBe(6) // scans suivants : +1
    expect(lookup).not.toHaveBeenCalled()

    lookup.mockResolvedValueOnce({ status: 'found', item: { id: '11', productId: '11', name: 'Beurre' } })
    r = await po.scanIntoReceipt(o, r.progress, '999', lookup)
    expect(r).toMatchObject({ lineId: '2', status: 'matched' })

    lookup.mockResolvedValueOnce({ status: 'found', item: { id: '77', productId: '77', name: 'Sel', unit: 'kg' } })
    r = await po.scanIntoReceipt(o, r.progress, '777', lookup)
    expect(r).toMatchObject({ lineId: 'x77', status: 'extra' })
    expect(po.receiptLines(o, r.progress).at(-1)).toMatchObject({ name: 'Sel', ordered: 0, received: 1, gap: 1, extra: true })

    lookup.mockResolvedValueOnce({ status: 'unknown', code: '000' })
    const before = r.progress
    r = await po.scanIntoReceipt(o, before, '000', lookup)
    expect(r).toEqual({ progress: before, lineId: null, status: 'unknown' })
  })

  it('validation par POST /purchase-orders/{id}/receive ; commande masquée ensuite', async () => {
    const o = po.normalizePurchaseOrder(PO)
    const p = po.setReceived(po.loadProgress(o.id), '1', 4)
    po.saveProgress(o.id, p)
    mockApi.post.mockResolvedValueOnce({ success: true })
    const res = await po.receiveOrder(o, p)
    expect(res).toMatchObject({ queued: false, failed: [] })
    const [path, body] = mockApi.post.mock.calls[0]
    expect(path).toBe('/purchase-orders/42/receive')
    expect(body.lines).toEqual([
      { line_id: '1', product_id: '10', ordered_quantity: 5, received_quantity: 4 },
      { line_id: '2', product_id: '11', ordered_quantity: 2, received_quantity: 0 },
    ])
    expect(po.startedOrderIds().has('42')).toBe(false)
    // Le serveur renvoie encore la commande (file pas rejouée) : masquée
    mockApi.get.mockResolvedValueOnce({ data: [PO] })
    expect((await po.fetchSentOrders()).orders).toEqual([])
  })

  it('repli : une livraison par ligne reçue, écart dans les notes', async () => {
    const o = po.normalizePurchaseOrder(PO)
    let p = po.setReceived(po.loadProgress(o.id), '1', 4)
    p = po.setReceived(p, '2', 0)
    mockApi.post.mockRejectedValueOnce(notFound()).mockResolvedValue({ success: true })
    await po.receiveOrder(o, p)
    const deliveries = mockApi.post.mock.calls.slice(1)
    expect(deliveries).toHaveLength(1) // rien reçu sur le beurre : pas de mouvement
    expect(deliveries[0][0]).toBe('/inventory/deliveries')
    expect(deliveries[0][1]).toMatchObject({ product_id: '10', quantity: 4, unit_cost: 1.2 })
    expect(deliveries[0][1].movement_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(deliveries[0][1].notes).toBe('Réception commande PO-2026-042 — commandé 5, reçu 4 (écart -1)')
  })

  it('repli : échec partiel → seules les lignes échouées restent pointées', async () => {
    const o = po.normalizePurchaseOrder(PO)
    let p = po.setReceived(po.loadProgress(o.id), '1', 5)
    p = po.setReceived(p, '2', 2)
    mockApi.post
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(Object.assign(new Error('Produit introuvable'), { status: 404, data: { detail: 'Produit introuvable' } }))
    const res = await po.receiveOrder(o, p)
    expect(res.failed).toEqual([{ lineId: '2', name: 'Beurre', error: 'Produit introuvable' }])
    expect(po.loadProgress(o.id).received).toEqual({ 2: 2 })
  })

  it('hors-ligne : envoi en file, stock du cache ajusté jusqu’au retour du réseau', async () => {
    const o = po.freeReception()
    const p = { received: { x10: 3 }, extra: [{ id: 'x10', productId: '10', name: 'Farine' }] }
    mockApi.post.mockResolvedValue({ success: true, offline: true, queued: true })
    const res = await po.receiveOrder(o, p)
    expect(res.queued).toBe(true)
    // Réception libre : pas de route dédiée, directement les livraisons
    expect(mockApi.post.mock.calls.map(c => c[0])).toEqual(['/inventory/deliveries'])
    expect(mockApi.post.mock.calls[0][1].notes).toBe('Réception mobile (sans bon de commande)')
    expect(inv.localStockDeltas()).toEqual({ 10: 3 })

    const cached = { items: [{ id: '10', productId: '10', quantity: 2 }, { id: '11', productId: '11', quantity: 1 }], fromCache: true }
    expect(inv.applyLocalStock(cached).items.map(i => i.quantity)).toEqual([5, 1])
    // Stock frais : le serveur a reçu la file, on oublie l'écart local
    expect(inv.applyLocalStock({ ...cached, fromCache: false }).items[0].quantity).toBe(2)
    expect(inv.localStockDeltas()).toEqual({})
  })

  it('rien de pointé : refus, aucun envoi', async () => {
    const o = po.normalizePurchaseOrder(PO)
    await expect(po.receiveOrder(o, po.loadProgress(o.id))).rejects.toThrow('Pointez au moins une ligne.')
    expect(mockApi.post).not.toHaveBeenCalled()
  })
})

describe('page /stock/receive', () => {
  async function mountReceive() {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/stock/receive', component: ReceiveOrders }, { path: '/stock', component: Stub }] })
    router.push('/stock/receive')
    await router.isReady()
    const w = mount(ReceiveOrders, { global: { plugins: [router], stubs: { BarcodeScanner: true } } })
    await flushPromises()
    return w
  }

  it('liste des commandes, pointage au scan, validation', async () => {
    mockApi.get.mockImplementation(async (path) => {
      if (path.startsWith('/purchase-orders')) return { data: [PO] }
      if (path === '/inventory/items') return { data: [] }
      throw notFound()
    })
    mockApi.post.mockResolvedValue({ success: true })
    const w = await mountReceive()
    const card = w.find('.rcv-order')
    expect(card.text()).toContain('Metro')
    expect(card.text()).toContain('PO-2026-042 · 2 lignes')
    await card.trigger('click')
    expect(w.find('.rcv-title').text()).toBe('Metro')
    expect(w.findAll('.rcv-line')).toHaveLength(2)

    await w.vm.onScanned('3000000000027')
    await flushPromises()
    expect(w.find('.rcv-subtitle').text()).toBe('1 / 2 lignes pointées')
    expect(w.findAll('.rcv-line')[1].classes()).toContain('gap-ok')

    // Moins de farine que commandé : écart signalé
    await w.findAll('.rcv-qty')[0].setValue('3')
    await w.findAll('.rcv-qty')[0].trigger('change')
    expect(w.find('.rcv-gap-chip.short').text()).toBe('1 manquant')

    await w.find('.rcv-footer .primary').trigger('click')
    expect(w.find('.rcv-sheet-gaps').text()).toContain('3 / 5 (-2)')
    await w.find('.rcv-sheet-actions .primary').trigger('click')
    await flushPromises()
    expect(mockApi.post.mock.calls[0][0]).toBe('/purchase-orders/42/receive')
    expect(w.find('.rcv-toast').text()).toBe('Réception validée, stock mis à jour.')
    w.unmount()
  })

  it('route absente : bandeau et réception libre', async () => {
    mockApi.get.mockRejectedValue(notFound())
    const w = await mountReceive()
    expect(w.find('.rcv-banner').text()).toContain('réception libre')
    await w.find('.rcv-wide').trigger('click')
    expect(w.find('.rcv-title').text()).toBe('Réception sans bon de commande')
    expect(w.find('.rcv-state').text()).toContain('Scannez le premier produit livré.')
    w.unmount()
  })
})

// ═══ 2. App client : paiement, historique, appel serveur ════════════

describe('paiement client', () => {
  it('prestataires : configuration, inconnus ignorés', () => {
    expect(pay.paymentProviders(undefined).map(p => p.code)).toEqual(['stripe', 'lynx'])
    expect(pay.paymentProviders('lynx, paypal').map(p => p.code)).toEqual(['lynx'])
    expect(pay.paymentProviders('')).toEqual([])
  })

  it('page de paiement : requête, URL https seulement, replis', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: { url: 'https://checkout.stripe.com/c/abc' } }))
    const ctx = { ticketId: 't1', token: 'tok', table: 7, establishmentId: 'est-1', provider: 'stripe', amount: 41 }
    const res = await pay.startGuestPayment(ctx, { fetchImpl, returnUrl: 'https://x/back' })
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/abc' })
    const [url, opts] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/v1/public/tickets/t1/checkout?token=tok')
    expect(JSON.parse(opts.body)).toEqual({ provider: 'stripe', amount: 41, table_number: 7, return_url: 'https://x/back' })

    fetchImpl.mockResolvedValueOnce(jsonResponse({ url: 'javascript:alert(1)' }))
    expect(await pay.startGuestPayment(ctx, { fetchImpl })).toEqual({ ok: false, reason: 'error' })
    fetchImpl.mockResolvedValueOnce(jsonResponse({ detail: 'Not Found' }, 404))
    expect(await pay.startGuestPayment(ctx, { fetchImpl })).toEqual({ ok: false, reason: 'unavailable' })
    fetchImpl.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await pay.startGuestPayment(ctx, { fetchImpl })).toEqual({ ok: false, reason: 'offline' })
    expect(await pay.startGuestPayment({ ...ctx, ticketId: null }, { fetchImpl })).toEqual({ ok: false, reason: 'noTicket' })
  })

  it('retour du prestataire et QR « payer à table » lu par le scanner de l’équipe', () => {
    expect(pay.paymentReturnStatus({ query: { paid: '1' } })).toBe('paid')
    expect(pay.paymentReturnStatus({ query: { paid: '0' } })).toBe('cancelled')
    expect(pay.paymentReturnStatus({ query: {} })).toBe(null)
    const opts = { origin: 'https://app.tipsmana.fr' }
    expect(pay.paymentReturnUrl({ table: 7, establishmentId: 'e1' }, opts)).toBe('https://app.tipsmana.fr/mobile/guest/7?est=e1&paid=1')
    const qr = pay.tablePaymentQr({ table: 7, establishmentId: 'e1' }, opts)
    expect(qr).toBe('https://app.tipsmana.fr/mobile/guest/7?est=e1&pay=card')
    expect(svc.parseTableQr(qr)).toBe(7)
  })

  it('appel « payer par carte » : propre à l’app client', () => {
    expect(callMessage('pay').text).toBe('Paiement par carte à table')
    expect(WAITER_CALL_MESSAGES.some(m => m.code === 'pay')).toBe(false)
  })
})

describe('historique client', () => {
  const bill = (open, items = [{ name: 'Velouté', qty: 2, price: 8.5 }], total = 17) => ({
    tableNumber: 7, establishmentName: 'Chez Kris', ticket: { id: 't1', open, items, totalTtc: total },
  })
  const ctx = { table: 7, establishmentId: 'est-1' }

  it('visite enregistrée, mise à jour, payée à la clôture', () => {
    expect(gh.recordGuestVisit(bill(true, []), ctx)).toBe(null)
    gh.recordGuestVisit(bill(true), ctx, 1000)
    gh.recordGuestVisit(bill(true, [{ name: 'Velouté', qty: 3, price: 8.5 }], 25.5), ctx, 2000)
    let [v] = gh.readGuestHistory()
    expect(v).toMatchObject({ key: 'est-1:t1', total: 25.5, firstSeen: 1000, lastSeen: 2000, paid: false })
    gh.recordGuestVisit(bill(false, undefined, 25.5), ctx, 3000)
    ;[v] = gh.readGuestHistory()
    expect(v).toMatchObject({ paid: true, paidAt: 3000, paidVia: 'table' })
    expect(gh.historyTotals(gh.readGuestHistory())).toEqual({ paid: 25.5, due: 0, count: 1 })
  })

  it('paiement en ligne : visite marquée payée (même sans id de note)', () => {
    gh.recordGuestVisit(bill(true), ctx, 1000)
    const v = gh.markVisitPaid({ ticketId: null, ...ctx }, 'online', 5000)
    expect(v).toMatchObject({ paid: true, paidVia: 'online', paidAt: 5000 })
    expect(gh.readGuestHistory()[0].paid).toBe(true)
    // La note reste ouverte côté caisse : toujours payée
    gh.recordGuestVisit(bill(true), ctx, 6000)
    expect(gh.readGuestHistory()[0]).toMatchObject({ paid: true, paidVia: 'online' })
  })

  it(`${gh.HISTORY_MAX} visites au plus, plus récente en premier`, () => {
    for (let i = 0; i < gh.HISTORY_MAX + 3; i++) {
      gh.recordGuestVisit({ ...bill(false), ticket: { ...bill(false).ticket, id: `t${i}` } }, ctx, i)
    }
    const list = gh.readGuestHistory()
    expect(list).toHaveLength(gh.HISTORY_MAX)
    expect(list[0].ticketId).toBe(`t${gh.HISTORY_MAX + 2}`)
  })
})

describe('page /guest — appel, historique, paiement', () => {
  const OPEN_BILL = { data: { table_number: 7, establishment_name: 'Chez Kris', ticket: {
    id: 't1', status: 'open', total_ttc: 25,
    items: [{ id: 'a', item_name: 'Burger', quantity: 1, unit_price_ttc: 16, status: 'served' }, { id: 'b', item_name: 'Vin', quantity: 1, unit_price_ttc: 9 }],
  } } }
  let fetchSpy
  beforeEach(() => {
    mockApi.getToken.mockReturnValue(null)
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  async function mountGuest(path) {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/guest/:tableId(\\d+)?', component: GuestApp }] })
    router.push(path)
    await router.isReady()
    const w = mount(GuestApp, { global: { plugins: [router] }, attachTo: document.body })
    await flushPromises()
    return w
  }

  it('appeler le serveur depuis l’app : feuille, envoi, confirmation', async () => {
    fetchSpy.mockImplementation(async (url, opts) => (opts?.method === 'POST' ? jsonResponse({ success: true }) : jsonResponse(OPEN_BILL)))
    const w = await mountGuest('/guest/7?est=est-1')
    await w.find('.gu-call').trigger('click')
    const opts = w.findAll('.gu-call-opt')
    expect(opts.map(o => o.text())).toContain('🧾L\'addition, s\'il vous plaît')
    await opts[0].trigger('click')
    await flushPromises()
    const call = fetchSpy.mock.calls.find(c => c[1]?.method === 'POST')
    expect(call[0]).toBe('/api/v1/mobile/tables/7/call-waiter?message=Appel%20serveur')
    expect(w.find('.gu-sheet-feedback.ok').text()).toBe('Votre serveur est prévenu, il arrive !')
    expect(opts[0].classes()).toContain('sent')
    w.unmount()
  })

  it('onglet historique : addition en cours enregistrée, à régler', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(OPEN_BILL))
    const w = await mountGuest('/guest/7?est=est-1')
    await w.findAll('.gu-tab')[2].trigger('click')
    expect(w.find('.gu-tab.active').text()).toContain('Historique')
    expect(w.findAll('.gu-visit')).toHaveLength(1)
    expect(w.find('.gu-visit-title').text()).toBe('Chez Kris')
    expect(w.find('.gu-visit-badge').text()).toBe('À régler')
    expect(w.find('.gu-history-stat.due strong').text()).toMatch(/25,00\s€/)
    expect(w.findAll('.gu-visit-items li').map(li => li.text())).toEqual([expect.stringContaining('1× Burger'), expect.stringContaining('1× Vin')])
    w.unmount()
  })

  it('payer : paiement en ligne absent → paiement à table (appel + QR)', async () => {
    fetchSpy.mockImplementation(async (url, opts) => {
      if (url.includes('/checkout')) return jsonResponse({ detail: 'Not Found' }, 404)
      if (opts?.method === 'POST') return jsonResponse({ success: true })
      return jsonResponse(OPEN_BILL)
    })
    const w = await mountGuest('/guest/7?est=est-1')
    expect(w.find('.gu-pay').text()).toMatch(/Payer 25,00\s€/)
    await w.find('.gu-pay').trigger('click')
    const providers = w.findAll('.gu-provider')
    expect(providers.map(p => p.text())).toEqual(['💳 Payer avec Stripe', '📱 Payer avec Lynx', '🧾 Payer par carte à table'])
    await providers[0].trigger('click')
    await flushPromises()
    expect(w.find('.gu-sheet-feedback.ko').text()).toBe("Le paiement en ligne n'est pas disponible ici : payez à table.")
    // Plus de bouton de paiement en ligne
    expect(w.findAll('.gu-provider').map(p => p.text())).toEqual(['🧾 Payer par carte à table'])
    await w.find('.gu-provider').trigger('click')
    await flushPromises()
    const call = fetchSpy.mock.calls.find(c => c[0].includes('call-waiter'))
    expect(call[0]).toContain('message=Paiement%20par%20carte%20%C3%A0%20table')
    expect(w.find('.gu-pay-qr').attributes('src')).toMatch(/^data:image\/png;base64,/)
    w.unmount()
  })

  it('retour du paiement en ligne : bandeau, visite payée, plus de bouton « Payer »', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(OPEN_BILL))
    const w = await mountGuest('/guest/7?est=est-1&paid=1')
    expect(w.find('.gu-pay-return').text()).toBe('✅ Paiement reçu, merci !')
    expect(w.find('.gu-pay').exists()).toBe(false)
    expect(gh.readGuestHistory()[0]).toMatchObject({ paid: true, paidVia: 'online' })
    w.unmount()
  })
})

// ═══ 3. Tables en retard, QR table ══════════════════════════════════

describe('table en retard (> 15 min)', () => {
  const NOW = Date.parse('2026-11-10T12:00:00Z')
  const minAgo = (m) => new Date(NOW - m * 60000).toISOString()

  it('bon en attente / en préparation depuis plus de 15 min ; prêt : non', () => {
    expect(late.isOrderLate({ status: 'pending', created_at: minAgo(16) }, NOW)).toBe(true)
    expect(late.isOrderLate({ status: 'preparing', created_at: minAgo(15) }, NOW)).toBe(false)
    expect(late.isOrderLate({ status: 'ready', created_at: minAgo(40) }, NOW)).toBe(false)
    const orders = [
      { id: 1, status: 'pending', created_at: minAgo(20) },
      { id: 2, status: 'preparing', created_at: minAgo(3) },
      { id: 3, status: 'ready', created_at: minAgo(30) },
    ]
    expect(late.lateOrderIds(orders, NOW)).toEqual(['1'])
    expect(late.waitSummary(orders, NOW)).toEqual({ waiting: 2, late: 1, longest: 20 * 60000 })
  })

  it('une vibration par bon ; re-déclenchée s’il repasse en retard', () => {
    const vibrate = vi.fn()
    const alert = late.createLateAlert({ vibrate })
    expect(alert.check(['1'])).toEqual(['1'])
    expect(alert.check(['1'])).toEqual([])
    expect(alert.check(['1', '2'])).toEqual(['2'])
    expect(vibrate).toHaveBeenCalledTimes(2)
    alert.check([])
    expect(alert.check(['1'])).toEqual(['1'])
  })

  it('salle : table en retard d’après l’envoi en cuisine depuis ce téléphone', async () => {
    vi.useFakeTimers({ now: NOW - 20 * 60000, toFake: ['Date'] })
    mockApi.post.mockResolvedValue({ data: { orders: [{ ticket_ref: 'MOB-1' }] } })
    const ticket = { id: 'tk1', tableNumber: 4 }
    await svc.dispatchTicketItems({ establishmentId: 'est-1', ticket, items: [{ id: 'i1', name: 'Burger', qty: 1, course: 'plat' }] })
    expect(svc.getKitchenRecord('est-1', 'tk1')).toMatchObject({ status: 'en_cuisine', sentAt: NOW - 20 * 60000 })
    // Nouvel envoi alors que la cuisine n'a pas fini : l'attente court toujours depuis le premier
    vi.setSystemTime(NOW - 5 * 60000)
    await svc.dispatchTicketItems({ establishmentId: 'est-1', ticket, items: [{ id: 'i2', name: 'Frites', qty: 1, course: 'plat' }] })
    expect(svc.getKitchenRecord('est-1', 'tk1').sentAt).toBe(NOW - 20 * 60000)

    const tables = late.lateTables('est-1', NOW)
    expect([...tables.entries()]).toEqual([[4, NOW - 20 * 60000]])
    expect(late.lateMinutes(tables.get(4), NOW)).toBe(20)
    // Plats prêts : plus en retard
    svc.setKitchenStatus('est-1', 'tk1', 'pret')
    expect(late.lateTables('est-1', NOW).size).toBe(0)
  })

  it('KDS : carte rouge, compteur en direct, vibration une seule fois', async () => {
    vi.useFakeTimers({ now: NOW })
    mockApi.get.mockResolvedValue({ data: [
      { id: 'k1', status: 'pending', created_at: minAgo(14.99), items: [{ name: 'Burger', qty: 1, status: 'pending' }] },
      { id: 'k2', status: 'preparing', created_at: minAgo(3), items: [] },
    ] })
    const w = mount(KdsBoard, { global: { stubs: { RouterLink: true } } })
    await vi.advanceTimersByTimeAsync(0)
    expect(w.find('.kdsb-card.late').exists()).toBe(false)
    expect(w.find('.kdsb-wait').text()).toContain('14:59')
    await vi.advanceTimersByTimeAsync(2000)
    expect(w.find('[data-order-id="k1"]').classes()).toContain('late')
    expect(w.find('.kdsb-late-tag').text()).toBe('Retard')
    expect(w.find('.kdsb-wait-late').text()).toBe('🔴 1 en retard')
    expect(navigator.vibrate).toHaveBeenCalledWith(late.LATE_VIBRATION)
    await vi.advanceTimersByTimeAsync(5000)
    expect(navigator.vibrate.mock.calls.filter(c => c[0] === late.LATE_VIBRATION)).toHaveLength(1)
    w.unmount()
  })
})

describe('QR de la table lu par le scanner de l’équipe', () => {
  it('lien client (/guest, /mon-add) → numéro de table', () => {
    expect(svc.parseTableQr('https://app.tipsmana.fr/mobile/guest/12?est=e1')).toBe(12)
    expect(svc.parseTableQr('https://app.tipsmana.fr/mobile/mon-add/8')).toBe(8)
    expect(svc.parseTableQr('https://app.tipsmana.fr/mobile/guest/')).toBe(null)
    expect(svc.parseTableQr('https://app.tipsmana.fr/mobile/menu?table=3')).toBe(3)
  })
})
