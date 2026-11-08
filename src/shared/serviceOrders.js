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
 *  - GET  /mobile/orders/{id}/status → statut d'une note (pas encore dans le backend :
 *    repli sur kitchen-status)
 *
 * Le backend ne relie pas les bons cuisine (MOB-XXXX) aux notes de table : les
 * réfs envoyées depuis ce téléphone sont mémorisées localement, par établissement.
 */

import api from './api'
import { t, intlLocale } from '../i18n'

export const DEFAULT_VAT_RATE = 10

// `label` est traduit à la lecture (langue active) ; `kitchenLabel` reste en
// français : c'est la donnée envoyée à la cuisine (notes du bon KDS).
function translatable(entry) {
  return Object.defineProperty(entry, 'label', {
    get() { return t(this.labelKey) },
    enumerable: true,
  })
}

export const COURSES = [
  { key: 'entree',  kitchenLabel: 'Entrée',  labelKey: 'service.courses.entree',  order: 0, icon: '🥗', color: '#34d399' },
  { key: 'plat',    kitchenLabel: 'Plat',    labelKey: 'service.courses.plat',    order: 1, icon: '🍽', color: '#fbbf24' },
  { key: 'dessert', kitchenLabel: 'Dessert', labelKey: 'service.courses.dessert', order: 2, icon: '🍰', color: '#f472b6' },
  { key: 'boisson', kitchenLabel: 'Boisson', labelKey: 'service.courses.boisson', order: 3, icon: '🥤', color: '#38bdf8' },
  { key: 'autre',   kitchenLabel: 'Autre',   labelKey: 'service.courses.autre',   order: 4, icon: '✨', color: '#a78bfa' },
].map(translatable)

// Les valeurs d'options restent en français (donnée enregistrée sur la note et
// lue par la cuisine) ; seul leur libellé affiché est traduit (optionLabel).
export const OPTION_GROUPS = {
  cuisson:   translatable({ key: 'cuisson',   labelKey: 'service.optionGroups.cuisson',   options: ['Bleu', 'Saignant', 'À point', 'Bien cuit'] }),
  garniture: translatable({ key: 'garniture', labelKey: 'service.optionGroups.garniture', options: ['Frites', 'Riz', 'Légumes', 'Salade'] }),
}

const OPTION_LABEL_KEYS = {
  'Bleu': 'service.options.bleu',
  'Saignant': 'service.options.saignant',
  'À point': 'service.options.aPoint',
  'Bien cuit': 'service.options.bienCuit',
  'Frites': 'service.options.frites',
  'Riz': 'service.options.riz',
  'Légumes': 'service.options.legumes',
  'Salade': 'service.options.salade',
}

/** Libellé affiché d'une valeur d'option (valeur inconnue : telle quelle). */
export function optionLabel(value) {
  const key = OPTION_LABEL_KEYS[value]
  return key ? t(key) : value
}

/** Options d'une ligne (« Saignant + Frites ») traduites pour l'affichage. */
export function formatOptions(options) {
  if (!options) return ''
  return String(options).split(' + ').map(optionLabel).join(' + ')
}

// Options proposées par service (les articles du pos-menu ne portent pas d'options)
export const COURSE_OPTIONS = {
  plat: ['cuisson', 'garniture'],
}

export const ORDER_STATUSES = {
  en_cours:   translatable({ labelKey: 'service.orderStatuses.enCours',   icon: '📝' }),
  en_cuisine: translatable({ labelKey: 'service.orderStatuses.enCuisine', icon: '🔥' }),
  pret:       translatable({ labelKey: 'service.orderStatuses.pret',      icon: '🛎️' }),
  servi:      translatable({ labelKey: 'service.orderStatuses.servi',     icon: '✅' }),
  solde:      translatable({ labelKey: 'service.orderStatuses.solde',     icon: '💶' }),
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
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR' }).format(v || 0)
}

// Réponses api.js : { success, data, message } (ou cache hors-ligne avec la même forme)
export function unwrap(res) {
  return res && typeof res === 'object' && 'data' in res ? res.data : res
}

export function courseMeta(key) {
  return COURSES.find(c => c.key === key) || COURSES.find(c => c.key === 'autre')
}

