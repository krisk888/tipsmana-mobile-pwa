/**
 * KDS mobile (tableau cuisine) — logique pure + appels API
 *
 * Endpoints :
 *  - GET   /cash/kds/cuisine                     → bons du poste cuisine
 *  - PATCH /kds/orders/{id}/status { status }    → changement de statut (contrat
 *    demandé au mobile, PAS ENCORE dans le backend au 2026-11-08)
 *  - POST  /cash/kds/cuisine/orders/{id}/validate → repli : le backend n'avance
 *    que d'un cran (pending → preparing → ready → served), sans retour arrière
 */
import api from './api'

export const KDS_COLUMNS = ['pending', 'preparing', 'ready']

const RANK = { pending: 0, printing: 0, printed: 0, preparing: 1, ready: 2, served: 3 }

// Seuils du minuteur (minutes) : vert < 10, orange 10–15, rouge > 15
export const AGE_WARN = 10
export const AGE_LATE = 15

/** Colonne d'un bon (null : servi / inconnu → hors tableau). */
export function columnOf(status) {
  if (status === 'pending' || status === 'printing' || status === 'printed') return 'pending'
  if (status === 'preparing' || status === 'ready') return status
  return null
}

function createdTs(o) {
  const ts = new Date(o?.created_at).getTime()
  return Number.isNaN(ts) ? Infinity : ts
}

/** Bons répartis par colonne, plus ancien en premier. */
export function groupByColumn(orders) {
  const cols = Object.fromEntries(KDS_COLUMNS.map(c => [c, []]))
  for (const o of orders || []) {
    const col = columnOf(o.status)
    if (col) cols[col].push(o)
  }
  for (const c of KDS_COLUMNS) cols[c].sort((a, b) => createdTs(a) - createdTs(b))
  return cols
}

export function elapsedMs(createdAt, now = Date.now()) {
  const ts = new Date(createdAt).getTime()
  if (Number.isNaN(ts)) return 0
  return Math.max(0, now - ts)
}

/** « 7:05 » ou « 1:02:05 » */
export function formatElapsed(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** 'ok' (< 10 min) | 'warn' (10–15 min) | 'late' (> 15 min) */
export function ageLevel(ms) {
  const minutes = ms / 60000
  if (minutes > AGE_LATE) return 'late'
  if (minutes >= AGE_WARN) return 'warn'
  return 'ok'
}

/** Bons non servis absents de knownIds (premier chargement : aucun « nouveau »). */
export function findNewOrders(knownIds, orders) {
  if (!knownIds.size) return []
  return (orders || []).filter(o => columnOf(o.status) && !knownIds.has(o.id))
}

export function unwrapList(res) {
  const data = res?.data?.data || res?.data || res || {}
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  return []
}

export async function fetchKdsOrders() {
  return unwrapList(await api.get('/cash/kds/cuisine?include_served=false'))
}

// PATCH absent du backend : mémorisé pour ne pas refaire un 404 à chaque glisser
let patchMissing = false
export function resetKdsEndpointCache() { patchMissing = false }

function isMissingRoute(err) {
  return err?.status === 404 || err?.status === 405
}

/**
 * Change le statut d'un bon. PATCH /kds/orders/{id}/status, sinon repli sur
 * validate (autant d'appels que de crans à avancer). Le repli ne sait pas
 * reculer : l'erreur porte code = 'backward_unsupported'.
 */
export async function changeOrderStatus(order, toStatus) {
  if (!patchMissing) {
    try {
      return await api.patch(`/kds/orders/${encodeURIComponent(order.id)}/status`, { status: toStatus })
    } catch (err) {
      if (!isMissingRoute(err)) throw err
      patchMissing = true
    }
  }
  const steps = RANK[toStatus] - RANK[order.status]
  if (!(steps > 0)) {
    const err = new Error('backward_unsupported')
    err.code = 'backward_unsupported'
    throw err
  }
  let res = null
  for (let i = 0; i < steps; i++) {
    res = await api.post(`/cash/kds/cuisine/orders/${encodeURIComponent(order.id)}/validate`, { item_index: null })
  }
  return res
}

/** Statut des plats aligné sur celui du bon (mise à jour optimiste). */
export function withStatus(order, status) {
  const rank = RANK[status]
  return {
    ...order,
    status,
    items: (order.items || []).map(i => (
      rank > RANK[i.status] || (rank < RANK[i.status] && i.status !== 'served') ? { ...i, status } : i
    )),
  }
}

/* ═══ Son « nouvelle commande » (Web Audio, aucun fichier) ═══ */

let audioCtx = null
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) audioCtx = new Ctx()
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {})
  } catch { /* audio indisponible */ }
  return audioCtx
}

export function playNewOrderSound() {
  const ctx = unlockAudio()
  if (!ctx) return
  try {
    const t0 = ctx.currentTime
    for (const [freq, at] of [[880, 0], [1174.66, 0.16]]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(freq, t0 + at)
      gain.gain.setValueAtTime(0.3, t0 + at)
      gain.gain.exponentialRampToValueAtTime(0.01, t0 + at + 0.35)
      osc.start(t0 + at)
      osc.stop(t0 + at + 0.35)
    }
  } catch { /* silencieux */ }
}
