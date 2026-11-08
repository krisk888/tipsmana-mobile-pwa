<template>
  <div class="inv-shell">
    <header class="inv-header">
      <button class="inv-back" :title="t('common.back')" @click="router.push('/stock')">←</button>
      <div class="inv-header-main">
        <h2 class="inv-title">{{ t('stock.items.title') }}</h2>
        <div class="inv-subtitle">
          {{ t('stock.items.subtitle', { count: items.length }) }}
          <template v-if="fallback"> · {{ t('stock.items.theoretical') }}</template>
        </div>
      </div>
      <button class="inv-icon-btn" :title="t('stock.barcode.scanButton')" :aria-label="t('stock.barcode.scanButton')" @click="openScanner">📷</button>
      <button class="inv-icon-btn" :disabled="loading" :title="t('common.refresh')" @click="load">⟳</button>
    </header>

    <input
      v-model="search"
      class="inv-search"
      type="search"
      :placeholder="t('stock.items.searchPlaceholder')"
      :aria-label="t('stock.items.searchPlaceholder')"
    />

    <div class="inv-filters" role="radiogroup">
      <button
        type="button" role="radio" class="inv-filter"
        :class="{ active: !lowOnly }" :aria-checked="!lowOnly"
        @click="lowOnly = false"
      >{{ t('stock.items.filterAll') }} <span class="inv-count">{{ items.length }}</span></button>
      <button
        type="button" role="radio" class="inv-filter low"
        :class="{ active: lowOnly }" :aria-checked="lowOnly"
        @click="lowOnly = true"
      >⚠️ {{ t('stock.items.filterLow') }} <span class="inv-count">{{ lowCount }}</span></button>
    </div>

    <div v-if="fromCache" class="inv-banner">📴 {{ t('stock.items.fromCache') }}</div>

    <div v-if="loading && !items.length" class="inv-state">
      <span class="inv-spinner"></span>
      <span>{{ t('common.loading') }}</span>
    </div>
    <div v-else-if="error && !items.length" class="inv-state inv-error">
      <p>⚠️ {{ error }}</p>
      <button class="btn-primary" @click="load">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="!visible.length" class="inv-state">
      <span class="inv-empty-icon">{{ lowOnly ? '✅' : '📭' }}</span>
      <p>{{ lowOnly ? t('stock.items.noLow') : t('stock.items.empty') }}</p>
    </div>

    <ul v-else class="inv-list">
      <li v-for="i in visible" :key="i.id" class="inv-item" :class="{ low: isLowStock(i) }">
        <div class="inv-info">
          <span class="inv-name">{{ i.name }}</span>
          <span class="inv-meta">
            <span v-if="isLowStock(i)" class="inv-badge">{{ t('stock.items.lowBadge') }}</span>
            <template v-if="i.threshold != null">{{ t('stock.items.threshold', { value: fmt(i.threshold), unit: i.unit || '' }) }}</template>
            <template v-else>{{ t('stock.items.noThreshold') }}</template>
            <span v-if="syncing[i.id]" class="inv-sync">· {{ t(`stock.items.${syncing[i.id]}`) }}</span>
          </span>
        </div>

        <div class="inv-adjust">
          <button
            class="inv-step"
            :aria-label="t('stock.items.decrease', { name: i.name })"
            :disabled="i.quantity <= 0"
            @click="step(i, -1)"
          >−</button>

          <input
            v-if="editing === i.id"
            :ref="el => { if (el) editInput = el }"
            v-model="editValue"
            class="inv-qty-input"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            :aria-label="t('stock.items.manualEntry', { name: i.name })"
            @keydown.enter.prevent="commitEdit(i)"
            @keydown.esc="editing = null"
            @blur="commitEdit(i)"
          />
          <button
            v-else
            class="inv-qty"
            :title="t('stock.items.manualEntry', { name: i.name })"
            @click="startEdit(i)"
          >
            <span class="inv-qty-value">{{ fmt(i.quantity) }}</span>
            <span v-if="i.unit" class="inv-qty-unit">{{ i.unit }}</span>
          </button>

          <button
            class="inv-step"
            :aria-label="t('stock.items.increase', { name: i.name })"
            @click="step(i, 1)"
          >+</button>
        </div>
      </li>
    </ul>

    <div v-if="toast" class="inv-toast" role="status">{{ toast }}</div>

    <BarcodeScanner v-if="scannerOpen" @detected="onScanned" @close="scannerOpen = false" />

    <!-- ═══ Résultat du scan : produit / inconnu / création ═══ -->
    <div v-if="scan" class="inv-overlay" @click.self="scan = null">
      <div class="inv-sheet" role="dialog" aria-modal="true">
        <div class="inv-sheet-header">
          <span class="inv-sheet-code">▥ {{ scan.code }}</span>
          <button class="inv-sheet-close" :aria-label="t('common.close')" @click="scan = null">✕</button>
        </div>

        <div v-if="scan.state === 'looking'" class="inv-state"><span class="inv-spinner"></span></div>

        <template v-else-if="scan.state === 'found'">
          <h3 class="inv-sheet-title">{{ scan.item.name }}</h3>
          <p class="inv-sheet-meta">
            {{ t('stock.barcode.inStock', { value: fmt(scan.item.quantity), unit: scan.item.unit || '' }) }}
            <span v-if="isLowStock(scan.item)" class="inv-badge">{{ t('stock.items.lowBadge') }}</span>
          </p>
          <label class="inv-field-label" for="inv-scan-qty">{{ t('stock.barcode.quantity') }}</label>
          <div class="inv-adjust inv-sheet-qty">
            <button class="inv-step" :aria-label="t('stock.barcode.less')" @click="bumpScanQty(-1)">−</button>
            <input id="inv-scan-qty" v-model="scan.qty" class="inv-qty-input" type="number" inputmode="decimal" min="0" step="any" />
            <button class="inv-step" :aria-label="t('stock.barcode.more')" @click="bumpScanQty(1)">+</button>
          </div>
          <div class="inv-sheet-actions">
            <button class="inv-btn ghost" :disabled="!scanQtyValid || scanQty > scan.item.quantity" @click="applyScan(-1)">
              {{ t('stock.barcode.remove', { qty: fmt(scanQty) }) }}
            </button>
            <button class="inv-btn primary" :disabled="!scanQtyValid" @click="applyScan(1)">
              {{ t('stock.barcode.add', { qty: fmt(scanQty) }) }}
            </button>
          </div>
        </template>

        <template v-else-if="scan.state === 'unknown' || scan.state === 'offline'">
          <h3 class="inv-sheet-title">{{ t(`stock.barcode.${scan.state}Title`) }}</h3>
          <p class="inv-sheet-meta">{{ t(`stock.barcode.${scan.state}Text`) }}</p>
          <div class="inv-sheet-actions">
            <button class="inv-btn ghost" @click="openScanner">{{ t('stock.barcode.rescan') }}</button>
            <button v-if="scan.state === 'unknown'" class="inv-btn primary" @click="startCreate">{{ t('stock.barcode.addToStock') }}</button>
          </div>
        </template>

        <form v-else-if="scan.state === 'create'" class="inv-form" @submit.prevent="submitCreate">
          <h3 class="inv-sheet-title">{{ t('stock.barcode.createTitle') }}</h3>
          <label class="inv-field-label">{{ t('stock.barcode.fields.barcode') }}
            <input v-model="scan.form.barcode" class="inv-field" inputmode="numeric" required />
          </label>
          <label class="inv-field-label">{{ t('stock.barcode.fields.name') }}
            <input v-model="scan.form.name" class="inv-field" required maxlength="200" />
          </label>
          <div class="inv-form-row">
            <label class="inv-field-label">{{ t('stock.barcode.fields.quantity') }}
              <input v-model="scan.form.quantity" class="inv-field" type="number" inputmode="decimal" min="0" step="any" required />
            </label>
            <label class="inv-field-label">{{ t('stock.barcode.fields.unit') }}
              <select v-model="scan.form.unitId" class="inv-field" required :disabled="!scan.options">
                <option v-for="u in scan.options?.units || []" :key="u.id" :value="u.id">{{ u.label }}</option>
              </select>
            </label>
          </div>
          <div class="inv-form-row">
            <label class="inv-field-label">{{ t('stock.barcode.fields.price') }}
              <input v-model="scan.form.price" class="inv-field" type="number" inputmode="decimal" min="0.01" step="0.01" required />
            </label>
            <label class="inv-field-label">{{ t('stock.barcode.fields.taxRate') }}
              <select v-model="scan.form.taxRateId" class="inv-field" required :disabled="!scan.options">
                <option v-for="r in scan.options?.taxRates || []" :key="r.id" :value="r.id">{{ r.label }}</option>
              </select>
            </label>
          </div>
          <label class="inv-field-label">{{ t('stock.barcode.fields.section') }}
            <select v-model="scan.form.section" class="inv-field">
              <option value="kitchen">{{ t('stock.express.sections.kitchen') }}</option>
              <option value="dining_room">{{ t('stock.express.sections.dining_room') }}</option>
            </select>
          </label>
          <p v-if="scan.error" class="inv-form-error">⚠️ {{ scan.error }}</p>
          <div class="inv-sheet-actions">
            <button type="button" class="inv-btn ghost" @click="scan.state = 'unknown'">{{ t('common.cancel') }}</button>
            <button type="submit" class="inv-btn primary" :disabled="scan.busy || !scan.options">
              {{ scan.busy ? t('common.loading') : t('stock.barcode.create') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  fetchInventoryItems, createAdjuster, filterItems, isLowStock, roundQty,
} from '../../shared/inventory'
import { lookupBarcode, fetchProductFormOptions, createStockProduct, isNumericBarcode } from '../../shared/barcode'
import BarcodeScanner from '../../components/BarcodeScanner.vue'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()
const router = useRouter()
const route = useRoute()

const items = ref([])
const loading = ref(true)
const error = ref(null)
const fromCache = ref(false)
const fallback = ref(false)
const search = ref('')
const lowOnly = ref(false)
const editing = ref(null)
const editValue = ref('')
let editInput = null
// id → 'pending' (envoi en cours) | 'queued' (hors-ligne, en file)
const syncing = reactive({})
const toast = ref(null)
let toastTimer = null

const visible = computed(() => filterItems(items.value, { lowOnly: lowOnly.value, search: search.value }))
const lowCount = computed(() => items.value.filter(isLowStock).length)

const adjuster = createAdjuster({
  onDone(item, delta, res) {
    if (adjuster.pendingDelta(item.id)) return // d'autres taps attendent leur envoi
    if (res?.queued) syncing[item.id] = 'queued'
    else delete syncing[item.id]
  },
  onError(item, delta, e) {
    // Échec serveur : on revient à la quantité d'avant les taps
    const current = items.value.find(i => i.id === item.id)
    if (current) current.quantity = roundQty(current.quantity - delta)
    delete syncing[item.id]
    showToast(t('stock.items.adjustError', { name: item.name, message: e?.message || '' }))
  },
})

function fmt(v) {
  return Number(v).toLocaleString(intlLocale(), { maximumFractionDigits: 3 })
}

function showToast(text) {
  toast.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3500)
}

