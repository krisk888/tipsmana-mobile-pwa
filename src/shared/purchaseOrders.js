/**
 * Réception des commandes fournisseurs depuis le mobile (/stock/receive)
 *
 * Endpoints demandés (absents du backend, vérifié 2026-11-10 : il n'existe
 * aucun modèle de commande fournisseur ; les widgets « purchase orders » du
 * dashboard lisent les factures) :
 *  - GET  /purchase-orders?status=sent
 *      → [{ id, reference, supplier_name, expected_date, lines: [{ id,
 *           product_id, product_name, barcode, quantity, unit, unit_price }] }]
 *  - POST /purchase-orders/{id}/receive
 *      { received_at, lines: [{ line_id, product_id, ordered_quantity, received_quantity }] }
 *
 * Replis sur l'existant :
 *  - liste absente → réception libre (sans bon de commande) : on scanne les
 *    produits livrés et on saisit les quantités
 *  - validation → POST /inventory/deliveries par ligne reçue (mouvement
 *    « purchase », quantité > 0), écart noté dans `notes`
 *
 * Le pointage en cours est gardé sur le téléphone (une réception interrompue
 * reprend où elle en était). Hors-ligne, api.js met les envois en file et le
 * stock affiché est ajusté localement (recordLocalStock) jusqu'au rejeu.
 */
import api from './api'
import { t } from '../i18n'
import { normalizeBarcode } from './barcode'
import { roundQty, recordLocalStock, today } from './inventory'
import { isStockFrozen } from './inventoryCount'

const PROGRESS_KEY = 'tipsmana_po_receive'
const DONE_TTL = 7 * 24 * 3600 * 1000

// Bon de commande « fictif » de la réception libre
export const FREE_RECEPTION_ID = '__free'

let listEndpointMissing = false
let receiveEndpointMissing = false

export function resetPurchaseOrderState() {
  listEndpointMissing = false
  receiveEndpointMissing = false
}

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function isMissingRoute(e) {
  return e?.status === 404 || e?.status === 405 || e?.status === 501
}

/* ═══ Normalisation ═══ */

export function normalizePoLine(raw, idx = 0) {
  if (!raw) return null
  const productId = raw.product_id ?? raw.product?.id
  return {
    id: String(raw.id ?? raw.line_id ?? `l${idx}`),
    productId: productId != null ? String(productId) : null,
    name: raw.product_name || raw.name || raw.product?.name || t('stock.productFallback'),
    barcode: raw.barcode || raw.product_barcode || raw.product?.barcode || null,
    ordered: roundQty(num(raw.quantity ?? raw.ordered_quantity ?? raw.qty)),
    unit: raw.unit || raw.unit_name || raw.unit_abbreviation || null,
    unitCost: raw.unit_price != null || raw.unit_cost != null ? num(raw.unit_price ?? raw.unit_cost) : null,
  }
}

export function normalizePurchaseOrder(raw) {
  if (!raw || raw.id == null) return null
  return {
    id: String(raw.id),
    reference: raw.reference || raw.order_number || raw.number || `#${raw.id}`,
    supplier: raw.supplier_name || raw.supplier?.name || null,
    expectedDate: raw.expected_date || raw.delivery_date || null,
    status: String(raw.status || 'sent').toLowerCase(),
    lines: (Array.isArray(raw.lines) ? raw.lines : Array.isArray(raw.items) ? raw.items : [])
      .map(normalizePoLine).filter(Boolean),
    local: false,
  }
}

export function freeReception() {
  return { id: FREE_RECEPTION_ID, reference: null, supplier: null, expectedDate: null, status: 'sent', lines: [], local: true }
}

function listFrom(res) {
  const data = res?.data ?? res
  if (Array.isArray(data)) return data
  return data?.items || data?.orders || data?.purchase_orders || []
}

/**
 * Commandes envoyées au fournisseur, en attente de réception.
 * Renvoie { orders, available } (available=false : route absente → réception libre).
 */
