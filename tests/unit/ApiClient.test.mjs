/**
 * ApiClient — unit tests
 * Tests: timeout with AbortController, abort error handling,
 *        token in headers, establishment header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/shared/offlineStore')
vi.mock('../../src/i18n', () => ({
  t: (key) => key,
}))

import { api } from '../../src/shared/api'

// Helper: mock fetch qui respecte le signal AbortController
function makeFetchMock(response) {
  return vi.fn((_url, config) => {
    return new Promise((resolve, reject) => {
      if (config?.signal) {
        config.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      }
      if (response) {
        setTimeout(() => resolve(response), 0)
      }
    })
  })
}

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('timeout AbortController', () => {
    it('crée un AbortController et passe son signal à fetch', async () => {
      const fetchMock = makeFetchMock({ ok: true, status: 200, text: () => Promise.resolve('{}') })
      global.fetch = fetchMock

      await api.get('/dashboard/bundle')

      expect(fetchMock).toHaveBeenCalledOnce()
      const config = fetchMock.mock.calls[0][1]
      expect(config.signal).toBeInstanceOf(AbortSignal)
    })

    it('programme un timeout de 10 secondes via setTimeout', async () => {
      const fetchMock = makeFetchMock({ ok: true, status: 200, text: () => Promise.resolve('{}') })
      global.fetch = fetchMock

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
      await api.get('/dashboard/bundle')

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10_000)
      setTimeoutSpy.mockRestore()
    })

    it('annule le timeout quand la requête réussit', async () => {
      const fetchMock = makeFetchMock({ ok: true, status: 200, text: () => Promise.resolve('{}') })
      global.fetch = fetchMock

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      await api.get('/dashboard/bundle')

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })

    it('convertit une erreur AbortError en erreur timeout avec message i18n', async () => {
      const fetchMock = makeFetchMock(null)
      global.fetch = fetchMock

      // Simuler l'abort en interceptant le controller créé par api.request
      const originalAbortController = global.AbortController
      let capturedController = null
      global.AbortController = class extends originalAbortController {
        constructor() {
          super()
          capturedController = this
        }
      }

      const promise = api.get('/dashboard/bundle')
      // Déclencher l'abort manuellement pour simuler le timeout
      capturedController?.abort()

      await expect(promise).rejects.toThrow()
      const error = await promise.catch(e => e)
      expect(error.message).toBe('common.errors.timeout')

      global.AbortController = originalAbortController
    })
  })

  describe('request method', () => {
    it('appelle fetch avec la bonne URL et method', async () => {
      const fetchMock = makeFetchMock({ ok: true, status: 200, text: () => Promise.resolve('{}') })
      global.fetch = fetchMock

      await api.get('/products')

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/products',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('inclut le header Authorization avec le token', async () => {
      localStorage.setItem('tipsmana_token', JSON.stringify({
        access_token: 'test-token',
        establishment_id: 1,
        expires_at: Date.now() + 3600000,
      }))

      const fetchMock = makeFetchMock({ ok: true, status: 200, text: () => Promise.resolve('{}') })
      global.fetch = fetchMock

      await api.get('/dashboard/bundle')

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers['Authorization']).toBe('Bearer test-token')
    })

    it('inclut le header X-Establishment-ID', async () => {
      localStorage.setItem('tipsmana_token', JSON.stringify({
        access_token: 'test-token',
        establishment_id: 42,
        expires_at: Date.now() + 3600000,
      }))

      const fetchMock = makeFetchMock({ ok: true, status: 200, text: () => Promise.resolve('{}') })
      global.fetch = fetchMock

      await api.get('/dashboard/bundle')

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers['X-Establishment-ID']).toBe(42)
    })
  })
})