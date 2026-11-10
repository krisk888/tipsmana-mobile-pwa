/**
 * Historique d'occupation des tables — appui long sur une table du plan de salle
 *
 * Endpoint demandé (pas encore dans le backend, vérifié 2026-11-10 :
 * /table-tickets/list ne renvoie que les notes ouvertes) :
 *  - GET /table-tickets/history?date=YYYY-MM-DD → notes du jour, ouvertes et
 *    fermées : [{ id, table_number, opened_at, first_order_at?, closed_at,
 *    total_ttc, covers, serveur_name }]
 *
 * Repli : journal local tenu par fetchOpenTickets() (plan de salle, service,
 * relevé toutes les 10 s). Une note qui disparaît de /table-tickets/list est
 * considérée fermée à ce moment-là ; l'heure de fermeture est approchée et
 * le journal ne couvre que ce que ce téléphone a vu.
 *
 * Attente = arrivée (ouverture de la note) → premier article saisi.
 * Durée = arrivée → fermeture (ou maintenant si la table est encore occupée).
 */
import api from './api'

const LOG_KEY = 'tipsmana_table_log'
const KEEP_DAYS = 7
// Au-delà, le téléphone n'a pas relevé les notes entre-temps : fermeture datée
// du dernier relevé plutôt que de maintenant
const CLOSE_GAP_MS = 15 * 60 * 1000

let historyEndpointMissing = false

export function resetTableHistoryState() {
  historyEndpointMissing = false
}

/** Dates du backend : ISO sans fuseau = UTC (colonnes naïves). */
export function parseServerTime(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v)
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** Journée locale (YYYY-MM-DD) d'un horodatage. */
export function dayOf(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeLog(all) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(all)) } catch { /* quota / mode privé */ }
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Met à jour le journal avec les notes ouvertes reçues : nouvelles notes
 * ajoutées, montants rafraîchis, notes disparues marquées fermées.
 */
export function recordOpenTickets(estId, tickets, now = Date.now()) {
  const all = readLog()
  const est = estId || 'default'
  const log = all[est] || {}
  const seen = new Set()
  for (const t of tickets || []) {
    if (!t?.id) continue
    const id = String(t.id)
    seen.add(id)
    const prev = log[id] || {}
    const openedAt = parseServerTime(t.openedAt) ?? prev.openedAt ?? now
    log[id] = {
      id,
      table: num(t.tableNumber),
      openedAt,
      firstOrderAt: parseServerTime(t.firstOrderAt) ?? prev.firstOrderAt ?? null,
      closedAt: null,
      total: num(t.totalTtc),
      covers: num(t.covers) || prev.covers || 1,
      serveur: t.serveur || prev.serveur || '',
      lastSeenAt: now,
    }
  }
  for (const [id, entry] of Object.entries(log)) {
    if (!seen.has(id) && !entry.closedAt) {
      entry.closedAt = now - entry.lastSeenAt <= CLOSE_GAP_MS ? now : entry.lastSeenAt
    }
    // Purge : au-delà d'une semaine
    if (now - (entry.closedAt || entry.lastSeenAt || entry.openedAt) > KEEP_DAYS * 86400000) delete log[id]
  }
  all[est] = log
  writeLog(all)
}

/** Notes du journal local ouvertes le jour donné. */
export function localDayTickets(estId, day) {
  const log = readLog()[estId || 'default'] || {}
  return Object.values(log)
    .filter(e => dayOf(e.openedAt) === day)
    .map(e => ({
      id: e.id,
      table: e.table,
      openedAt: e.openedAt,
      firstOrderAt: e.firstOrderAt,
      closedAt: e.closedAt,
      total: e.total,
      covers: e.covers,
      serveur: e.serveur,
    }))
}

