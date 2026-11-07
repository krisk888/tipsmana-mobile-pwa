/**
 * Service en salle — prise de commande serveur (tables, menu, notes, cuisine)
 *
 * Endpoints backend utilisés (établissement = JWT + X-Establishment-ID posés par api.js) :
 *  - GET  /floorplan/spaces                 → tables + état live (libre / occupée / addition)
 *  - POST /floorplan/tables/{n}/open        → ouverture de table (couverts)
 *  - GET  /products/pos-menu                → catégories + articles
 *  - GET  /table-tickets/list               → notes ouvertes (articles, totaux HT/TTC)
 *  - GET  /table-tickets/{n}                → note ouverte d'une table (404 si aucune)
 *  - POST /table-tickets/{n}/items          → ajout d'articles (crée la note si besoin)
 *  - POST /cash/dispatch                    → envoi en cuisine (KDS), renvoie une réf MOB-XXXX
 *  - GET  /cash/tickets/{ref}/kitchen-status?ticket_ref=… → statut KDS des plats envoyés
 *
 * Le backend ne relie pas les bons cuisine (MOB-XXXX) aux notes de table : les
 * réfs envoyées depuis ce téléphone sont mémorisées localement, par établissement.
 */

import api from './api'

export const DEFAULT_VAT_RATE = 10

export const COURSES = [
  { key: 'entree',  label: 'Entrée',  order: 0, icon: '🥗', color: '#34d399' },
  { key: 'plat',    label: 'Plat',    order: 1, icon: '🍽', color: '#fbbf24' },
  { key: 'dessert', label: 'Dessert', order: 2, icon: '🍰', color: '#f472b6' },
  { key: 'boisson', label: 'Boisson', order: 3, icon: '🥤', color: '#38bdf8' },
  { key: 'autre',   label: 'Autre',   order: 4, icon: '✨', color: '#a78bfa' },
]

export const OPTION_GROUPS = {
  cuisson:   { key: 'cuisson',   label: 'Cuisson',   options: ['Bleu', 'Saignant', 'À point', 'Bien cuit'] },
  garniture: { key: 'garniture', label: 'Garniture', options: ['Frites', 'Riz', 'Légumes', 'Salade'] },
}

// Options proposées par service (les articles du pos-menu ne portent pas d'options)
export const COURSE_OPTIONS = {
  plat: ['cuisson', 'garniture'],
}

export const ORDER_STATUSES = {
  en_cours:   { label: 'En cours',   icon: '📝' },
  en_cuisine: { label: 'En cuisine', icon: '🔥' },
  servi:      { label: 'Servi',      icon: '✅' },
  solde:      { label: 'Soldé',      icon: '💶' },
}

const DRINK_RE = /(^|[^a-zà-ÿ])(boissons?|bi[eè]res?|vins?|softs?|eaux?|cocktails?|caf[eé]s?|th[eé]s?|champagnes?|ap[eé]ritifs?|digestifs?|jus)(?![a-zà-ÿ])/i

const KITCHEN_KEY = 'tipsmana_service_kitchen'
const HISTORY_KEY = 'tipsmana_service_history'
const STATS_KEY = 'tipsmana_service_stats'
const DRAFT_PREFIX = 'tipsmana_service_draft'
const HISTORY_TTL = 18 * 3600 * 1000 // un service : les notes soldées disparaissent le lendemain
const WATCH_TTL = 6 * 3600 * 1000 // suivi des statuts cuisine : 6 h après le dernier envoi

/* ═══ Utils ═══ */

export function toNumber(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function round2(v) {
  return Math.round(toNumber(v) * 100) / 100
}

export function formatEur(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0)
}

// Réponses api.js : { success, data, message } (ou cache hors-ligne avec la même forme)
export function unwrap(res) {
  return res && typeof res === 'object' && 'data' in res ? res.data : res
}

export function courseMeta(key) {
  return COURSES.find(c => c.key === key) || COURSES.find(c => c.key === 'autre')
}

export function resolveCourse(category) {
  const known = COURSES.some(c => c.key === category?.course) ? category.course : 'autre'
  if (known !== 'autre') return known
  return DRINK_RE.test(category?.name || '') ? 'boisson' : 'autre'
}

