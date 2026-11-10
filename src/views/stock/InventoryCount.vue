<template>
  <div class="inv-shell">
    <header class="inv-header">
      <button class="inv-back" :title="t('common.back')" @click="router.push('/stock')">←</button>
      <div class="inv-header-main">
        <h2 class="inv-title">{{ t('stock.count.title') }}</h2>
        <div class="inv-subtitle">
          <template v-if="count">{{ t('stock.count.progress', { counted: summary.counted, total: summary.total }) }}</template>
          <template v-else>{{ t('stock.count.subtitle') }}</template>
        </div>
      </div>
      <button
        v-if="count"
        class="inv-icon-btn"
        :title="t('stock.barcode.scanButton')"
        :aria-label="t('stock.barcode.scanButton')"
        @click="scannerOpen = true"
      >📷</button>
    </header>

    <!-- ═══ Résultat après envoi ═══ -->
    <section v-if="result" class="cnt-result">
      <span class="cnt-result-icon">✅</span>
      <h3 class="cnt-result-title">{{ t('stock.count.doneTitle') }}</h3>
      <div class="cnt-stats">
        <div class="cnt-stat"><strong>{{ result.summary.counted }}</strong><span>{{ t('stock.count.statCounted') }}</span></div>
        <div class="cnt-stat"><strong>{{ result.summary.variances }}</strong><span>{{ t('stock.count.statVariances') }}</span></div>
        <div class="cnt-stat" :class="valueClass(result.summary.varianceValue)">
          <strong>{{ money(result.summary.varianceValue, true) }}</strong><span>{{ t('stock.count.statValue') }}</span>
        </div>
      </div>
      <p v-if="result.via === 'session'" class="cnt-note">{{ t('stock.count.sentAsSession') }}</p>
      <button class="inv-btn primary cnt-wide" @click="router.push('/stock')">{{ t('stock.count.backToStock') }}</button>
    </section>

    <!-- ═══ Avant le comptage ═══ -->
    <template v-else-if="!count">
      <div v-if="loading" class="inv-state"><span class="inv-spinner"></span><span>{{ t('common.loading') }}</span></div>
      <div v-else-if="error" class="inv-state inv-error">
        <p>⚠️ {{ error }}</p>
        <button class="btn-primary" @click="loadItems">{{ t('common.retry') }}</button>
      </div>
      <section v-else class="cnt-intro">
        <span class="cnt-intro-icon">🧮</span>
        <p class="cnt-intro-text">{{ t('stock.count.intro', { count: items.length }) }}</p>
        <ul class="cnt-intro-list">
          <li>🔒 {{ t('stock.count.introFreeze') }}</li>
          <li>📷 {{ t('stock.count.introScan') }}</li>
          <li>💾 {{ t('stock.count.introResume') }}</li>
        </ul>
        <button class="inv-btn primary cnt-wide" :disabled="starting || !items.length" @click="start">
          {{ starting ? t('common.loading') : t('stock.count.start') }}
        </button>
      </section>
    </template>

    <!-- ═══ Comptage en cours ═══ -->
    <template v-else>
      <div class="inv-banner">🔒 {{ t('stock.count.frozenSince', { time: startedTime }) }}</div>

      <div class="cnt-progress" role="progressbar" :aria-valuenow="summary.counted" :aria-valuemax="summary.total">
        <span :style="{ width: progressPct + '%' }"></span>
      </div>

      <input
        v-model="search"
        class="inv-search"
        type="search"
        :placeholder="t('stock.count.searchPlaceholder')"
        :aria-label="t('stock.count.searchPlaceholder')"
      />

      <div class="cnt-filters" role="radiogroup">
        <button
          v-for="f in FILTERS"
          :key="f"
          type="button" role="radio" class="inv-filter"
          :class="{ active: filter === f }" :aria-checked="filter === f"
          @click="filter = f"
        >{{ t(`stock.count.filters.${f}`) }} <span class="inv-count">{{ filterCounts[f] }}</span></button>
      </div>

      <div v-if="!visible.length" class="inv-state">
        <span class="inv-empty-icon">{{ filter === 'todo' ? '🎉' : '📭' }}</span>
        <p>{{ t(`stock.count.empty.${filter}`) }}</p>
      </div>

      <ul v-else class="inv-list">
        <li
          v-for="l in visible"
          :key="l.id"
          :ref="el => setRowRef(l.id, el)"
          class="inv-item cnt-item"
          :class="{ counted: l.counted != null, gap: l.variance, highlight: highlighted === l.id }"
        >
          <div class="inv-info">
            <span class="inv-name">{{ l.name }}</span>
            <span class="inv-meta">
              {{ t('stock.count.theoretical', { value: fmt(l.theoretical), unit: l.unit || '' }) }}
              <span v-if="l.variance" class="cnt-gap" :class="l.variance < 0 ? 'neg' : 'pos'">
                {{ t('stock.count.variance', { value: signed(l.variance) }) }}<template v-if="l.varianceValue != null"> · {{ money(l.varianceValue, true) }}</template>
              </span>
              <span v-else-if="l.counted != null" class="cnt-ok">✓</span>
            </span>
          </div>
          <button
            class="inv-step cnt-same"
            :title="t('stock.count.sameAsTheoretical')"
            :aria-label="t('stock.count.sameAsTheoretical')"
            @click="setValue(l, l.theoretical)"
          >=</button>
          <input
            :ref="el => setInputRef(l.id, el)"
            class="inv-qty-input cnt-input"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            :value="l.counted ?? ''"
            :placeholder="t('stock.count.realShort')"
            :aria-label="t('stock.count.real', { name: l.name })"
            @change="setValue(l, $event.target.value)"
            @keydown.enter.prevent="$event.target.blur()"
          />
        </li>
      </ul>

      <footer class="cnt-footer">
        <button class="inv-btn ghost" @click="confirmAbandon = true">{{ t('stock.count.abandon') }}</button>
        <button class="inv-btn primary" :disabled="!summary.counted" @click="confirmFinish = true">
          {{ t('stock.count.finish', { counted: summary.counted }) }}
        </button>
      </footer>
    </template>

    <div v-if="toast" class="inv-toast" role="status">{{ toast }}</div>

    <BarcodeScanner v-if="scannerOpen" @detected="onScanned" @close="scannerOpen = false" />

    <!-- ═══ Confirmation : résumé avant envoi ═══ -->
    <div v-if="confirmFinish" class="inv-overlay" @click.self="!finishing && (confirmFinish = false)">
      <div class="inv-sheet" role="dialog" aria-modal="true">
        <h3 class="inv-sheet-title">{{ t('stock.count.summaryTitle') }}</h3>
        <div class="cnt-stats">
          <div class="cnt-stat"><strong>{{ summary.counted }}</strong><span>{{ t('stock.count.statCounted') }}</span></div>
          <div class="cnt-stat"><strong>{{ summary.variances }}</strong><span>{{ t('stock.count.statVariances') }}</span></div>
          <div class="cnt-stat" :class="valueClass(summary.varianceValue)">
            <strong>{{ money(summary.varianceValue, true) }}</strong><span>{{ t('stock.count.statValue') }}</span>
          </div>
        </div>
        <p v-if="summary.lossValue || summary.gainValue" class="inv-sheet-meta">
          {{ t('stock.count.lossGain', { loss: money(summary.lossValue, true), gain: money(summary.gainValue, true) }) }}
        </p>
        <p v-if="summary.notCounted" class="inv-sheet-meta">⚠️ {{ t('stock.count.notCounted', { count: summary.notCounted }) }}</p>
        <p v-if="summary.unvalued" class="inv-sheet-meta">{{ t('stock.count.unvalued', { count: summary.unvalued }) }}</p>
        <p v-if="finishError" class="inv-form-error">⚠️ {{ finishError }}</p>
        <div class="inv-sheet-actions">
          <button class="inv-btn ghost" :disabled="finishing" @click="confirmFinish = false">{{ t('common.cancel') }}</button>
          <button class="inv-btn primary" :disabled="finishing" @click="finish">
            {{ finishing ? t('common.loading') : t('stock.count.send') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="confirmAbandon" class="inv-overlay" @click.self="confirmAbandon = false">
      <div class="inv-sheet" role="dialog" aria-modal="true">
        <h3 class="inv-sheet-title">{{ t('stock.count.abandonTitle') }}</h3>
        <p class="inv-sheet-meta">{{ t('stock.count.abandonText', { count: summary.counted }) }}</p>
        <div class="inv-sheet-actions">
          <button class="inv-btn ghost" @click="confirmAbandon = false">{{ t('common.cancel') }}</button>
          <button class="inv-btn danger" @click="abandon">{{ t('stock.count.abandonConfirm') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { fetchInventoryItems } from '../../shared/inventory'
import {
  getActiveCount, startCount, saveCount, setCounted, addCountItem, findByBarcode,
  countLines, summarizeCount, finishCount, abandonCount,
} from '../../shared/inventoryCount'
import { lookupBarcode } from '../../shared/barcode'
import BarcodeScanner from '../../components/BarcodeScanner.vue'
import { useI18n } from '../../i18n'

const FILTERS = ['all', 'todo', 'gaps']

const { t, intlLocale } = useI18n()
const router = useRouter()

const count = ref(getActiveCount())
const items = ref([])
const loading = ref(!count.value)
const error = ref(null)
const starting = ref(false)
const search = ref('')
const filter = ref('all')
const scannerOpen = ref(false)
const highlighted = ref(null)
const confirmFinish = ref(false)
const confirmAbandon = ref(false)
const finishing = ref(false)
const finishError = ref(null)
const result = ref(null)
const toast = ref(null)
let toastTimer = null
let highlightTimer = null

const lines = computed(() => (count.value ? countLines(count.value) : []))
const summary = computed(() => (count.value ? summarizeCount(count.value) : { counted: 0, total: 0 }))
const progressPct = computed(() => (summary.value.total ? Math.round((summary.value.counted / summary.value.total) * 100) : 0))
const startedTime = computed(() => (count.value
  ? new Date(count.value.startedAt).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
  : ''))

function matchesFilter(l, f) {
  if (f === 'todo') return l.counted == null
  if (f === 'gaps') return !!l.variance
  return true
}

const filterCounts = computed(() => Object.fromEntries(FILTERS.map(f => [f, lines.value.filter(l => matchesFilter(l, f)).length])))

const visible = computed(() => {
  const q = search.value.trim().toLocaleLowerCase()
  return lines.value
    .filter(l => matchesFilter(l, filter.value))
    .filter(l => !q
      || l.name.toLocaleLowerCase().includes(q)
      || (l.sku || '').toLocaleLowerCase().includes(q)
      || (l.barcode || '').includes(q))
    // Pas encore comptés d'abord, puis ordre alphabétique
    .sort((a, b) => Number(a.counted != null) - Number(b.counted != null) || a.name.localeCompare(b.name, intlLocale()))
})

function fmt(v) {
  return Number(v).toLocaleString(intlLocale(), { maximumFractionDigits: 3 })
}

function signed(v) {
  return `${v > 0 ? '+' : ''}${fmt(v)}`
}

function money(v, withSign = false) {
  const s = new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR' }).format(v || 0)
  return withSign && v > 0 ? `+${s}` : s
}

function valueClass(v) {
  return v < 0 ? 'neg' : v > 0 ? 'pos' : ''
}

function showToast(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3500)
}

async function loadItems() {
  loading.value = true
  error.value = null
  try {
    items.value = (await fetchInventoryItems()).items
  } catch (e) {
    error.value = e.message || t('common.errors.generic')
  } finally {
    loading.value = false
  }
}

async function start() {
  starting.value = true
  try {
    count.value = await startCount(items.value)
  } finally {
    starting.value = false
  }
}

function setValue(line, value) {
  if (!setCounted(count.value, line.id, value)) showToast(t('stock.items.invalidQuantity'))
}

/* ═══ Scan : le produit est mis en avant et sa saisie ouverte ═══ */
const rowEls = new Map()
const inputEls = new Map()
function setRowRef(id, el) { if (el) rowEls.set(id, el); else rowEls.delete(id) }
function setInputRef(id, el) { if (el) inputEls.set(id, el); else inputEls.delete(id) }

async function focusLine(id) {
  search.value = ''
  filter.value = 'all'
  highlighted.value = id
  clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => { highlighted.value = null }, 2500)
  await nextTick()
  rowEls.get(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  inputEls.get(id)?.focus()
}

async function onScanned(code) {
  scannerOpen.value = false
  let line = findByBarcode(count.value, code)
  if (!line) {
    try {
      const res = await lookupBarcode(code, count.value.items)
      if (res.status !== 'found') {
        showToast(t(res.status === 'offline' ? 'stock.barcode.offlineTitle' : 'stock.count.unknownCode', { code }))
        return
      }
      line = addCountItem(count.value, res.item)
    } catch (e) {
      showToast(t('stock.barcode.lookupError', { message: e?.message || '' }))
      return
    }
  }
  count.value.scanned[line.id] = true
  saveCount(count.value)
  focusLine(line.id)
}

async function finish() {
  finishing.value = true
  finishError.value = null
  try {
    result.value = await finishCount(count.value)
    count.value = null
    confirmFinish.value = false
  } catch (e) {
    finishError.value = e?.offline
      ? t('stock.count.errors.offline')
      : t('stock.count.errors.send', { message: e?.data?.detail || e?.message || '' })
  } finally {
    finishing.value = false
  }
}

async function abandon() {
  const state = count.value
  count.value = null
  confirmAbandon.value = false
  await abandonCount(state)
  showToast(t('stock.count.abandoned'))
  loadItems()
}

onMounted(() => { if (!count.value) loadItems() })
onBeforeUnmount(() => {
  clearTimeout(toastTimer)
  clearTimeout(highlightTimer)
})
</script>

<style scoped>
.inv-shell {
  display: flex; flex-direction: column; gap: 10px;
  min-height: 100dvh;
  padding: 0 12px calc(150px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14); color: var(--text, #fff);
}

.inv-header {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 10px;
  margin: 0 -12px; padding: 10px 12px;
  background: var(--nav-bg, #15152a); border-bottom: 1px solid var(--card-border, #2a2a40);
}
.inv-back, .inv-icon-btn {
  width: 38px; height: 38px; border-radius: 10px; font-size: 18px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}
.inv-header-main { flex: 1; min-width: 0; }
.inv-title { margin: 0; font-size: 18px; font-weight: 800; }
.inv-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); }

.inv-search {
  width: 100%; box-sizing: border-box; padding: 11px 14px; border-radius: 12px; font-size: 15px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}

.cnt-filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.inv-filter {
  padding: 10px 4px; border-radius: 12px; font-size: 13px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--muted, #8a8aa0);
}
.inv-filter.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.inv-count {
  display: inline-block; min-width: 18px; padding: 0 5px; margin-left: 4px; border-radius: 9px;
  font-size: 11px; background: rgba(0, 0, 0, 0.25);
}

.inv-banner {
  padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 700;
  color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.12);
}

.cnt-progress { height: 6px; border-radius: 3px; overflow: hidden; background: var(--card-border, #2a2a40); }
.cnt-progress span { display: block; height: 100%; background: var(--primary, #10b981); transition: width 0.2s; }

.inv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.inv-item {
  display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-radius: 14px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.cnt-item.counted { border-color: rgba(16, 185, 129, 0.45); }
.cnt-item.gap { border-color: rgba(245, 158, 11, 0.6); }
.cnt-item.highlight { border-color: var(--primary, #10b981); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3); }
.inv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.inv-name { font-size: 14px; font-weight: 700; line-height: 1.2; }
.inv-meta { font-size: 11px; color: var(--muted, #8a8aa0); }
.cnt-gap { margin-left: 4px; font-weight: 800; }
.cnt-gap.neg, .cnt-stat.neg strong { color: var(--danger, #ef4444); }
.cnt-gap.pos, .cnt-stat.pos strong { color: var(--amber, #f59e0b); }
.cnt-ok { margin-left: 4px; font-weight: 800; color: var(--primary, #10b981); }

.inv-step {
  width: 44px; height: 44px; border-radius: 12px; font-size: 20px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: rgba(255, 255, 255, 0.04); color: var(--text, #fff);
}
.inv-qty-input {
  width: 76px; height: 44px; box-sizing: border-box; padding: 0 6px; border-radius: 12px; text-align: center;
  font-size: 17px; font-weight: 800;
  border: 2px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.inv-qty-input:focus { border-color: var(--primary, #10b981); outline: none; }

.cnt-footer {
  position: fixed; left: 0; right: 0; bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 60;
  display: grid; grid-template-columns: 1fr 2fr; gap: 8px; padding: 10px 12px;
  background: var(--nav-bg, #15152a); border-top: 1px solid var(--card-border, #2a2a40);
}

.cnt-intro, .cnt-result {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 28px 8px; text-align: center;
}
.cnt-intro-icon, .cnt-result-icon { font-size: 48px; }
.cnt-intro-text { margin: 0; font-size: 15px; font-weight: 700; }
.cnt-intro-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; text-align: left; font-size: 13px; color: var(--muted, #8a8aa0); }
.cnt-result-title { margin: 0; font-size: 20px; font-weight: 800; }
.cnt-note { margin: 0; font-size: 12px; color: var(--muted, #8a8aa0); }
.cnt-wide { width: 100%; max-width: 420px; }

.cnt-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
.cnt-stat {
  display: flex; flex-direction: column; gap: 2px; padding: 12px 6px; border-radius: 12px; text-align: center;
  border: 1px solid var(--card-border, #2a2a40); background: rgba(255, 255, 255, 0.03);
}
.cnt-stat strong { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.cnt-stat span { font-size: 11px; color: var(--muted, #8a8aa0); }

.inv-state {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px 16px; text-align: center; color: var(--muted, #8a8aa0);
}
.inv-error { color: var(--danger, #ef4444); }
.inv-empty-icon { font-size: 40px; }
.inv-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.inv-overlay {
  position: fixed; inset: 0; z-index: 250; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.inv-sheet {
  width: 100%; max-width: 520px; max-height: 90dvh; overflow-y: auto; box-sizing: border-box;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0;
  background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
  display: flex; flex-direction: column; gap: 10px;
}
.inv-sheet-title { margin: 0; font-size: 18px; font-weight: 800; }
.inv-sheet-meta { margin: 0; font-size: 13px; color: var(--muted, #8a8aa0); }
.inv-sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.inv-btn {
  padding: 13px 10px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40);
}
.inv-btn.primary { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.inv-btn.ghost { background: none; color: var(--text, #fff); }
.inv-btn.danger { background: var(--danger, #ef4444); border-color: var(--danger, #ef4444); color: #fff; }
.inv-btn:disabled { opacity: 0.4; cursor: default; }
.inv-form-error { margin: 0; font-size: 13px; font-weight: 700; color: var(--danger, #ef4444); }

.inv-toast {
  position: fixed; left: 12px; right: 12px; bottom: calc(140px + env(safe-area-inset-bottom)); z-index: 100;
  padding: 12px 14px; border-radius: 12px; font-size: 13px; font-weight: 700;
  background: #111827; color: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
</style>
