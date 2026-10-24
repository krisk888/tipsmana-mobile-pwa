/**
 * Offline Count Queue — localStorage
 *
 * Queues inventory counts when network is unavailable and replays them
 * as a batch (POST /inventory/sessions/{id}/scans) when connectivity returns.
 *
 * API: Promise-based, no external deps. Uses localStorage as the backing store
 * instead of the non-standard indexedDB API.
 */

const LS_KEY = 'tipsmana_offline_queue'
const DB_KEY = 'tipsmana_offline_meta'

function loadQueue() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveQueue(queue) {
  localStorage.setItem(LS_KEY, JSON.stringify(queue))
}

function nextId() {
  const meta = localStorage.getItem(DB_KEY)
  const parsed = meta ? JSON.parse(meta) : {}
  const id = (parsed.lastId || 0) + 1
  localStorage.setItem(DB_KEY, JSON.stringify({ lastId: id }))
  return id
}

export const offlineStore = {
  async add(entry) {
    const queue = loadQueue()
    queue.push({
      id: nextId(),
      session_id: entry.session_id,
      barcode: entry.barcode || null,
      product_id: entry.product_id || null,
      quantity: entry.quantity,
      zone: entry.zone || null,
      mode: entry.mode || 'set',
      counted_at: entry.counted_at || new Date().toISOString(),
      synced: false,
      created_at: new Date().toISOString(),
    })
    saveQueue(queue)
  },

  async getAllPending(sessionId) {
    const queue = loadQueue()
    const pending = queue.filter(e => !e.synced)
    if (sessionId) {
      return pending.filter(e => e.session_id === sessionId)
    }
    return pending
  },

  async markSynced(ids) {
    const queue = loadQueue()
    const idSet = new Set(ids)
    for (const entry of queue) {
      if (idSet.has(entry.id)) {
        entry.synced = true
      }
    }
    saveQueue(queue)
  },

  async clearSynced() {
    const queue = loadQueue()
    const remaining = queue.filter(e => !e.synced)
    saveQueue(remaining)
  },

  async count() {
    const queue = loadQueue()
    return queue.filter(e => !e.synced).length
  },
}

export default offlineStore