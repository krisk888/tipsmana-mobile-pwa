/**
 * App client (guest mode) — page publique « /guest/{table}?est=… » ouverte par
 * le QR code posé sur la table : carte, addition en cours, statut des plats
 *
 * Endpoint (public, sans JWT) :
 *  - GET /tickets/{table}/guest?est={id}
 *      → { table_number, establishment_name?, show_prices?, ticket: null | {
 *            id, status, total_ttc, items: [{ id, item_name, quantity,
 *            unit_price_ttc, options?, course?, status? }] } }
 *    status d'un article : pending | preparing | ready | served (vocabulaire KDS)
 *    (pas encore dans le backend, vérifié 2026-11-10)
 *
 * Replis, dans l'ordre :
 *  1. lien signé de l'addition (?ticket=…&token=…, généré par la caisse via
 *     /table-tickets/{n}/bill-link) → GET /public/tickets/{id}/bill (existe),
 *     sans statut par article
 *  2. téléphone d'un membre de l'équipe connecté au même établissement → note
 *     de la table + statut cuisine des bons envoyés depuis ce téléphone
 *  3. dernière addition reçue sur ce téléphone (localStorage) → hors-ligne
 *
 * Le client n'est pas connecté : fetch direct, comme la carte et l'appel serveur.
 */
import api from './api'
import {
  kitchenLabel, normalizeRemoteStatus, round2, toNumber,
  fetchTableTicket, fetchKitchenItems, getKitchenRecord, currentEstablishmentId,
} from './serviceOrders'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'
const CACHE_KEY = 'tipsmana_guest_bill'
const LAST_KEY = 'tipsmana_guest_last'

export const GUEST_POLL_MS = 15000

export function guestPath(tableId) {
  return `/tickets/${encodeURIComponent(tableId)}/guest`
}

/** Lien du QR à poser sur la table. */
export function guestUrl({ table, establishmentId } = {}, { origin = window.location.origin, base = '/mobile/' } = {}) {
  const qs = establishmentId ? `?est=${encodeURIComponent(establishmentId)}` : ''
  return `${origin}${base.replace(/\/?$/, '/')}guest/${encodeURIComponent(table)}${qs}`
}

function first(v) {
  return String((Array.isArray(v) ? v[0] : v) ?? '').trim()
}

/**
 * Paramètres lus dans le lien. Sans table dans l'URL (app client installée,
 * ouverte sur /guest/) : dernière table consultée sur ce téléphone.
 */
export function guestParamsFromRoute(route) {
  const raw = first(route?.params?.tableId) || first(route?.query?.table)
  const table = /^\d+$/.test(raw) && Number(raw) > 0 && Number(raw) < 1000 ? Number(raw) : null
  const prices = first(route?.query?.prices ?? route?.query?.prix).toLowerCase()
  const params = {
    table,
    establishmentId: first(route?.query?.est) || null,
    ticketId: first(route?.query?.ticket) || null,
    token: first(route?.query?.token) || null,
    // ?prices=0 sur le QR : carte sans prix (sinon réglage renvoyé par l'API)
    hidePrices: ['0', 'false', 'non', 'no'].includes(prices),
  }
  if (params.table) return params
  const last = readLast()
  return last ? { ...params, table: last.table, establishmentId: params.establishmentId || last.establishmentId } : params
}

function readLast() {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null')
    return last?.table ? last : null
  } catch {
    return null
  }
}

export function rememberGuestTable(table, establishmentId) {
  if (!table) return
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ table, establishmentId: establishmentId || null })) } catch { /* mode privé */ }
}

/* ═══ Statut d'un article : en_cours | pret | servi (null : pas suivi, ex. boisson) ═══ */

const GUEST_STATUS = { en_cuisine: 'en_cours', pret: 'pret', servi: 'servi' }

export function normalizeGuestStatus(status) {
  const s = String(status || '').toLowerCase()
  if (['ordered', 'sent', 'new'].includes(s)) return 'en_cours'
  return GUEST_STATUS[normalizeRemoteStatus(s)] || null
}

export function normalizeGuestItem(raw, idx = 0) {
  if (!raw) return null
  return {
    id: String(raw.id ?? `g${idx}`),
    name: raw.item_name || raw.name || '—',
    qty: toNumber(raw.quantity ?? raw.qty, 1),
    price: round2(raw.unit_price_ttc ?? raw.price),
    options: raw.options || null,
    course: raw.course || null,
    status: normalizeGuestStatus(raw.status ?? raw.kitchen_status),
  }
}

