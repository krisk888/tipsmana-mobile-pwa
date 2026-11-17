/**
 * api.js — offline mode array response
 * Tests that cached array responses stay arrays when served offline,
 * not spread into plain objects that break Array.isArray() checks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../../src/shared/api'

vi.mock('../../src/shared/offlineStore')
vi.mock('../../src/shared/auth', () => ({
  loadToken: vi.fn(() => ({ access_token: 'tok', establishment_id: 'est-1' })),
}))

describe('api.js — offline array response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('offline GET with cached array returns an array (not spread object)', async () => {
    const cached = [{ id: 1, name: 'Product A' }, { id: 2, name: 'Product B' }]
    const { offlineStore } = await import('../../src/shared/offlineStore')
    offlineStore.getCached.mockResolvedValue(cached)
    offlineStore.flushToServer.mockResolvedValue({ synced: 0, failed: 0 })

    // Force offline
    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    try {
      const res = await api.get('/products')
      // The response must be array-like so unwrapList() works
      expect(Array.isArray(res)).toBe(true)
      expect(res).toHaveLength(2)
      expect(res[0]).toEqual(cached[0])
      expect(res.offline).toBe(true)
      expect(res.fromCache).toBe(true)
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
    }
  })

  it('offline GET with cached object preserves object shape', async () => {
    const cached = { data: { items: [] }, total: 0 }
    const { offlineStore } = await import('../../src/shared/offlineStore')
    offlineStore.getCached.mockResolvedValue(cached)
    offlineStore.flushToServer.mockResolvedValue({ synced: 0, failed: 0 })

    const originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    try {
      const res = await api.get('/dashboard/bundle')
      expect(Array.isArray(res)).toBe(false)
      expect(res.data).toEqual(cached.data)
      expect(res.offline).toBe(true)
      expect(res.fromCache).toBe(true)
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
    }
  })
})