export function normalizeHistoryTicket(raw) {
  if (!raw?.id) return null
  const firstItem = (Array.isArray(raw.items) ? raw.items : []).map(i => i.created_at).filter(Boolean).sort()[0]
  return {
    id: String(raw.id),
    table: num(raw.table_number),
    openedAt: parseServerTime(raw.opened_at ?? raw.created_at),
    firstOrderAt: parseServerTime(raw.first_order_at ?? firstItem),
    closedAt: parseServerTime(raw.closed_at),
    total: num(raw.total_ttc),
    covers: num(raw.covers) || 1,
    serveur: raw.serveur_name || '',
  }
}

/** Temps d'attente (ms) avant le premier article ; null si inconnu. */
export function waitMs(ticket) {
  if (!ticket.openedAt || !ticket.firstOrderAt) return null
  return Math.max(0, ticket.firstOrderAt - ticket.openedAt)
}

/** Durée d'occupation (ms) ; table encore occupée : jusqu'à maintenant. */
export function durationMs(ticket, now = Date.now()) {
  if (!ticket.openedAt) return null
  return Math.max(0, (ticket.closedAt ?? now) - ticket.openedAt)
}

function avg(values) {
  const v = values.filter(x => x != null)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

/**
 * Statistiques du jour : par table (notes, durée moyenne, attente moyenne,
 * chiffre) triées par numéro, et global.
 */
export function tableDayStats(tickets, now = Date.now()) {
  const byTable = new Map()
  for (const t of tickets) {
    if (!byTable.has(t.table)) byTable.set(t.table, [])
    byTable.get(t.table).push(t)
  }
  const tables = [...byTable.entries()]
    .map(([table, list]) => ({
      table,
      tickets: list.length,
      covers: list.reduce((s, t) => s + (t.covers || 0), 0),
      avgDurationMs: avg(list.map(t => durationMs(t, now))),
      avgWaitMs: avg(list.map(waitMs)),
      revenue: Math.round(list.reduce((s, t) => s + t.total, 0) * 100) / 100,
    }))
    .sort((a, b) => a.table - b.table)
  return {
    tables,
    overall: {
      tickets: tickets.length,
      avgDurationMs: avg(tickets.map(t => durationMs(t, now))),
      avgWaitMs: avg(tickets.map(waitMs)),
      revenue: Math.round(tickets.reduce((s, t) => s + t.total, 0) * 100) / 100,
      // Chiffre moyen par table servie
      revenuePerTable: tables.length ? Math.round((tickets.reduce((s, t) => s + t.total, 0) / tables.length) * 100) / 100 : 0,
    },
  }
}

/**
 * Notes du jour (toutes tables). Renvoie { tickets, source: 'api' | 'local' }.
 * En repli, les notes ouvertes sont relues pour mettre le journal à jour.
 */
export async function fetchDayHistory({ day = dayOf(Date.now()), estId = api.getEstablishmentId?.(), fetchOpen } = {}) {
  if (!historyEndpointMissing) {
    try {
      const res = await api.get(`/table-tickets/history?date=${encodeURIComponent(day)}`)
      const data = res?.data ?? res
      const list = Array.isArray(data) ? data : data?.tickets || data?.items || []
      if (!res?.fromCache || list.length) {
        return { tickets: list.map(normalizeHistoryTicket).filter(t => t && t.openedAt), source: 'api' }
      }
    } catch (e) {
      if (e?.status === 404 || e?.status === 405) historyEndpointMissing = true
      // Autre erreur (réseau…) : le journal local reste exploitable
    }
  }
  try {
    const load = fetchOpen || (await import('./serviceOrders')).fetchOpenTickets
    await load() // alimente le journal (recordOpenTickets)
  } catch { /* hors-ligne : journal tel quel */ }
  return { tickets: localDayTickets(estId, day), source: 'local' }
}

/** Notes d'une table, plus récentes d'abord. */
export function ticketsOfTable(tickets, table) {
  return tickets.filter(t => t.table === Number(table)).sort((a, b) => b.openedAt - a.openedAt)
}