/* ═══ Établissement ═══ */

// Établissement actif = celui du jeton courant (écrit par le switcher via authStore)
export function currentEstablishmentId() {
  const id = api.getEstablishmentId()
  return id == null ? null : String(id)
}

/* ═══ Stockage local (par établissement) ═══ */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* mode privé / quota : non bloquant */ }
}

function draftKey(estId, tableNumber) {
  return `${DRAFT_PREFIX}:${estId || 'default'}:${tableNumber}`
}

export function loadDraft(estId, tableNumber) {
  const draft = readJson(draftKey(estId, tableNumber), [])
  return Array.isArray(draft) ? draft : []
}

export function saveDraft(estId, tableNumber, cart) {
  if (!cart.length) {
    try { localStorage.removeItem(draftKey(estId, tableNumber)) } catch { /* ignore */ }
    return
  }
  writeJson(draftKey(estId, tableNumber), cart)
}

export function getKitchenRecord(estId, ticketId) {
  const all = readJson(KITCHEN_KEY, {})
  const rec = all?.[estId || 'default']?.[ticketId]
  return {
    refs: rec?.refs || [],
    sentItemIds: rec?.sentItemIds || [],
    failedItemIds: rec?.failedItemIds || [],
    tableNumber: rec?.tableNumber ?? null,
    status: rec?.status || null,
  }
}

function updateKitchenRecord(estId, ticketId, updater) {
  const all = readJson(KITCHEN_KEY, {})
  const est = estId || 'default'
  const byEst = all[est] || {}
  byEst[ticketId] = { ...updater(getKitchenRecord(estId, ticketId)), at: Date.now() }
  // Purge des notes anciennes
  for (const [id, rec] of Object.entries(byEst)) {
    if (Date.now() - (rec.at || 0) > HISTORY_TTL) delete byEst[id]
  }
  all[est] = byEst
  writeJson(KITCHEN_KEY, all)
}

/* ═══ Normalisation ═══ */

export function normalizeCategory(cat) {
  const course = resolveCourse(cat)
  const meta = courseMeta(course)
  return {
    id: String(cat.id),
    name: cat.name || 'Catégorie',
    course,
    icon: meta.icon,
    color: meta.color,
    items: (Array.isArray(cat.items) ? cat.items : []).map(p => ({
      id: String(p.id),
      name: p.name || p.label || 'Article',
      price: round2(p.price_ttc ?? p.price),
      vatRate: toNumber(p.vat_rate, DEFAULT_VAT_RATE),
      isKitchen: p.is_kitchen !== false,
      course,
    })),
  }
}

export function normalizeTicket(t) {
  if (!t || !t.id) return null
  const items = (Array.isArray(t.items) ? t.items : []).map(i => ({
    id: String(i.id),
    name: i.item_name || i.name || 'Article',
    qty: toNumber(i.quantity, 1),
    price: round2(i.unit_price_ttc),
    priceHt: round2(i.unit_price_ht),
    vatRate: toNumber(i.vat_rate, DEFAULT_VAT_RATE),
    options: i.options || null,
    note: i.notes || null,
    course: i.course || 'plat',
    isKitchen: i.is_kitchen !== false,
    sortOrder: toNumber(i.sort_order),
  }))
  items.sort((a, b) => a.sortOrder - b.sortOrder)
  return {
    id: String(t.id),
    tableNumber: toNumber(t.table_number),
    status: t.status || 'open',
    totalTtc: round2(t.total_ttc),
    totalHt: round2(t.total_ht),
    covers: toNumber(t.covers, 1),
    serveur: t.serveur_name || '',
    openedAt: t.opened_at || t.created_at || null,
    items,
  }
}

export function normalizeTableState(state) {
  const s = String(state || 'libre').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (s === 'occupee' || s === 'addition' || s === 'reservee') return s
  return 'libre'
}

export const TABLE_STATES = {
  libre:    { label: 'Libre' },
  occupee:  { label: 'Occupée' },
  addition: { label: 'Addition' },
  reservee: { label: 'Réservée' },
}

/**
 * Fusionne le plan de salle et les notes ouvertes : une table avec une note
 * ouverte est occupée même si le plan la dit libre.
 */
