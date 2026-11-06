/**
 * Offline Store — Cache API (IndexedDB) + Queue requêtes (localStorage)
 *
 * Système à deux couches :
 *  ─ Cache : IndexedDB pour les réponses GET (persistant, grand volume)
 *  ─ Queue : localStorage pour les mutations en attente (compatible
 *    avec l'existant : inventory scans + requêtes générales)
 */
const LS_KEY = 'tipsmana_offline_queue'
const REQ_KEY = 'tipsmana_request_queue'
const DB_NAME = 'tipsmana_offline_cache'
const DB_VERSION = 1
const CACHE_STORE = 'api_cache'

// ═══ IndexedDB — Cache GET ═══

let _dbPromise = null

function _openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

async function _getDB() {
  const db = await _openDB()
  return db
}

// ═══ Queue inventaire (localStorage — backward compat) ═══

function _loadQueue() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function _saveQueue(queue) {
  localStorage.setItem(LS_KEY, JSON.stringify(queue))
}
function _nextId() {
  try {
    const meta = JSON.parse(localStorage.getItem('tipsmana_offline_meta') || '{}')
    const id = (meta.lastId || 0) + 1
    localStorage.setItem('tipsmana_offline_meta', JSON.stringify({ lastId: id }))
    return id
  } catch { return Date.now() }
}

// ═══ Queue requêtes générales (localStorage) ═══

function _loadRequestQueue() {
  try {
    const raw = localStorage.getItem(REQ_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function _saveRequestQueue(queue) {
  localStorage.setItem(REQ_KEY, JSON.stringify(queue))
}

// ═══ Badge (PWA app badge + cache) ═══
const BADGE_KEY = 'tipsmana_pwa_badge'

export const offlineStore = {
  // ── Cache IndexedDB ──
  async setCached(key, data) {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).put(data, key)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* silencieux — le cache n'est pas critique */ }
  },

  async getCached(key) {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readonly')
      const store = tx.objectStore(CACHE_STORE)
      const req = store.get(key)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      return req.result || null
    } catch { return null }
  },

  async invalidateCached(key) {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).delete(key)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* silencieux */ }
  },

  async clearCache() {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).clear()
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* silencieux */ }
  },

  // ── Queue requêtes générales ──
  async enqueueRequest(method, path, body) {
    const queue = _loadRequestQueue()
    queue.push({
      id: _nextId(),
      method,
      path,
      body,
      created_at: new Date().toISOString(),
    })
    _saveRequestQueue(queue)
    return queue.length
  },

  async getPendingRequests() {
    return _loadRequestQueue()
  },

  async dequeueRequest(id) {
    const queue = _loadRequestQueue()
    const remaining = queue.filter(r => r.id !== id)
    _saveRequestQueue(remaining)
    return remaining.length
  },

  async flushToServer(apiClient) {
    const queue = _loadRequestQueue()
    if (!queue.length) return { synced: 0, failed: 0 }
    let synced = 0
    let failed = 0
    for (const req of queue) {
      try {
        await apiClient.request(req.method, req.path, req.body)
        synced++
      } catch {
        failed++
      }
    }
    if (failed === 0) {
      _saveRequestQueue([])
    } else {
      const remaining = queue.filter(r => {
        const idx = queue.indexOf(r)
        const wasSynced = idx < synced
        return !wasSynced
      })
      _saveRequestQueue(remaining)
    }
    return { synced, failed }
  },

  async pendingRequestCount() {
    return _loadRequestQueue().length
  },

  // ── Queue inventaire (backward compat) ──
  async add(entry) {
    const queue = _loadQueue()
    queue.push({
      id: _nextId(),
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
    _saveQueue(queue)
  },

  async getAllPending(sessionId) {
    const queue = _loadQueue()
    const pending = queue.filter(e => !e.synced)
    if (sessionId) return pending.filter(e => e.session_id === sessionId)
    return pending
  },

  async markSynced(ids) {
    const queue = _loadQueue()
    const idSet = new Set(ids)
    for (const entry of queue) {
      if (idSet.has(entry.id)) entry.synced = true
    }
    _saveQueue(queue)
  },

  async clearSynced() {
    const queue = _loadQueue()
    _saveQueue(queue.filter(e => !e.synced))
  },

  async count() {
    const queue = _loadQueue()
    return queue.filter(e => !e.synced).length
  },

  // ── Badge count (PWA badge, offline cache) ──
  async setBadgeCount(count) {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).put(count, BADGE_KEY)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* silencieux */ }
  },

  async getBadgeCount() {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readonly')
      const store = tx.objectStore(CACHE_STORE)
      const req = store.get(BADGE_KEY)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      return req.result || 0
    } catch { return 0 }
  },

  async clearBadge() {
    try {
      const db = await _getDB()
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).delete(BADGE_KEY)
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* silencieux */ }
  },
}

export default offlineStore