async function load() {
  loading.value = true
  error.value = null
  // Ajustements en attente envoyés avant de relire le stock
  await adjuster.flush()
  try {
    const res = await fetchInventoryItems()
    items.value = res.items
    fromCache.value = res.fromCache
    fallback.value = res.fallback
  } catch (e) {
    error.value = e.message || t('common.errors.generic')
  } finally {
    loading.value = false
  }
}

function applyDelta(item, delta) {
  if (!delta) return
  item.quantity = roundQty(item.quantity + delta)
  syncing[item.id] = 'pending'
  adjuster.push(item, delta)
}

function step(item, delta) {
  if (delta < 0 && item.quantity + delta < 0) return
  applyDelta(item, delta)
}

async function startEdit(item) {
  editing.value = item.id
  editValue.value = String(item.quantity)
  await nextTick()
  editInput?.focus()
  editInput?.select()
}

function commitEdit(item) {
  if (editing.value !== item.id) return
  editing.value = null
  const raw = String(editValue.value).replace(',', '.').trim()
  const target = Number(raw)
  if (raw === '' || !Number.isFinite(target) || target < 0) {
    if (raw !== '') showToast(t('stock.items.invalidQuantity'))
    return
  }
  applyDelta(item, roundQty(target - item.quantity))
}

/* ═══ Scan code-barres ═══ */
const scannerOpen = ref(false)
// { state: looking | found | unknown | offline | create, code, item?, qty?, form?, options?, busy?, error? }
const scan = ref(null)