export function mergeTables(spaces, tickets) {
  const ticketByTable = new Map(tickets.map(t => [t.tableNumber, t]))
  const seen = new Set()
  const out = spaces.map(s => ({
    id: String(s.id ?? s.number ?? s.name),
    name: s.name || 'Salle',
    icon: s.icon || '🪑',
    tables: (Array.isArray(s.tables) ? s.tables : []).map(t => {
      const number = toNumber(t.number)
      seen.add(number)
      const ticket = ticketByTable.get(number) || null
      let state = normalizeTableState(t.state)
      if (ticket && (state === 'libre' || state === 'reservee')) state = 'occupee'
      return {
        number,
        state,
        covers: ticket?.covers || toNumber(t.covers, 1),
        serveur: ticket?.serveur || (t.serveur && t.serveur !== '—' ? t.serveur : ''),
        total: ticket?.totalTtc || 0,
        itemCount: ticket ? ticket.items.reduce((s, i) => s + i.qty, 0) : 0,
        ticketId: ticket?.id || null,
      }
    }).sort((a, b) => a.number - b.number),
  }))
  // Notes ouvertes sur des tables absentes du plan (saisie au pavé numérique)
  const orphans = tickets.filter(t => !seen.has(t.tableNumber))
  if (orphans.length) {
    out.push({
      id: '__autres',
      name: 'Autres',
      icon: '🔢',
      tables: orphans.map(t => ({
        number: t.tableNumber,
        state: 'occupee',
        covers: t.covers,
        serveur: t.serveur,
        total: t.totalTtc,
        itemCount: t.items.reduce((s, i) => s + i.qty, 0),
        ticketId: t.id,
      })).sort((a, b) => a.number - b.number),
    })
  }
  return out
}

/* ═══ Panier ═══ */

export function lineKey(l) {
  return `${l.productId}|${l.options || ''}|${l.note || ''}`
}

export function addLine(cart, product, { qty = 1, options = null, note = null } = {}) {
  const line = {
    productId: product.id,
    name: product.name,
    price: round2(product.price),
    vatRate: toNumber(product.vatRate, DEFAULT_VAT_RATE),
    qty: Math.max(1, Math.floor(toNumber(qty, 1))),
    options: options || null,
    note: note?.trim() || null,
    course: product.course || 'plat',
    isKitchen: product.isKitchen !== false,
  }
  const key = lineKey(line)
  const idx = cart.findIndex(l => lineKey(l) === key)
  if (idx === -1) return [...cart, line]
  return cart.map((l, i) => (i === idx ? { ...l, qty: l.qty + line.qty } : l))
}

export function setLineQty(cart, index, qty) {
  const q = Math.floor(toNumber(qty))
  if (q <= 0) return cart.filter((_, i) => i !== index)
  return cart.map((l, i) => (i === index ? { ...l, qty: q } : l))
}

export function computeTotals(lines) {
  let ttc = 0
  let ht = 0
  for (const l of lines) {
    const lineTtc = toNumber(l.price) * toNumber(l.qty)
    ttc += lineTtc
    ht += lineTtc / (1 + toNumber(l.vatRate, DEFAULT_VAT_RATE) / 100)
  }
  ttc = round2(ttc)
  ht = round2(ht)
  return { ttc, ht, tva: round2(ttc - ht) }
}

export function groupByCourse(lines) {
  const groups = new Map()
  for (const l of lines) {
    const meta = courseMeta(l.course)
    if (!groups.has(meta.key)) groups.set(meta.key, { ...meta, lines: [] })
    groups.get(meta.key).lines.push(l)
  }
  return [...groups.values()].sort((a, b) => a.order - b.order)
}

/* ═══ Chargements ═══ */

export async function fetchMenu() {
  const res = await api.get('/products/pos-menu')
  const cats = unwrap(res)?.categories
  if (!Array.isArray(cats)) return []
  return cats
    .map(normalizeCategory)
    .filter(c => c.items.length)
    .sort((a, b) => courseMeta(a.course).order - courseMeta(b.course).order || a.name.localeCompare(b.name, 'fr'))
}