function normalizeItems(list) {
  return (Array.isArray(list) ? list : []).map(normalizeGuestItem).filter(Boolean)
}

function total(items, raw) {
  return raw != null && Number.isFinite(Number(raw)) ? round2(raw) : round2(items.reduce((s, i) => s + i.qty * i.price, 0))
}

/** Réponse de GET /tickets/{table}/guest → { tableNumber, establishmentName, showPrices, ticket }. */
export function normalizeGuestBill(payload, table = null) {
  const data = payload?.data ?? payload ?? {}
  const rawTicket = data.ticket !== undefined ? data.ticket : (Array.isArray(data.items) ? data : null)
  let ticket = null
  if (rawTicket) {
    const items = normalizeItems(rawTicket.items)
    ticket = {
      id: rawTicket.id != null ? String(rawTicket.id) : null,
      open: !rawTicket.status || rawTicket.status === 'open',
      items,
      totalTtc: total(items, rawTicket.total_ttc ?? rawTicket.total),
    }
  }
  const show = data.show_prices ?? data.show_menu_prices ?? data.settings?.show_prices
  return {
    tableNumber: toNumber(data.table_number ?? rawTicket?.table_number, table) || table,
    establishmentName: typeof data.establishment_name === 'string' ? data.establishment_name : null,
    showPrices: show == null ? true : show !== false && show !== 'false' && show !== 0,
    ticket,
  }
}

/** Réponse de GET /public/tickets/{id}/bill → même forme (sans statut ni réglage). */
export function normalizePublicBill(payload, ticketId, table = null) {
  const data = payload?.data ?? payload ?? {}
  const items = normalizeItems(data.items)
  return {
    tableNumber: toNumber(data.table_number, table) || table,
    establishmentName: null,
    showPrices: true,
    ticket: { id: ticketId, open: !data.status || data.status === 'open', items, totalTtc: total(items, data.total) },
  }
}

/* ═══ Statut cuisine vu depuis un téléphone de l'équipe ═══ */

/**
 * Statut de chaque article d'une note d'après les plats des bons KDS (nom
 * envoyé = kitchenLabel). Article jamais envoyé depuis ce téléphone : null.
 */
export function itemStatusesFromKitchen(items, kitchenItems, sentItemIds = []) {
  const pool = (kitchenItems || []).map(k => ({ name: String(k.name ?? k.product_name ?? ''), status: k.status }))
  const sent = new Set(sentItemIds)
  return items.map(i => {
    if (!sent.has(i.id) || i.isKitchen === false) return { ...i, status: null }
    const idx = pool.findIndex(k => k.name === kitchenLabel(i))
    const status = idx === -1 ? 'en_cours' : normalizeGuestStatus(pool.splice(idx, 1)[0].status) || 'en_cours'
    return { ...i, status }
  })
}

async function staffBill(table, establishmentId) {
  if (!api.getToken?.()) return null
  if (establishmentId && String(api.getEstablishmentId?.() || '') !== String(establishmentId)) return null
  const ticket = await fetchTableTicket(table)
  if (!ticket) return { tableNumber: table, establishmentName: null, showPrices: true, ticket: null }
  const rec = getKitchenRecord(currentEstablishmentId(), ticket.id)
  const { items: kitchenItems } = await fetchKitchenItems(rec.refs)
  const items = itemStatusesFromKitchen(ticket.items, kitchenItems, rec.sentItemIds)
  return {
    tableNumber: table,
    establishmentName: null,
    showPrices: true,
    ticket: {
      id: ticket.id,
      open: true,
      items: items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, options: i.options, course: i.course, status: i.status })),
      totalTtc: ticket.totalTtc,
    },
  }
}

/* ═══ Cache de la dernière addition reçue ═══ */

function cacheKey(table, establishmentId) {
  return `${establishmentId || '-'}:${table}`
}

export function readCachedBill(table, establishmentId) {
  try {
    return (JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {})[cacheKey(table, establishmentId)] || null
  } catch {
    return null
  }
}