const scanQty = computed(() => Number(String(scan.value?.qty ?? '').replace(',', '.')))
const scanQtyValid = computed(() => Number.isFinite(scanQty.value) && scanQty.value > 0)

function openScanner() {
  scan.value = null
  scannerOpen.value = true
}

async function onScanned(code) {
  scannerOpen.value = false
  scan.value = { state: 'looking', code }
  try {
    const res = await lookupBarcode(code, items.value)
    if (scan.value?.code !== code) return
    if (res.status === 'found') {
      let item = res.item
      // Produit sans stock encore enregistré : ajouté à la liste
      if (res.notInList) {
        items.value.push(item)
        item = items.value[items.value.length - 1]
      }
      scan.value = { state: 'found', code, item, qty: '1' }
    } else {
      scan.value = { state: res.status, code }
    }
  } catch (e) {
    scan.value = null
    showToast(t('stock.barcode.lookupError', { message: e?.message || '' }))
  }
}

function bumpScanQty(delta) {
  const next = roundQty((scanQtyValid.value ? scanQty.value : 0) + delta)
  scan.value.qty = String(Math.max(1, next))
}

function applyScan(sign) {
  const s = scan.value
  if (!s?.item || !scanQtyValid.value) return
  const delta = roundQty(sign * scanQty.value)
  if (delta < 0 && s.item.quantity + delta < 0) return
  applyDelta(s.item, delta)
  showToast(t(sign > 0 ? 'stock.barcode.added' : 'stock.barcode.removed', { qty: fmt(Math.abs(delta)), name: s.item.name }))
  scan.value = null
}

