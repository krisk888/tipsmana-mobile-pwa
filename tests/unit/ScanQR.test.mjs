/**
 * ScanQR.vue — unit tests
 * Tests: render, manual barcode lookup, QR table detection, error handling, result display
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Mock the shared api module (hoisted automatically by vitest) ──────────
vi.mock('../../src/shared/api')

import { api } from '../../src/shared/api'
import ScanQRView from '../../src/views/stock/ScanQR.vue'

// ── Router helper ──────────────────────────────────────────────────────────
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/caisse', name: 'Caisse' }],
})

function mountComponent() {
  return mount(ScanQRView, {
    global: { plugins: [router] },
  })
}

describe('ScanQR.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({
      data: {
        product: { name: 'Coca-Cola 33cl' },
        theoretical_stock: 48,
      },
    })
  })

  describe('rendu', () => {
    it('affiche le titre de la page', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('📷')
      expect(wrapper.text()).toContain('Scanner')
    })

    it('affiche le formulaire de saisie manuelle', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      expect(input.exists()).toBe(true)
      expect(input.attributes('placeholder')).toContain('saisir')
    })

    it('affiche le bouton douverture de la camera', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const btn = wrapper.find('.btn-camera')
      expect(btn.exists()).toBe(true)
      // Note: the component uses "Ouvrir la caméra" with accent
      expect(btn.text()).toContain('Ouvrir la cam')
    })
  })

  describe('lookup manuel', () => {
    it('desactive le bouton OK quand le champ est vide', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const btn = wrapper.find('.manual-entry button[type="submit"]')
      expect(btn.attributes('disabled')).toBe('')
    })

    it('appelle /inventory/barcode/lookup avec le code saisi', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => api.get.mock.calls.length > 0)
      const [url] = api.get.mock.calls[0]
      expect(url).toContain('/inventory/barcode/lookup')
      expect(url).toContain('3017620422003')
    })

    it('affiche le resultat du scan', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.scan-result').exists())
      expect(wrapper.text()).toContain('Coca-Cola 33cl')
      expect(wrapper.text()).toContain('48')
      expect(wrapper.text()).toContain('3017620422003')
    })
  })

  describe('gestion d erreurs', () => {
    it('affiche un message si le code nest pas trouve (404)', async () => {
      const err = new Error('Not Found')
      err.status = 404
      api.get.mockRejectedValue(err)
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('999999999999')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.error-msg').exists())
      expect(wrapper.text()).toContain('Aucun produit')
    })

    it('affiche un message generique en cas d erreur reseau', async () => {
      api.get.mockRejectedValue(new Error('Erreur réseau'))
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.error-msg').exists())
      expect(wrapper.text()).toContain('Erreur')
    })
  })

  describe('QR table detection', () => {
    it('ne fait pas d appel API pour un code table', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('table:12')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      // Small delay to ensure async operations settle
      await vi.waitFor(() => {
        expect(api.get.mock.calls.length).toBe(0)
      }, { timeout: 300 })
    })
  })
})