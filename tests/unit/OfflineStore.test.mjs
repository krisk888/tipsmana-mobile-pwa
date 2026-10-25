/**
 * OfflineStore — unit tests
 * Tests: add, getAllPending, markSynced, clearSynced, count
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { offlineStore } from '../../src/shared/offlineStore'

describe('OfflineStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('add()', () => {
    it('ajoute une entrée dans la queue avec un ID auto-incrémenté', async () => {
      await offlineStore.add({ session_id: 1, barcode: '3017620422003', quantity: 5 })
      const pending = await offlineStore.getAllPending()
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe(1)
      expect(pending[0].barcode).toBe('3017620422003')
      expect(pending[0].quantity).toBe(5)
      expect(pending[0].session_id).toBe(1)
      expect(pending[0].synced).toBe(false)
    })

    it('génère des IDs incrémentaux sur plusieurs ajouts', async () => {
      await offlineStore.add({ session_id: 1, barcode: '001', quantity: 1 })
      await offlineStore.add({ session_id: 1, barcode: '002', quantity: 2 })
      await offlineStore.add({ session_id: 1, barcode: '003', quantity: 3 })
      const pending = await offlineStore.getAllPending()
      expect(pending).toHaveLength(3)
      expect(pending[0].id).toBe(1)
      expect(pending[1].id).toBe(2)
      expect(pending[2].id).toBe(3)
    })

    it('associe les champs optionnels avec des valeurs par défaut', async () => {
      await offlineStore.add({ session_id: 1, quantity: 10 })
      const pending = await offlineStore.getAllPending()
      expect(pending[0].barcode).toBe(null)
      expect(pending[0].product_id).toBe(null)
      expect(pending[0].zone).toBe(null)
      expect(pending[0].mode).toBe('set')
      expect(pending[0].counted_at).toBeTruthy()
      expect(pending[0].created_at).toBeTruthy()
    })
  })

  describe('getAllPending()', () => {
    it('retourne uniquement les entrées non synchronisées', async () => {
      await offlineStore.add({ session_id: 1, barcode: '001', quantity: 1 })
      await offlineStore.add({ session_id: 1, barcode: '002', quantity: 2 })
      await offlineStore.add({ session_id: 1, barcode: '003', quantity: 3 })
      await offlineStore.markSynced([2])
      const pending = await offlineStore.getAllPending()
      expect(pending).toHaveLength(2)
      expect(pending.find(e => e.id === 2)).toBeUndefined()
    })

    it('filtre par session_id', async () => {
      await offlineStore.add({ session_id: 1, barcode: '001', quantity: 1 })
      await offlineStore.add({ session_id: 2, barcode: '002', quantity: 2 })
      await offlineStore.add({ session_id: 1, barcode: '003', quantity: 3 })
      const pending = await offlineStore.getAllPending(1)
      expect(pending).toHaveLength(2)
      expect(pending.every(e => e.session_id === 1)).toBe(true)
    })
  })

  describe('markSynced()', () => {
    it('marque les IDs spécifiés comme synchronisés', async () => {
      await offlineStore.add({ session_id: 1, barcode: '001', quantity: 1 })
      await offlineStore.add({ session_id: 1, barcode: '002', quantity: 2 })
      await offlineStore.markSynced([1, 2])
      const pending = await offlineStore.getAllPending()
      expect(pending).toHaveLength(0)
    })
  })

  describe('clearSynced()', () => {
    it('supprime les entrées synchronisées de la queue', async () => {
      await offlineStore.add({ session_id: 1, barcode: '001', quantity: 1 })
      await offlineStore.add({ session_id: 1, barcode: '002', quantity: 2 })
      await offlineStore.markSynced([1])
      await offlineStore.clearSynced()
      const raw = localStorage.getItem('tipsmana_offline_queue')
      const queue = JSON.parse(raw)
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe(2)
      expect(queue[0].synced).toBe(false)
    })
  })

  describe('count()', () => {
    it('retourne le nombre d entrées en attente', async () => {
      expect(await offlineStore.count()).toBe(0)
      await offlineStore.add({ session_id: 1, barcode: '001', quantity: 1 })
      await offlineStore.add({ session_id: 1, barcode: '002', quantity: 2 })
      expect(await offlineStore.count()).toBe(2)
      await offlineStore.markSynced([1])
      expect(await offlineStore.count()).toBe(1)
    })

    it('retourne 0 si la queue est vide', async () => {
      expect(await offlineStore.count()).toBe(0)
    })
  })
})