export async function fetchSentOrders() {
  if (listEndpointMissing) return { orders: [], available: false }
  try {
    const res = await api.get('/purchase-orders?status=sent')
    const done = doneIds()
    const orders = listFrom(res)
      .map(normalizePurchaseOrder)
      .filter(o => o && o.status === 'sent' && !done.has(o.id))
    return { orders, available: true, fromCache: !!res?.fromCache }
  } catch (e) {
    if (!isMissingRoute(e)) throw e
    listEndpointMissing = true
    return { orders: [], available: false }
  }
}

/* ═══ Pointage (gardé sur le téléphone) ═══ */

function estKey() {
  return String(api.getEstablishmentId?.() || 'default')
}

function readAll() {
  try {
    const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}')
    return all && typeof all === 'object' ? all : {}
  } catch {
    return {}
  }
}

function writeAll(all) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(all)) } catch { /* mode privé */ }
}

function byEst(all) {
  return all[estKey()] || { progress: {}, done: {} }
}

/** { received: { lineId: qty }, extra: [ligne hors commande] } */
export function loadProgress(orderId) {
  const p = byEst(readAll()).progress?.[orderId]
  return { received: { ...(p?.received || {}) }, extra: Array.isArray(p?.extra) ? p.extra : [] }
}

export function saveProgress(orderId, progress) {
  const all = readAll()
  const est = byEst(all)
  est.progress = est.progress || {}
  if (!Object.keys(progress.received || {}).length && !(progress.extra || []).length) delete est.progress[orderId]
  else est.progress[orderId] = { received: progress.received, extra: progress.extra || [], at: Date.now() }
  all[estKey()] = est
  writeAll(all)
}

function markDone(orderId, now = Date.now()) {
  const all = readAll()
  const est = byEst(all)
  delete est.progress?.[orderId]
  est.done = est.done || {}
  // Commande validée : masquée tant que le serveur la renvoie encore « sent » (envoi en file)
  if (orderId !== FREE_RECEPTION_ID) est.done[orderId] = now
  for (const [id, at] of Object.entries(est.done)) if (now - at > DONE_TTL) delete est.done[id]
  all[estKey()] = est
  writeAll(all)
}

function doneIds() {
  return new Set(Object.keys(byEst(readAll()).done || {}))
}

/** Commandes dont le pointage est commencé (badge « en cours » de la liste). */
export function startedOrderIds() {
  return new Set(Object.keys(byEst(readAll()).progress || {}))
}

/* ═══ Lignes, écarts ═══ */

/** Toutes les lignes à afficher : celles de la commande puis les produits hors commande. */
export function receiptLines(order, progress) {
  const lines = [...order.lines, ...(progress.extra || []).map(l => ({ ...l, ordered: 0, extra: true }))]
  return lines.map(l => {
    const pointed = Object.prototype.hasOwnProperty.call(progress.received, l.id)
    const received = pointed ? roundQty(progress.received[l.id]) : null
    return { ...l, pointed, received, gap: pointed ? roundQty(received - l.ordered) : null }
  })
}

/** 'ok' (conforme) | 'short' (manque) | 'over' (en trop) | 'pending' (pas pointée) */
export function gapStatus(line) {
  if (!line.pointed) return 'pending'
  if (line.gap < 0) return 'short'
  if (line.gap > 0) return 'over'
  return 'ok'
}

export function receiptSummary(order, progress) {
  const lines = receiptLines(order, progress)
  const out = { total: lines.length, pointed: 0, ok: 0, short: 0, over: 0, pending: 0 }
  for (const l of lines) {
    const s = gapStatus(l)
    out[s]++
    if (s !== 'pending') out.pointed++
  }
  return out
}

/** Ligne pointée avec la quantité reçue (bornée à ≥ 0). */
export function setReceived(progress, lineId, qty) {
  const received = { ...progress.received, [lineId]: Math.max(0, roundQty(qty)) }
  return { ...progress, received }
}

export function clearReceived(progress, lineId) {
  const received = { ...progress.received }
  delete received[lineId]
  return { ...progress, received }
}

/**
 * Code scanné → ligne de la commande. Ordre : code-barres de la ligne, puis
 * produit résolu par `lookup` (GET /inventory/barcode/lookup). Produit hors
 * commande : ajouté en ligne « extra ». Renvoie { progress, lineId, status }
 * avec status ∈ matched | extra | unknown | offline.
 */
