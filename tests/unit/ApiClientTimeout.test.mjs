/**
 * ApiClient timeout tests
 * Vérifie que le timeout est configurable et que le fallback
 * offline (cache GET / queue mutation) est déclenché quand
 * fetch rejette avec AbortError.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../src/shared/offlineStore')
vi.mock('../../src/shared/auth', () => ({
  login: vi.fn(),
  loadToken: vi.fn(),
  logout: vi.fn(),
  saveToken: vi.fn(),
  isAuthenticated: vi.fn(() => false),
}))

import { api } from '../../src/shared/api'

describe('ApiClient timeout', () => {
  let fetchSpy

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem('tipsmana_token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('timeout configurable', () => {
    it('le singleton api est configuré avec un timeout par défaut de 10s', () => {
      expect(api.timeoutMs).toBe(10000)
    })
  })

  describe('fallback AbortError → cache GET', () => {
    it('sert le cache quand fetch rejette avec AbortError sur une requête GET', async () => {
      const offlineStore = await import('../../src/shared/offlineStore')
      offlineStore.offlineStore.getCached.mockResolvedValue({
        data: { cached: true },
        fromCache: true,
      })

      fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
        Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
      )

      const result = await api.get('/dashboard/bundle')
      expect(result.fromCache).toBe(true)
      expect(result.offline).toBe(true)
    })

    it('lance une erreur quand GET AbortError et aucun cache', async () => {
      const offlineStore = await import('../../src/shared/offlineStore')
      offlineStore.offlineStore.getCached.mockResolvedValue(null)

      fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
        Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
      )

      await expect(api.get('/dashboard/bundle')).rejects.toThrow()
    })
  })

  describe('fallback AbortError → queue POST', () => {
    it('queue la mutation quand fetch rejette avec AbortError sur un POST', async () => {
      const offlineStore = await import('../../src/shared/offlineStore')
      offlineStore.offlineStore.enqueueRequest.mockResolvedValue(1)

      fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
        Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
      )

      const result = await api.post('/inventory/sessions', { product_id: 1, quantity: 10 })

      expect(result.queued).toBe(true)
      expect(result.offline).toBe(true)
      expect(offlineStore.offlineStore.enqueueRequest).toHaveBeenCalled()
    })
  })

  describe('pas de fallback pour les erreurs non-AbortError', () => {
    it('relance l erreur quand fetch rejette avec une erreur non-AbortError', async () => {
      fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
        new Error('Network failure')
      )

      await expect(api.get('/dashboard/bundle')).rejects.toThrow('Network failure')
    })
  })

  describe('fetch appelée avec signal quand timeout est actif', () => {
    it('passe un AbortSignal à fetch', async () => {
      fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: 'ok' })),
      })

      await api.get('/dashboard/bundle')

      expect(fetchSpy).toHaveBeenCalledOnce()
      const callArgs = fetchSpy.mock.calls[0]
      const options = callArgs[1]
      expect(options.signal).toBeDefined()
      expect(options.signal).toHaveProperty('aborted')
    })
  })
})