export async function fetchOpenTickets() {
  const res = await api.get('/table-tickets/list')
  const list = unwrap(res)
  return (Array.isArray(list) ? list : []).map(normalizeTicket).filter(Boolean)
}

export async function fetchTableTicket(tableNumber) {
  try {
    const res = await api.get(`/table-tickets/${tableNumber}`)
    return normalizeTicket(unwrap(res))
  } catch (e) {
    if (e.status === 404) return null
    throw e
  }
}

export async function fetchTables() {
  const [spacesRes, ticketsRes] = await Promise.allSettled([
    api.get('/floorplan/spaces'),
    fetchOpenTickets(),
  ])
  if (spacesRes.status === 'rejected' && ticketsRes.status === 'rejected') {
    throw spacesRes.reason
  }
  const spaces = spacesRes.status === 'fulfilled' ? unwrap(spacesRes.value) : []
  const tickets = ticketsRes.status === 'fulfilled' ? ticketsRes.value : []
  return {
    spaces: mergeTables(Array.isArray(spaces) ? spaces : [], tickets),
    tickets,
    partial: spacesRes.status === 'rejected' || ticketsRes.status === 'rejected',
  }
}

/* ═══ Envoi ═══ */

export function kitchenLabel(item) {
  let label = item.name
  if (item.options) label += ` (${item.options})`
  if (item.note) label += ` — ${item.note}`
  return label
}

/**
 * Corps de POST /cash/dispatch. Le bon cuisine ne stocke pas la table :
 * elle est portée par la note de service pour que la cuisine la voie.
 */
export function buildDispatchPayload({ establishmentId, tableNumber, items }) {
  const kitchenItems = items.filter(i => i.isKitchen !== false)
  if (!kitchenItems.length) return null
  const notes = {}
  const routing = {}
  return {
    establishment_id: String(establishmentId),
    table: String(tableNumber),
    default_station: 'cuisine',
    routing,
    notes,
    items: kitchenItems.map(i => {
      const meta = courseMeta(i.course)
      notes[String(meta.order)] = `Table ${tableNumber} · ${meta.label}`
      routing[String(meta.order)] = 'cuisine'
      return {
        product_id: String(i.productId || i.id),
        product_name: kitchenLabel(i),
        qty: i.qty,
        course_number: meta.order,
      }
    }),
  }
}

/**
 * Envoie en cuisine des articles déjà enregistrés sur la note (ticket items).
 * Mémorise la réf KDS ou l'échec (relançable depuis l'écran).
 */
export async function dispatchTicketItems({ establishmentId, ticket, items }) {
  const ids = items.map(i => i.id)
  const payload = buildDispatchPayload({ establishmentId, tableNumber: ticket.tableNumber, items })
  if (!payload) {
    updateKitchenRecord(establishmentId, ticket.id, rec => ({
      ...rec,
      sentItemIds: [...new Set([...rec.sentItemIds, ...ids])],
      failedItemIds: rec.failedItemIds.filter(id => !ids.includes(id)),
    }))
    return { dispatched: true, refs: [] }
  }
  try {
    const res = await api.post('/cash/dispatch', payload)
    const refs = res?.queued
      ? []
      : [...new Set((unwrap(res)?.orders || []).map(o => o.ticket_ref).filter(Boolean))]
    updateKitchenRecord(establishmentId, ticket.id, rec => ({
      ...rec,
      refs: [...new Set([...rec.refs, ...refs])],
      sentItemIds: [...new Set([...rec.sentItemIds, ...ids])],
      failedItemIds: rec.failedItemIds.filter(id => !ids.includes(id)),
      tableNumber: ticket.tableNumber,
      // Nouveaux plats en cuisine : la note repart « en cuisine » (base du suivi de statut)
      status: refs.length ? 'en_cuisine' : rec.status,
    }))
    return { dispatched: true, queued: !!res?.queued, refs }
  } catch (e) {
    updateKitchenRecord(establishmentId, ticket.id, rec => ({
      ...rec,
      failedItemIds: [...new Set([...rec.failedItemIds, ...ids])],
    }))
    return { dispatched: false, error: e.data?.detail || e.message || 'Envoi cuisine impossible' }
  }
}

