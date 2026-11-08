/**
 * Multi-langue (i18n maison), indicateurs de statut des tables, routes lazy
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import fs from 'node:fs'
import path from 'node:path'

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getEstablishmentId: vi.fn(() => 'est-1'),
  getToken: vi.fn(() => 'tok'),
  baseUrl: '/api/v1',
}))
vi.mock('../../src/shared/api', () => ({ default: mockApi, api: mockApi }))

import { t, setLocale, initI18n, getSavedLocale, LOCALE_KEY, LOCALES, intlLocale } from '../../src/i18n'
import TableSelect from '../../src/views/service/TableSelect.vue'
import LanguageSwitcher from '../../src/components/LanguageSwitcher.vue'

const LOCALES_DIR = path.resolve(__dirname, '../../src/i18n/locales')

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  )
}

function readCatalog(lang) {
  const out = {}
  for (const file of fs.readdirSync(path.join(LOCALES_DIR, lang))) {
    Object.assign(out, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang, file), 'utf8')))
  }
  return out
}

beforeEach(async () => {
  localStorage.clear()
  await setLocale('fr', { persist: false })
})

// ── Catalogues ─────────────────────────────────────────

describe('catalogues de traduction', () => {
  it('fr, en et es ont exactement les mêmes fichiers et les mêmes clés', () => {
    const files = lang => fs.readdirSync(path.join(LOCALES_DIR, lang)).sort()
    expect(files('en')).toEqual(files('fr'))
    expect(files('es')).toEqual(files('fr'))
    const fr = flatKeys(readCatalog('fr')).sort()
    expect(fr.length).toBeGreaterThan(300)
    for (const lang of ['en', 'es']) {
      const keys = flatKeys(readCatalog(lang)).sort()
      expect(keys.filter(k => !fr.includes(k)), `${lang}: clés en trop`).toEqual([])
      expect(fr.filter(k => !keys.includes(k)), `${lang}: clés manquantes`).toEqual([])
    }
  })

  it('chaque fichier a pour clé racine son namespace', () => {
    for (const lang of LOCALES.map(l => l.code)) {
      for (const file of fs.readdirSync(path.join(LOCALES_DIR, lang))) {
        const json = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang, file), 'utf8'))
        expect(Object.keys(json)).toEqual([file.replace('.json', '')])
      }
    }
  })

  it('les variables {x} sont les mêmes dans les trois langues', () => {
    const fr = readCatalog('fr')
    const get = (cat, key) => key.split('.').reduce((n, p) => n?.[p], cat)
    const vars = s => [...new Set(s.match(/\{\w+\}/g) || [])].sort()
    for (const lang of ['en', 'es']) {
      const cat = readCatalog(lang)
      for (const key of flatKeys(fr)) {
        expect(vars(get(cat, key)), `${lang}:${key}`).toEqual(vars(get(fr, key)))
      }
    }
  })
})

// ── Moteur t() ─────────────────────────────────────────

describe('t()', () => {
  it('traduit, interpole et gère le pluriel selon la langue', async () => {
    expect(t('common.table', { number: 7 })).toBe('Table 7')
    expect(t('common.items', { count: 0 })).toBe('0 article')
    expect(t('common.items', { count: 2 })).toBe('2 articles')
    await setLocale('en', { persist: false })
    expect(t('common.nav.cuisine')).toBe('Kitchen')
    expect(t('common.items', { count: 0 })).toBe('0 items')
    expect(t('common.items', { count: 1 })).toBe('1 item')
    await setLocale('es', { persist: false })
    expect(t('common.table', { number: 7 })).toBe('Mesa 7')
    expect(intlLocale()).toBe('es-ES')
  })

  it('renvoie la clé si elle est inconnue', () => {
    expect(t('nope.missing')).toBe('nope.missing')
  })

  it('mémorise le choix en localStorage et le relit au démarrage', async () => {
    await setLocale('en')
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    await setLocale('fr', { persist: false })
    expect(await initI18n()).toBe('en')
    expect(t('common.nav.alerts')).toBe('Alerts')
  })

  it('langue inconnue ou stockage vide → français', async () => {
    expect(getSavedLocale()).toBe('fr')
    localStorage.setItem(LOCALE_KEY, 'de')
    expect(getSavedLocale()).toBe('fr')
    expect(await setLocale('de', { persist: false })).toBe('fr')
  })
})

describe('LanguageSwitcher.vue', () => {
  it('change la langue de l\'app et la mémorise', async () => {
    const wrapper = mount(LanguageSwitcher)
    const buttons = wrapper.findAll('.lang-btn')
    expect(buttons.map(b => b.text())).toEqual(['🇫🇷Français', '🇬🇧English', '🇪🇸Español'])
    expect(buttons[0].classes()).toContain('active')
    await buttons[2].trigger('click')
    await flushPromises()
    expect(localStorage.getItem(LOCALE_KEY)).toBe('es')
    expect(wrapper.findAll('.lang-btn')[2].classes()).toContain('active')
    expect(t('common.logout')).toBe('Cerrar sesión')
  })
})

// ── TableSelect : statuts ──────────────────────────────

function apiTicket(table) {
  return {
    id: `t-${table}`, table_number: table, status: 'open', total_ttc: '12.00', covers: 2,
    items: [{ id: `i-${table}`, item_name: 'Café', quantity: 1, unit_price_ttc: '12.00', vat_rate: '10.00', course: 'plat' }],
  }
}

const SPACES = [{
  id: 's1', name: 'Salle',
  tables: [
    { number: 1, state: 'libre' },
    { number: 2, state: 'occupée' },
    { number: 3, state: 'réservée' },
    { number: 4, state: 'addition' },
    { number: 5, state: 'libre' },
  ],
}]

async function mountTables() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/service', name: 'Service', component: TableSelect },
      { path: '/service/history', name: 'ServiceHistory', component: { template: '<div />' } },
      { path: '/service/profile', name: 'ServiceProfile', component: { template: '<div />' } },
      { path: '/service/table/:number(\\d+)', name: 'ServiceOrder', component: { template: '<div />' } },
    ],
  })
  router.push('/service')
  await router.isReady()
  const wrapper = mount(TableSelect, { global: { plugins: [router, createPinia()] } })
  await flushPromises()
  return wrapper
}

describe('TableSelect.vue — indicateurs de statut', () => {
  let spaces
  beforeEach(() => {
    setActivePinia(createPinia())
    spaces = structuredClone(SPACES)
    mockApi.get.mockReset()
    mockApi.get.mockImplementation(async (p) => {
      if (p === '/floorplan/spaces') return { success: true, data: spaces }
      if (p === '/table-tickets/list') return { success: true, data: [apiTicket(2)] }
      throw new Error('unexpected ' + p)
    })
  })
  afterEach(() => vi.useRealTimers())

  it('badge + couleur par statut : libre, occupée, réservée, en attente', async () => {
    const wrapper = await mountTables()
    const tables = wrapper.findAll('.svc-table')
    expect(tables.map(t => t.classes().find(c => c.startsWith('state-')))).toEqual(
      ['state-libre', 'state-occupee', 'state-reservee', 'state-addition', 'state-libre']
    )
    expect(tables.map(t => t.find('.svc-table-badge').text())).toEqual(['🟢', '🔴', '🟡', '⚪', '🟢'])
    expect(tables.map(t => t.find('.svc-table-state').text())).toEqual(['Libre', 'Occupée', 'Réservée', 'En attente', 'Libre'])
    const legend = wrapper.find('.svc-legend').text()
    expect(legend).toContain('🟢 Libre 2')
    expect(legend).toContain('🔴 Occupée 1')
    expect(legend).toContain('🟡 Réservée 1')
    expect(legend).toContain('⚪ En attente 1')
  })

  it('« Masquer les tables libres » filtre la grille et est mémorisé', async () => {
    const wrapper = await mountTables()
    await wrapper.find('.svc-hide-free-input').setValue(true)
    expect(wrapper.findAll('.svc-table').map(t => t.find('.svc-table-num').text())).toEqual(['2', '3', '4'])
    expect(localStorage.getItem('tipsmana_hide_free_tables')).toBe('1')
    wrapper.unmount()
    const again = await mountTables()
    expect(again.find('.svc-hide-free-input').element.checked).toBe(true)
    expect(again.findAll('.svc-table')).toHaveLength(3)
  })

  it('tout est libre et masqué → message dédié', async () => {
    mockApi.get.mockImplementation(async (p) => {
      if (p === '/floorplan/spaces') return { success: true, data: [{ id: 's', tables: [{ number: 1 }] }] }
      return { success: true, data: [] }
    })
    localStorage.setItem('tipsmana_hide_free_tables', '1')
    const wrapper = await mountTables()
    expect(wrapper.findAll('.svc-table')).toHaveLength(0)
    expect(wrapper.text()).toContain('les tables libres sont masquées')
  })

  it('mise à jour en temps réel : nouveau statut après 30 s de polling', async () => {
    vi.useFakeTimers()
    const wrapper = await mountTables()
    expect(wrapper.findAll('.svc-table')[0].classes()).toContain('state-libre')
    spaces[0].tables[0].state = 'addition'
    const calls = mockApi.get.mock.calls.length
    await vi.advanceTimersByTimeAsync(29000)
    expect(mockApi.get.mock.calls.length).toBe(calls)
    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(mockApi.get.mock.calls.length).toBeGreaterThan(calls)
    expect(wrapper.findAll('.svc-table')[0].classes()).toContain('state-addition')
    wrapper.unmount()
  })

  it('libellés traduits quand la langue change', async () => {
    const wrapper = await mountTables()
    await setLocale('en', { persist: false })
    await flushPromises()
    expect(wrapper.findAll('.svc-table-state').map(s => s.text())).toEqual(['Free', 'Occupied', 'Reserved', 'Waiting', 'Free'])
    expect(wrapper.find('.svc-hide-free').text()).toBe('Hide free tables')
    await setLocale('es', { persist: false })
    await flushPromises()
    expect(wrapper.find('.svc-table-state').text()).toBe('Libre')
    expect(wrapper.findAll('.svc-table-state')[3].text()).toBe('En espera')
  })
})

// ── Routes lazy ────────────────────────────────────────

describe('router — chargement à la demande', () => {
  it('toutes les routes avec composant utilisent import() dynamique', async () => {
    const { default: router } = await import('../../src/router')
    const withComponent = router.getRoutes().filter(r => r.components?.default)
    expect(withComponent.length).toBeGreaterThan(15)
    for (const r of withComponent) {
      expect(typeof r.components.default, r.path).toBe('function')
      expect(r.components.default.toString(), r.path).toMatch(/import\(|dynamic_import/)
    }
  })

  it('les titres de route sont des clés i18n', async () => {
    const { default: router } = await import('../../src/router')
    for (const r of router.getRoutes().filter(x => x.meta.titleKey)) {
      expect(t(r.meta.titleKey), r.path).not.toBe(r.meta.titleKey)
    }
  })
})