async function startCreate() {
  const code = scan.value.code
  scan.value = {
    state: 'create',
    code,
    options: null,
    busy: false,
    error: null,
    form: { barcode: code, name: '', quantity: '1', unitId: '', taxRateId: '', price: '', section: 'kitchen' },
  }
  try {
    const options = await fetchProductFormOptions()
    if (scan.value?.state !== 'create' || scan.value.code !== code) return
    scan.value.options = options
    scan.value.form.unitId = options.units[0]?.id || ''
    scan.value.form.taxRateId = (options.taxRates.find(r => r.isDefault) || options.taxRates[0])?.id || ''
    if (!options.units.length || !options.taxRates.length) scan.value.error = t('stock.barcode.errors.noOptions')
  } catch (e) {
    if (scan.value?.state === 'create') scan.value.error = t('stock.barcode.errors.options', { message: e?.message || '' })
  }
}

async function submitCreate() {
  const s = scan.value
  const f = s.form
  const barcode = String(f.barcode).replace(/\s+/g, '')
  if (!isNumericBarcode(barcode)) { s.error = t('stock.barcode.errors.barcode'); return }
  const quantity = Number(String(f.quantity).replace(',', '.'))
  const price = Number(String(f.price).replace(',', '.'))
  if (!Number.isFinite(quantity) || quantity < 0) { s.error = t('stock.items.invalidQuantity'); return }
  if (!Number.isFinite(price) || price <= 0) { s.error = t('stock.barcode.errors.price'); return }
  s.busy = true
  s.error = null
  try {
    const unit = s.options.units.find(u => u.id === f.unitId)?.abbreviation || null
    const { item, queued } = await createStockProduct({
      name: f.name, barcode, unitId: f.unitId, taxRateId: f.taxRateId, price, section: f.section, quantity, unit,
    })
    items.value.push(item)
    if (queued) syncing[item.id] = 'queued'
    scan.value = null
    showToast(t('stock.barcode.created', { name: item.name }))
  } catch (e) {
    s.error = e?.offline ? t('stock.barcode.errors.offline') : (e?.data?.detail?.[0]?.msg || e?.data?.message || e?.message || t('common.errors.generic'))
  } finally {
    s.busy = false
  }
}

