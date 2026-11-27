/**
 * ScanQR.vue — unit tests
 * Tests: render, manual barcode lookup, QR table detection, error handling,
 *        offline fallback, result display with enriched fields
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

// ── Mock lookupBarcode from shared/barcode (hoisted automatically by vitest) ──
vi.mock('../../src/shared/barcode')

import { lookupBarcode } from '../../src/shared/barcode'
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

    it('appelle lookupBarcode avec le code saisi', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'found',
        item: { name: 'Coca-Cola 33cl', quantity: 48 },
      })
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => lookupBarcode.mock.calls.length > 0)
      const [code] = lookupBarcode.mock.calls[0]
      expect(code).toBe('3017620422003')
    })

    it('affiche le resultat du scan avec nom et quantite', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'found',
        item: { name: 'Coca-Cola 33cl', quantity: 48 },
      })
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

    it('affiche le SKU et l unite quand disponibles', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'found',
        item: { name: 'Bio Tomates', quantity: 12, sku: 'TOM-001', unit: 'kg' },
      })
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.scan-result').exists())
      expect(wrapper.text()).toContain('TOM-001')
      expect(wrapper.text()).toContain('kg')
    })

    it('affiche un note hors-liste quand le produit est connu mais pas en stock local', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'found',
        item: { name: 'Nouveau Produit', quantity: 0 },
        notInList: true,
      })
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.scan-result').exists())
      expect(wrapper.text()).toContain('pas encore dans votre stock local')
    })
  })

  describe('gestion d erreurs', () => {
    it('affiche un message si le code nest pas trouve (status unknown)', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'unknown',
        code: '999999999999',
      })
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('999999999999')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.error-msg').exists())
      expect(wrapper.text()).toContain('Aucun produit')
    })

    it('affiche un message hors-ligne (status offline)', async () => {
      lookupBarcode.mockResolvedValue({
        status: 'offline',
        code: '3017620422003',
      })
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('3017620422003')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitUntil(() => wrapper.find('.offline-banner').exists())
      expect(wrapper.text()).toContain('Hors ligne')
    })

    it('affiche un message generique en cas d erreur inattendue', async () => {
      lookupBarcode.mockRejectedValue(new Error('Erreur réseau'))
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
    it('ne fait pas d appel lookupBarcode pour un code table', async () => {
      const wrapper = mountComponent()
      await wrapper.vm.$nextTick()
      const input = wrapper.find('input[inputmode="numeric"]')
      await input.setValue('table:12')
      const form = wrapper.find('.manual-entry')
      await form.trigger('submit')
      await vi.waitFor(() => {
        expect(lookupBarcode.mock.calls.length).toBe(0)
      }, { timeout: 300 })
    })
  })
})