/**
 * Prise de commande complète : ouvre la table si besoin, enregistre les
 * articles sur la note (POST /table-tickets/{n}/items) puis envoie en cuisine.
 */
export async function sendOrder({ tableNumber, cart, covers = 1, openTable = false }) {
  const establishmentId = currentEstablishmentId()
  if (!establishmentId) throw new Error('Aucun établissement actif')
  if (!cart.length) throw new Error('Panier vide')

  if (openTable) {
    // No-op côté backend si la table est déjà ouverte
    try {
      await api.post(`/floorplan/tables/${tableNumber}/open`, { covers: Math.max(1, toNumber(covers, 1)) })
    } catch { /* le plan de salle est secondaire : la note fait foi */ }
  }

  const body = cart.map(l => ({
    item_name: l.name,
    quantity: l.qty,
    unit_price_ttc: round2(l.price),
    options: l.options || null,
    notes: l.note || null,
    course: l.course || 'plat',
    is_kitchen: l.isKitchen !== false,
  }))
  const res = await api.post(`/table-tickets/${tableNumber}/items`, body)

  if (res?.queued) {
    // Hors-ligne : la file rejouera la note puis l'envoi cuisine, dans l'ordre
    const payload = buildDispatchPayload({ establishmentId, tableNumber, items: cart })
    if (payload) await api.post('/cash/dispatch', payload).catch(() => {})
    return { queued: true, ticket: null, dispatched: false }
  }

  const ticket = normalizeTicket(unwrap(res))
  if (!ticket) throw new Error('Réponse inattendue du serveur')

  // Les articles créés sont les derniers par sort_order
  const created = ticket.items.slice(-body.length)
  const dispatch = await dispatchTicketItems({ establishmentId, ticket, items: created })
  return { ticket, ...dispatch }
}

/** Relance l'envoi cuisine des articles dont le dispatch a échoué. */
export async function retryFailedDispatch(ticket) {
  const establishmentId = currentEstablishmentId()
  const { failedItemIds } = getKitchenRecord(establishmentId, ticket.id)
  const items = ticket.items.filter(i => failedItemIds.includes(i.id))
  if (!items.length) return { dispatched: true, refs: [] }
  return dispatchTicketItems({ establishmentId, ticket, items })
}

/* ═══ Statuts / historique ═══ */

export async function fetchKitchenItems(refs) {
  if (!refs.length) return { items: [], failed: 0 }
  const results = await Promise.allSettled(refs.map(ref =>
    api.get(`/cash/tickets/${encodeURIComponent(ref)}/kitchen-status?ticket_ref=${encodeURIComponent(ref)}`)
  ))
  const items = []
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...(unwrap(r.value)?.items || []))
    else failed++
  }
  return { items, failed }
}

/**
 * Statut d'une commande de table :
 *  - soldé      : note fermée
 *  - en cours   : rien d'envoyé en cuisine depuis ce téléphone
 *  - servi      : tous les plats envoyés sont servis
 *  - en cuisine : sinon
 */
export function orderStatus({ closed = false, refs = [], kitchenItems = [] }) {
  if (closed) return 'solde'
  if (!refs.length) return 'en_cours'
  if (kitchenItems.length && kitchenItems.every(i => i.status === 'served')) return 'servi'
  return 'en_cuisine'
}

/**
 * Réconcilie l'historique local avec les notes ouvertes : une note connue qui
 * n'est plus ouverte a été soldée (le backend ne liste que les notes ouvertes).
 */
export function reconcileHistory(store, openTickets, now = Date.now()) {
  const next = {}
  const openIds = new Set(openTickets.map(t => t.id))
  for (const t of openTickets) {
    next[t.id] = { ticket: t, lastSeen: now, closedAt: null }
  }
  for (const [id, entry] of Object.entries(store || {})) {
    if (openIds.has(id)) continue
    const closedAt = entry.closedAt || now
    if (now - closedAt > HISTORY_TTL) continue
    next[id] = { ...entry, closedAt }
  }
  return next
}

export function syncHistory(estId, openTickets) {
  const all = readJson(HISTORY_KEY, {})
  const est = estId || 'default'
  all[est] = reconcileHistory(all[est], openTickets)
  writeJson(HISTORY_KEY, all)
  return Object.values(all[est])
}