export async function scanIntoReceipt(order, progress, rawCode, lookup) {
  const code = normalizeBarcode(rawCode)
  const all = receiptLines(order, progress)
  let line = all.find(l => l.barcode && normalizeBarcode(l.barcode) === code)
  let status = 'matched'
  if (!line) {
    const res = await lookup(code)
    if (res.status !== 'found') return { progress, lineId: null, status: res.status }
    const productId = String(res.item.productId ?? res.item.id)
    line = all.find(l => l.productId === productId)
    if (!line) {
      line = {
        id: `x${productId}`,
        productId,
        name: res.item.name,
        barcode: res.item.barcode || code,
        unit: res.item.unit || null,
        unitCost: res.item.unitCost ?? null,
      }
      progress = { ...progress, extra: [...(progress.extra || []), line] }
      status = 'extra'
    }
  }
  // Premier scan : ligne pointée conforme (quantité commandée, 1 pour un extra) ;
  // scans suivants : +1 (comptage à l'unité)
  const current = progress.received[line.id]
  const next = current == null ? (line.ordered || 1) : roundQty(current + 1)
  return { progress: setReceived(progress, line.id, next), lineId: line.id, status }
}

/* ═══ Validation ═══ */

function deliveryNote(order, line) {
  const ref = order.local ? t('stock.receive.freeNote') : t('stock.receive.note', { ref: order.reference })
  if (line.extra || !line.gap) return ref
  return `${ref} — ${t('stock.receive.noteGap', { ordered: line.ordered, received: line.received, gap: line.gap > 0 ? `+${line.gap}` : line.gap })}`
}

async function postDeliveries(order, lines) {
  let queued = false
  const failed = []
  for (const line of lines) {
    if (!line.received || !line.productId) continue
    try {
      const res = await api.post('/inventory/deliveries', {
        product_id: line.productId,
        quantity: line.received,
        unit_cost: line.unitCost ?? undefined,
        movement_date: today(),
        notes: deliveryNote(order, line),
      })
      if (res?.queued) {
        queued = true
        recordLocalStock(line.productId, line.received)
      }
    } catch (e) {
      failed.push({ lineId: line.id, name: line.name, error: e.data?.detail || e.message })
    }
  }
  return { queued, failed }
}

/**
 * Valide la réception. Lignes non pointées = rien reçu. Renvoie
 * { queued, failed: [{ lineId, name, error }], summary }. En cas d'échec
 * partiel (repli ligne par ligne), seules les lignes échouées restent pointées.
 */
export async function receiveOrder(order, progress) {
  if (isStockFrozen()) throw Object.assign(new Error(t('stock.count.frozenError')), { frozen: true })
  const lines = receiptLines(order, progress)
  const summary = receiptSummary(order, progress)
  if (!lines.some(l => l.pointed)) throw new Error(t('stock.receive.errors.nothingPointed'))

  if (!order.local && !receiveEndpointMissing) {
    try {
      const res = await api.post(`/purchase-orders/${encodeURIComponent(order.id)}/receive`, {
        received_at: new Date().toISOString(),
        lines: lines.map(l => ({
          line_id: l.extra ? null : l.id,
          product_id: l.productId,
          ordered_quantity: l.ordered,
          received_quantity: l.received ?? 0,
        })),
      })
      if (res?.queued) lines.forEach(l => l.received && recordLocalStock(l.productId, l.received))
      markDone(order.id)
      return { queued: !!res?.queued, failed: [], summary }
    } catch (e) {
      if (!isMissingRoute(e)) throw e
      receiveEndpointMissing = true
    }
  }

  const { queued, failed } = await postDeliveries(order, lines)
  if (failed.length) {
    const keep = new Set(failed.map(f => f.lineId))
    const received = Object.fromEntries(Object.entries(progress.received).filter(([id]) => keep.has(id)))
    saveProgress(order.id, { received, extra: (progress.extra || []).filter(l => keep.has(l.id)) })
  } else {
    markDone(order.id)
  }
  return { queued, failed, summary }
}