/** Libellé traduit d'un service (entrée, plat…). */
export function courseLabel(key) {
  return t(courseMeta(key).labelKey)
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
    name: cat.name || t('service.fallback.category'),
    course,
    icon: meta.icon,
    color: meta.color,
    items: (Array.isArray(cat.items) ? cat.items : []).map(p => ({
      id: String(p.id),
      name: p.name || p.label || t('service.fallback.article'),
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
    name: i.item_name || i.name || t('service.fallback.article'),
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
    // Note fusionnée : tables rattachées (si le backend les renvoie)
    tables: (Array.isArray(t.merged_tables) ? t.merged_tables : Array.isArray(t.tables) ? t.tables : [])
      .map(n => toNumber(n)).filter(n => n > 0),
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
  // Tables rattachées à une note fusionnée → table principale
  const hostByTable = new Map()
  for (const t of tickets) {
    for (const n of t.tables || []) if (n !== t.tableNumber && !ticketByTable.has(n)) hostByTable.set(n, t.tableNumber)
  }
  const seen = new Set()
  const out = spaces.map(s => ({
    id: String(s.id ?? s.number ?? s.name),
    name: s.name || t('service.fallback.space'),
    icon: s.icon || '🪑',
    tables: (Array.isArray(s.tables) ? s.tables : []).map(t => {
      const number = toNumber(t.number)
      seen.add(number)
      const ticket = ticketByTable.get(number) || null
      const linkedTo = hostByTable.get(number) ?? null
      let state = normalizeTableState(t.state)
      if ((ticket || linkedTo) && (state === 'libre' || state === 'reservee')) state = 'occupee'
      return {
        number,
        linkedTo,
        mergedWith: ticket ? (ticket.tables || []).filter(n => n !== number) : [],
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
      name: t('service.fallback.otherSpace'),
      icon: '🔢',
      tables: orphans.map(t => ({
        number: t.tableNumber,
        linkedTo: null,
        mergedWith: (t.tables || []).filter(n => n !== t.tableNumber),
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
    .sort((a, b) => courseMeta(a.course).order - courseMeta(b.course).order || a.name.localeCompare(b.name, intlLocale()))
}

export async function fetchOpenTickets() {
  const res = await api.get('/table-tickets/list')
  const list = unwrap(res)
  return applyMergeRecords((Array.isArray(list) ? list : []).map(normalizeTicket).filter(Boolean))
}

export async function fetchTableTicket(tableNumber) {
  try {
    const res = await api.get(`/table-tickets/${tableNumber}`)
    const ticket = normalizeTicket(unwrap(res))
    return ticket ? applyMergeRecords([ticket])[0] : null
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
      // Donnée cuisine : toujours en français, quelle que soit la langue de l'écran
      notes[String(meta.order)] = `Table ${tableNumber} · ${meta.kitchenLabel}`
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
    return { dispatched: false, error: e.data?.detail || e.message || t('service.errors.dispatchFailed') }
  }
}

/**
 * Prise de commande complète : ouvre la table si besoin, enregistre les
 * articles sur la note (POST /table-tickets/{n}/items) puis envoie en cuisine.
 */
export async function sendOrder({ tableNumber, cart, covers = 1, openTable = false }) {
  const establishmentId = currentEstablishmentId()
  if (!establishmentId) throw new Error(t('service.errors.noEstablishment'))
  if (!cart.length) throw new Error(t('service.errors.emptyCart'))
  // Envoi dans l'ordre des services : entrées, puis plats, desserts…
  cart = sortByCourse(cart)

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
  if (!ticket) throw new Error(t('common.errors.unexpected'))

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
 *  - prêt       : tous les plats envoyés sont prêts (ou déjà servis)
 *  - en cuisine : sinon
 */
export function orderStatus({ closed = false, refs = [], kitchenItems = [] }) {
  if (closed) return 'solde'
  if (!refs.length) return 'en_cours'
  if (kitchenItems.length && kitchenItems.every(i => i.status === 'served')) return 'servi'
  if (kitchenItems.length && kitchenItems.every(i => i.status === 'ready' || i.status === 'served')) return 'pret'
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

// Statut renvoyé par GET /mobile/orders/{id}/status (KDS ou vocabulaire mobile)
const REMOTE_STATUSES = {
  pending: 'en_cuisine', printing: 'en_cuisine', printed: 'en_cuisine', preparing: 'en_cuisine',
  in_progress: 'en_cuisine', en_cours: 'en_cuisine', en_cuisine: 'en_cuisine',
  ready: 'pret', pret: 'pret', 'prêt': 'pret',
  served: 'servi', servi: 'servi',
}

export function normalizeRemoteStatus(status) {
  return REMOTE_STATUSES[String(status || '').toLowerCase()] || null
}

// GET /mobile/orders/{id}/status absent du backend (vérifié 2026-11-08) : après
// un 404 « route inconnue », on passe directement par le statut KDS des bons
let mobileStatusMissing = false
export function resetOrderStatusEndpointCache() { mobileStatusMissing = false }

function isUnknownRoute(err) {
  return err?.status === 405 || (err?.status === 404 && err?.data?.detail === 'Not Found')
}

/**
 * Statut cuisine d'une note suivie : en_cuisine | pret | servi, ou null si
 * indéterminé (réponse partielle : on retentera).
 */
export async function fetchOrderStatus(rec) {
  if (!mobileStatusMissing) {
    try {
      const data = unwrap(await api.get(`/mobile/orders/${encodeURIComponent(rec.ticketId)}/status`))
      const status = normalizeRemoteStatus(data?.status)
      if (status) return status
    } catch (err) {
      if (!isUnknownRoute(err)) return null // réseau : on retentera au prochain passage
      mobileStatusMissing = true
    }
  }
  const { items, failed } = await fetchKitchenItems(rec.refs)
  if (failed) return null
  return orderStatus({ refs: rec.refs, kitchenItems: items })
}

// Transitions notifiées : la cuisine a fini (prêt), puis le plat est en salle (servi)
const NOTIFIED = { en_cuisine: ['pret', 'servi'], pret: ['servi'] }

/**
 * Relève le statut cuisine des notes suivies et renvoie celles qui viennent
 * de passer « en cuisine » → « prêt » → « servi ». Un statut inconnu (note
 * antérieure au suivi) est mémorisé sans notifier.
 */
export async function checkKitchenTransitions(estId, now = Date.now()) {
  const transitions = []
  for (const rec of listKitchenRecords(estId)) {
    if (rec.status === 'servi') continue
    if (now - rec.at > WATCH_TTL) continue // bon jamais clôturé au KDS : on arrête de le suivre
    const status = await fetchOrderStatus(rec)
    if (!status || status === rec.status) continue
    setKitchenStatus(estId, rec.ticketId, status)
    if (NOTIFIED[rec.status]?.includes(status)) {
      transitions.push({ ticketId: rec.ticketId, tableNumber: rec.tableNumber, from: rec.status, to: status })
    }
  }
  return transitions
}

/**
 * Statut reçu par Web Push : mémorisé sur la note de la table pour que le
 * suivi local ne notifie pas une seconde fois la même transition.
 */
export function applyPushedStatus(estId, tableNumber, remoteStatus) {
  const status = normalizeRemoteStatus(remoteStatus)
  if (!status) return
  for (const rec of listKitchenRecords(estId)) {
    if (String(rec.tableNumber) === String(tableNumber) && rec.status !== 'servi') {
      setKitchenStatus(estId, rec.ticketId, status)
    }
  }
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

/* ═══ Édition du panier avant envoi ═══ */

/** Retire une ligne du panier. */
export function removeLine(cart, index) {
  return cart.filter((_, i) => i !== index)
}

/**
 * Remplace la note d'une ligne (cuisson, allergène…). Si une ligne identique
 * porte déjà cette note, les deux sont regroupées.
 */
export function setLineNote(cart, index, note) {
  const line = cart[index]
  if (!line) return cart
  const updated = { ...line, note: String(note ?? '').trim().slice(0, 120) || null }
  const twin = cart.findIndex((l, i) => i !== index && lineKey(l) === lineKey(updated))
  if (twin === -1) return cart.map((l, i) => (i === index ? updated : l))
  return cart
    .map((l, i) => (i === twin ? { ...l, qty: l.qty + updated.qty } : l))
    .filter((_, i) => i !== index)
}

/** Change le service (entrée / plat / dessert…) d'une ligne. */
export function setLineCourse(cart, index, course) {
  if (!cart[index] || !COURSES.some(c => c.key === course)) return cart
  return cart.map((l, i) => (i === index ? { ...l, course } : l))
}

/**
 * Déplace une ligne d'un cran (dir = -1 / +1) parmi les lignes du même
 * service : l'ordre des lignes est celui de l'envoi en cuisine.
 */
export function moveLine(cart, index, dir) {
  const line = cart[index]
  if (!line) return cart
  const course = courseMeta(line.course).key
  const step = dir < 0 ? -1 : 1
  let j = index + step
  while (j >= 0 && j < cart.length && courseMeta(cart[j].course).key !== course) j += step
  if (j < 0 || j >= cart.length) return cart
  const next = [...cart]
  next[index] = cart[j]
  next[j] = line
  return next
}

/** Panier trié par service (entrée → plat → dessert…), ordre conservé dans un service. */
export function sortByCourse(lines) {
  return lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => courseMeta(a.l.course).order - courseMeta(b.l.course).order || a.i - b.i)
    .map(x => x.l)
}

/* ═══ Fusion / séparation de tables ═══
 *  - POST /table-tickets/merge  { table_numbers, target_table } → note fusionnée
 *  - POST /table-tickets/split  { table_number, splits: [{ table_number, item_ids }] }
 * Les tables d'une note fusionnée sont lues dans la réponse (merged_tables)
 * et mémorisées localement, le reste de l'API ne les renvoyant pas.
 */

const MERGE_KEY = 'tipsmana_service_merges'

function readMerges(estId) {
  return readJson(MERGE_KEY, {})?.[estId || 'default'] || {}
}

function writeMerges(estId, byTicket) {
  const all = readJson(MERGE_KEY, {})
  all[estId || 'default'] = byTicket
  writeJson(MERGE_KEY, all)
}

function uniqueTables(list) {
  return [...new Set(list.map(n => toNumber(n)).filter(n => n > 0))].sort((a, b) => a - b)
}

/** Tables couvertes par une note (table principale en premier). */
export function ticketTables(ticket, estId = currentEstablishmentId()) {
  if (!ticket) return []
  const local = readMerges(estId)[ticket.id] || []
  const others = uniqueTables([...(ticket.tables || []), ...local]).filter(n => n !== ticket.tableNumber)
  return [ticket.tableNumber, ...others]
}

/** Complète les notes avec les tables fusionnées mémorisées sur ce téléphone. */
export function applyMergeRecords(tickets, estId = currentEstablishmentId()) {
  return tickets.map(t => ({ ...t, tables: ticketTables(t, estId) }))
}

function assertOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(t('service.errors.mergeOffline'))
  }
}

export function buildMergePayload(tableNumbers, targetTable) {
  const tables = uniqueTables(tableNumbers)
  const target = toNumber(targetTable)
  if (tables.length < 2) throw new Error(t('service.errors.mergeMinTables'))
  if (!tables.includes(target)) throw new Error(t('service.errors.mergeTarget'))
  return { table_numbers: tables, target_table: target }
}

export async function mergeTableTickets({ tableNumbers, targetTable }) {
  const payload = buildMergePayload(tableNumbers, targetTable)
  assertOnline()
  const res = await api.post('/table-tickets/merge', payload)
  if (res?.queued) return { queued: true, ticket: null }
  const ticket = normalizeTicket(unwrap(res))
  if (!ticket) throw new Error(t('common.errors.unexpected'))
  const estId = currentEstablishmentId()
  const merges = readMerges(estId)
  merges[ticket.id] = uniqueTables([...payload.table_numbers, ...(ticket.tables || [])])
    .filter(n => n !== ticket.tableNumber)
  writeMerges(estId, merges)
  return { queued: false, ticket: { ...ticket, tables: ticketTables(ticket, estId) } }
}

/**
 * Corps de la séparation : `assignments` = { [itemId]: tableNumber }. Les
 * articles laissés sur la table principale ne sont pas envoyés.
 */
export function buildSplitPayload(ticket, assignments) {
  const byTable = new Map()
  for (const item of ticket.items) {
    const table = toNumber(assignments?.[item.id], ticket.tableNumber)
    if (table === ticket.tableNumber) continue
    if (!byTable.has(table)) byTable.set(table, [])
    byTable.get(table).push(item.id)
  }
  if (!byTable.size) throw new Error(t('service.errors.splitNothing'))
  return {
    table_number: ticket.tableNumber,
    splits: [...byTable.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([table_number, item_ids]) => ({ table_number, item_ids })),
  }
}

export async function splitTableTicket({ ticket, assignments }) {
  const payload = buildSplitPayload(ticket, assignments)
  assertOnline()
  const res = await api.post('/table-tickets/split', payload)
  if (res?.queued) return { queued: true, tickets: [] }
  const estId = currentEstablishmentId()
  const merges = readMerges(estId)
  delete merges[ticket.id]
  writeMerges(estId, merges)
  const data = unwrap(res)
  const list = Array.isArray(data) ? data : (data?.tickets || [])
  return { queued: false, tickets: list.map(normalizeTicket).filter(Boolean) }
}

/* ═══ Écran client (note consultée par QR) ═══
 * URL : /mobile/note/{ticketId}?t={table}#s={instantané}
 *  - ticketId (UUID) : seul identifiant exposé, propre à la note en cours
 *  - instantané base64url : affiché tout de suite et si l'API est injoignable
 * Rafraîchissement : GET /table-tickets/{t} sur un appareil connecté, sinon
 * GET /public/table-tickets/{ticketId} (lecture seule, sans jeton).
 */

const SNAPSHOT_MAX = 1200

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

export function encodeSnapshot(ticket, at = Date.now()) {
  const data = {
    n: ticket.tableNumber,
    a: at,
    t: ticket.totalTtc,
    h: ticket.totalHt,
    i: ticket.items.map(i => [i.name, i.qty, i.price, i.course]),
  }
  const out = toBase64Url(JSON.stringify(data))
  return out.length > SNAPSHOT_MAX ? null : out
}

export function decodeSnapshot(str) {
  try {
    const d = JSON.parse(fromBase64Url(String(str || '')))
    if (!d || !Array.isArray(d.i)) return null
    return {
      id: null,
      tableNumber: toNumber(d.n),
      status: 'open',
      totalTtc: round2(d.t),
      totalHt: round2(d.h),
      items: d.i.map(([name, qty, price, course], idx) => ({
        id: `s${idx}`, name: String(name), qty: toNumber(qty, 1), price: round2(price), course: course || 'autre',
      })),
      snapshotAt: toNumber(d.a) || null,
    }
  } catch {
    return null
  }
}

export function customerDisplayUrl(ticket, { origin = window.location.origin, base = '/mobile/' } = {}) {
  const snap = encodeSnapshot(ticket)
  const path = `${origin}${base.replace(/\/?$/, '/')}note/${encodeURIComponent(ticket.id)}?t=${ticket.tableNumber}`
  return snap ? `${path}#s=${snap}` : path
}

/**
 * Note à afficher au client. Renvoie { ticket, closed } ou { unavailable }
 * quand aucune source n'est joignable (l'écran garde alors l'instantané).
 */
export async function fetchCustomerNote({ ticketId, tableNumber }) {
  if (api.getToken() && tableNumber) {
    const ticket = await fetchTableTicket(tableNumber)
    if (!ticket || ticket.id !== String(ticketId)) return { ticket: null, closed: true }
    return { ticket, closed: false }
  }
  const res = await fetch(`${api.baseUrl || '/api/v1'}/public/table-tickets/${encodeURIComponent(ticketId)}`)
  if (!res.ok) return { unavailable: true, status: res.status }
  const ticket = normalizeTicket(unwrap(await res.json()))
  if (!ticket) return { unavailable: true }
  return { ticket, closed: ticket.status !== 'open' }
}