onMounted(async () => {
  await load()
  // Lien direct /stock/inventory?scan=1 : scanner ouvert d'emblée
  if (route?.query?.scan) openScanner()
})
onBeforeUnmount(() => {
  adjuster.flush()
  clearTimeout(toastTimer)
})
</script>

<style scoped>
.inv-shell {
  display: flex; flex-direction: column; gap: 10px;
  min-height: 100dvh;
  padding: 0 12px calc(90px + env(safe-area-inset-bottom));
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

.inv-filters { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.inv-filter {
  padding: 10px; border-radius: 12px; font-size: 13px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--muted, #8a8aa0);
}
.inv-filter.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.inv-filter.low.active { background: var(--danger, #ef4444); border-color: var(--danger, #ef4444); color: #fff; }
.inv-count {
  display: inline-block; min-width: 18px; padding: 0 5px; margin-left: 4px; border-radius: 9px;
  font-size: 11px; background: rgba(0, 0, 0, 0.25);
}

.inv-banner {
  padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 700;
  color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.12);
}

.inv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.inv-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 14px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
}
.inv-item.low { border-color: rgba(239, 68, 68, 0.55); }
.inv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.inv-name { font-size: 14px; font-weight: 700; line-height: 1.2; }
.inv-meta { font-size: 11px; color: var(--muted, #8a8aa0); }
.inv-badge {
  display: inline-block; margin-right: 6px; padding: 1px 6px; border-radius: 6px;
  font-size: 10px; font-weight: 800; text-transform: uppercase;
  color: var(--danger, #ef4444); background: rgba(239, 68, 68, 0.15);
}
.inv-sync { color: var(--amber, #f59e0b); }

.inv-adjust { display: flex; align-items: center; gap: 4px; }
.inv-step {
  width: 44px; height: 44px; border-radius: 12px; font-size: 22px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: rgba(255, 255, 255, 0.04); color: var(--text, #fff);
}
.inv-step:active:not(:disabled) { background: rgba(16, 185, 129, 0.2); }
.inv-step:disabled { opacity: 0.35; cursor: default; }
.inv-qty {
  min-width: 64px; height: 44px; padding: 0 6px; border-radius: 12px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 1px dashed var(--card-border, #2a2a40); background: none; color: var(--text, #fff);
}
.inv-item.low .inv-qty-value { color: var(--danger, #ef4444); }
.inv-qty-value { font-size: 17px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
.inv-qty-unit { font-size: 10px; color: var(--muted, #8a8aa0); }
.inv-qty-input {
  width: 64px; height: 44px; box-sizing: border-box; padding: 0 6px; border-radius: 12px; text-align: center;
  font-size: 17px; font-weight: 800;
  border: 2px solid var(--primary, #10b981); background: var(--bg, #0d0d14); color: var(--text, #fff);
}

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
.inv-sheet-header { display: flex; align-items: center; justify-content: space-between; }
.inv-sheet-code { font-size: 12px; font-weight: 700; letter-spacing: 1px; color: var(--muted, #8a8aa0); font-variant-numeric: tabular-nums; }
.inv-sheet-close { background: none; border: none; color: var(--muted, #8a8aa0); font-size: 18px; cursor: pointer; padding: 4px; }
.inv-sheet-title { margin: 0; font-size: 18px; font-weight: 800; }
.inv-sheet-meta { margin: 0; font-size: 13px; color: var(--muted, #8a8aa0); }
.inv-sheet-qty { justify-content: center; }
.inv-sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.inv-btn {
  padding: 13px 10px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40);
}
.inv-btn.primary { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.inv-btn.ghost { background: none; color: var(--text, #fff); }
.inv-btn:disabled { opacity: 0.4; cursor: default; }
.inv-form { display: flex; flex-direction: column; gap: 10px; }
.inv-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.inv-field-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: var(--muted, #8a8aa0); }
.inv-field {
  width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px; font-size: 15px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.inv-form-error { margin: 0; font-size: 13px; font-weight: 700; color: var(--danger, #ef4444); }

.inv-toast {
  position: fixed; left: 12px; right: 12px; bottom: calc(80px + env(safe-area-inset-bottom)); z-index: 100;
  padding: 12px 14px; border-radius: 12px; font-size: 13px; font-weight: 700;
  background: #111827; color: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
</style>
