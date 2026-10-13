/**
 * Offline Count Queue — IndexedDB
 *
 * Queues inventory counts when network is unavailable and replays them
 * as a batch (POST /inventory/sessions/{id}/scans) when connectivity returns.
 *
 * API: Promise-based, no external deps.
 */

const DB_NAME = 'tipsmana_offline'
const DB_VERSION = 1
const STORE = 'counts'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        store.createIndex('session', 'session_id', { unique: false })
        store.createIndex('synced', 'synced', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const offlineStore = {
  async add(entry) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add({
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
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      db.close()
    })
  },

  async getAllPending(sessionId) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const index = store.index('synced')
      const range = IDBKeyRange.only(false)
      const items = []
      const req = index.openCursor(range)
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          if (!sessionId || cursor.value.session_id === sessionId) {
            items.push(cursor.value)
          }
          cursor.continue()
        } else {
          resolve(items)
        }
      }
      req.onerror = () => reject(req.error)
      db.close()
    })
  },

  async markSynced(ids) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      ids.forEach((id) => {
        const getReq = store.get(id)
        getReq.onsuccess = () => {
          const entry = getReq.result
          if (entry) {
            entry.synced = true
            store.put(entry)
          }
        }
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      db.close()
    })
  },

  async clearSynced() {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const index = store.index('synced')
      const req = index.openCursor(IDBKeyRange.only(true))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => reject(req.error)
      db.close()
    })
  },

  async count() {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      db.close()
    })
  },
}

export default offlineStore