/* ═══ Suivi de statut (notifications en_cuisine → servi) ═══ */

/** Notes de cet établissement envoyées en cuisine depuis ce téléphone. */
export function listKitchenRecords(estId) {
  const byEst = readJson(KITCHEN_KEY, {})?.[estId || 'default'] || {}
  return Object.entries(byEst)
    .map(([ticketId, raw]) => ({ ticketId, ...getKitchenRecord(estId, ticketId), at: raw?.at || 0 }))
    .filter(r => r.refs.length)
}

export function setKitchenStatus(estId, ticketId, status) {
  updateKitchenRecord(estId, ticketId, rec => ({ ...rec, status }))
}

/**
 * Relève le statut cuisine des notes suivies et renvoie celles qui viennent
 * de passer « en cuisine » → « servi ». Un statut inconnu (note antérieure au
 * suivi) est mémorisé sans notifier.
 */
export async function checkKitchenTransitions(estId, now = Date.now()) {
  const transitions = []
  for (const rec of listKitchenRecords(estId)) {
    if (rec.status === 'servi') continue
    if (now - rec.at > WATCH_TTL) continue // bon jamais clôturé au KDS : on arrête de le suivre
    const { items, failed } = await fetchKitchenItems(rec.refs)
    if (failed) continue // statut partiel : on retentera au prochain passage
    const status = orderStatus({ refs: rec.refs, kitchenItems: items })
    if (status === rec.status) continue
    setKitchenStatus(estId, rec.ticketId, status)
    if (rec.status === 'en_cuisine' && status === 'servi') {
      transitions.push({ ticketId: rec.ticketId, tableNumber: rec.tableNumber, from: rec.status, to: status })
    }
  }
  return transitions
}

/* ═══ QR code table ═══ */

/**
 * Numéro de table lu dans un QR code. Formats acceptés :
 *  - « 12 », « T12 », « Table 12 », « TABLE:12 »
 *  - URL avec ?table=12 ou un chemin …/table/12 (ou …/tables/12)
 * Renvoie null si aucun numéro valide (1–999).
 */
export function parseTableQr(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  let candidate = null
  if (/^https?:\/\//i.test(raw)) {
    // « TABLE:15 » serait une URL valide (schéma table:) : seules les URL http(s) sont lues comme telles
    try {
      const url = new URL(raw)
      candidate = url.searchParams.get('table') ?? url.searchParams.get('t')
      if (candidate == null) candidate = url.pathname.match(/\/tables?\/(\d+)\/?$/i)?.[1] ?? null
    } catch { /* URL invalide */ }
  } else {
    candidate = raw.match(/^(?:t|table)?\s*[:#=-]?\s*(\d+)$/i)?.[1] ?? null
  }
  if (candidate == null || !/^\d+$/.test(String(candidate).trim())) return null
  const n = Number(candidate)
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : null
}

/* ═══ Statistiques serveur (ce téléphone) ═══ */

function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Mémorise une commande envoyée (une entrée par envoi, purge à J+1). */
export function recordServiceOrder({ estId, userId, tableNumber, itemCount = 0, at = Date.now() }) {
  const today = dayKey(at)
  const log = readJson(STATS_KEY, [])
  const kept = (Array.isArray(log) ? log : []).filter(e => dayKey(e.at) === today)
  kept.push({
    at,
    est: estId || 'default',
    user: userId == null ? null : String(userId),
    table: toNumber(tableNumber),
    items: toNumber(itemCount),
  })
  writeJson(STATS_KEY, kept)
}

export function getServiceStats({ estId, userId, now = Date.now() }) {
  const today = dayKey(now)
  const uid = userId == null ? null : String(userId)
  const log = readJson(STATS_KEY, [])
  const mine = (Array.isArray(log) ? log : []).filter(e =>
    dayKey(e.at) === today && e.est === (estId || 'default') && e.user === uid
  )
  return {
    ordersToday: mine.length,
    itemsToday: mine.reduce((s, e) => s + toNumber(e.items), 0),
    tablesToday: [...new Set(mine.map(e => e.table))].sort((a, b) => a - b),
  }
}
