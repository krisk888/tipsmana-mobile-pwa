/**
 * App client — historique des consommations, gardé sur le téléphone du client
 *
 * Aucune route ne liste les additions d'un client (pas de compte client, et
 * le backend ne liste pas les notes soldées, vérifié 2026-11-10) : chaque
 * addition vue dans l'app client est enregistrée ici, puis marquée payée quand
 * elle est soldée (note fermée) ou au retour du paiement en ligne.
 *
 * Une visite = une note (id de note, sinon table + jour). 20 visites au plus.
 */

const HISTORY_KEY = 'tipsmana_guest_history'
export const HISTORY_MAX = 20

function readAll() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))) } catch { /* quota / mode privé */ }
}

function dayOf(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function visitKey({ ticketId, table, establishmentId }, now = Date.now()) {
  return ticketId ? `${establishmentId || '-'}:${ticketId}` : `${establishmentId || '-'}:t${table}:${dayOf(now)}`
}

/** Visites, plus récente en premier. */
export function readGuestHistory() {
  return readAll().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
}

/**
 * Addition relevée → visite créée ou mise à jour (articles et total à jour,
 * payée si la note est fermée). Une addition vide n'est pas enregistrée.
 * Renvoie la visite (ou null).
 */
export function recordGuestVisit(bill, { table, establishmentId }, now = Date.now()) {
  const ticket = bill?.ticket
  if (!ticket || !ticket.items?.length) return null
  const key = visitKey({ ticketId: ticket.id, table, establishmentId }, now)
  const list = readAll()
  const prev = list.find(v => v.key === key)
  const visit = {
    key,
    ticketId: ticket.id || null,
    table: bill.tableNumber || table,
    establishmentId: establishmentId || null,
    establishmentName: bill.establishmentName || prev?.establishmentName || null,
    items: ticket.items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
    total: ticket.totalTtc,
    firstSeen: prev?.firstSeen || now,
    lastSeen: now,
    paid: prev?.paid || !ticket.open,
    paidAt: prev?.paidAt || (!ticket.open ? now : null),
    paidVia: prev?.paidVia || (!ticket.open ? 'table' : null),
  }
  writeAll([visit, ...list.filter(v => v.key !== key)])
  return visit
}

/** Retour du paiement en ligne : la visite en cours est payée. */
export function markVisitPaid({ ticketId, table, establishmentId }, via = 'online', now = Date.now()) {
  const list = readAll()
  const key = visitKey({ ticketId, table, establishmentId }, now)
  const visit = list.find(v => v.key === key)
    // Note inconnue (id absent du lien) : dernière visite non payée de cette table
    || list
      .filter(v => String(v.table) === String(table) && (v.establishmentId || null) === (establishmentId || null) && !v.paid)
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))[0]
  if (!visit || visit.paid) return visit || null
  Object.assign(visit, { paid: true, paidAt: now, paidVia: via })
  writeAll(list)
  return visit
}

/** Totaux pour l'en-tête de l'historique. */
export function historyTotals(visits) {
  let paid = 0
  let due = 0
  for (const v of visits || []) {
    if (v.paid) paid += v.total || 0
    else due += v.total || 0
  }
  return { paid: Math.round(paid * 100) / 100, due: Math.round(due * 100) / 100, count: (visits || []).length }
}

export function clearGuestHistory() {
  try { localStorage.removeItem(HISTORY_KEY) } catch { /* mode privé */ }
}