function writeCachedBill(table, establishmentId, bill, at) {
  try {
    // Une seule addition gardée : celle de la table du client
    localStorage.setItem(CACHE_KEY, JSON.stringify({ [cacheKey(table, establishmentId)]: { ...bill, at } }))
  } catch { /* quota / mode privé */ }
}

/**
 * Charge l'addition de la table. Renvoie { ok: true, bill, source: 'guest' |
 * 'bill' | 'staff' | 'cache', at? } ou { ok: false, reason } avec
 * reason ∈ offline | unavailable | error | noTable.
 */
export async function fetchGuestBill({ table, establishmentId, ticketId, token } = {}, {
  now = Date.now(),
  fetchImpl = globalThis.fetch,
  staffLoader = staffBill,
} = {}) {
  if (!table) return { ok: false, reason: 'noTable' }
  const done = (bill, source) => {
    writeCachedBill(table, establishmentId, bill, now)
    return { ok: true, bill, source }
  }
  const fromCache = (reason) => {
    const cached = readCachedBill(table, establishmentId)
    return cached ? { ok: true, bill: cached, source: 'cache', at: cached.at } : { ok: false, reason }
  }
  const get = async (path) => {
    try {
      return await fetchImpl(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } })
    } catch {
      return null
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return fromCache('offline')

  const qs = establishmentId ? `?est=${encodeURIComponent(establishmentId)}` : ''
  const res = await get(`${guestPath(table)}${qs}`)
  if (!res) return fromCache('offline')
  if (res.ok) {
    try {
      return done(normalizeGuestBill(await res.json(), table), 'guest')
    } catch { /* réponse illisible : replis */ }
  }
  const reason = [404, 405, 501].includes(res.status) ? 'unavailable' : 'error'

  if (ticketId && token) {
    const bill = await get(`/public/tickets/${encodeURIComponent(ticketId)}/bill?token=${encodeURIComponent(token)}`)
    if (bill?.ok) {
      try {
        return done(normalizePublicBill(await bill.json(), ticketId, table), 'bill')
      } catch { /* replis suivants */ }
    }
  }

  try {
    const bill = await staffLoader(table, establishmentId)
    if (bill) return done(bill, 'staff')
  } catch { /* pas connecté / réseau */ }

  return fromCache(reason)
}

/* ═══ Récap ═══ */

/** Nombre d'articles par statut (pour l'en-tête de l'addition). */
export function statusCounts(items) {
  const out = { en_cours: 0, pret: 0, servi: 0 }
  for (const i of items || []) if (out[i.status] != null) out[i.status] += i.qty
  return out
}

/* ═══ App installable « Tipsmana Client » ═══ */

export const GUEST_MANIFEST = '/mobile/guest.webmanifest'

function headTag(doc, selector, create) {
  let el = doc.head.querySelector(selector)
  let created = false
  if (!el) {
    el = create()
    doc.head.appendChild(el)
    created = true
  }
  return { el, created }
}

/**
 * Pages client : manifeste, icône et titre de l'app client, pour que « Ajouter
 * à l'écran d'accueil » installe « Tipsmana Client » (id et start_url
 * /mobile/guest/) et non l'app de l'équipe. Portée /mobile/ : l'appel serveur
 * (/mon-add) reste dans l'app. Renvoie la fonction qui rétablit l'en-tête.
 */
export function applyGuestManifest(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc?.head) return () => {}
  const restores = []
  const set = (selector, create, attr, value) => {
    const { el, created } = headTag(doc, selector, create)
    const before = el.getAttribute(attr)
    el.setAttribute(attr, value)
    restores.push(() => (created ? el.remove() : el.setAttribute(attr, before)))
  }
  const link = (rel) => () => Object.assign(doc.createElement('link'), { rel })
  const meta = (name) => () => Object.assign(doc.createElement('meta'), { name })
  set('link[rel="manifest"]', link('manifest'), 'href', GUEST_MANIFEST)
  set('link[rel="apple-touch-icon"]', link('apple-touch-icon'), 'href', '/mobile/icons/guest-192.png')
  set('meta[name="apple-mobile-web-app-title"]', meta('apple-mobile-web-app-title'), 'content', 'Tipsmana Client')
  set('meta[name="application-name"]', meta('application-name'), 'content', 'Tipsmana Client')
  return () => restores.reverse().forEach(fn => fn())
}
