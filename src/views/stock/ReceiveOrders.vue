<template>
  <div class="rcv-shell">
    <header class="rcv-header">
      <button class="rcv-back" :title="t('common.back')" @click="back">←</button>
      <div class="rcv-header-main">
        <h2 class="rcv-title">{{ order ? orderTitle(order) : t('stock.receive.title') }}</h2>
        <div class="rcv-subtitle">
          <template v-if="order">{{ t('stock.receive.progress', { pointed: summary.pointed, total: summary.total }) }}</template>
          <template v-else>{{ t('stock.receive.subtitle') }}</template>
        </div>
      </div>
      <button
        v-if="order"
        class="rcv-icon-btn"
        :title="t('stock.barcode.scanButton')"
        :aria-label="t('stock.barcode.scanButton')"
        @click="scannerOpen = true"
      >📷</button>
    </header>

    <!-- ═══ Liste des commandes envoyées ═══ -->
    <template v-if="!order">
      <div v-if="loading" class="rcv-state"><span class="rcv-spinner"></span><span>{{ t('common.loading') }}</span></div>
      <div v-else-if="error" class="rcv-state rcv-error">
        <p>⚠️ {{ error }}</p>
        <button class="rcv-btn primary" @click="load">{{ t('common.retry') }}</button>
      </div>
      <template v-else>
        <p v-if="!available" class="rcv-banner">{{ t('stock.receive.noOrdersEndpoint') }}</p>
        <div v-else-if="!orders.length" class="rcv-state">
          <span class="rcv-empty-icon">🚚</span>
          <p>{{ t('stock.receive.empty') }}</p>
        </div>

        <ul v-if="orders.length" class="rcv-orders">
          <li v-for="o in orders" :key="o.id">
            <button class="rcv-order" @click="openOrder(o)">
              <div class="rcv-order-main">
                <strong>{{ o.supplier || t('stock.receive.supplierFallback') }}</strong>
                <span class="rcv-meta">
                  {{ o.reference }} · {{ t('stock.receive.lines', { count: o.lines.length }) }}
                  <template v-if="o.expectedDate"> · {{ t('stock.receive.expected', { date: fmtDate(o.expectedDate) }) }}</template>
                </span>
              </div>
              <span v-if="started.has(o.id)" class="rcv-chip">{{ t('stock.receive.started') }}</span>
              <span class="rcv-chevron">›</span>
            </button>
          </li>
        </ul>

        <button class="rcv-btn ghost rcv-wide" @click="openOrder(freeReception())">
          📦 {{ t('stock.receive.freeReception') }}<span v-if="started.has(FREE_RECEPTION_ID)" class="rcv-chip">{{ t('stock.receive.started') }}</span>
        </button>
      </template>
    </template>

    <!-- ═══ Pointage d'une commande ═══ -->
    <template v-else>
      <div class="rcv-progress" role="progressbar" :aria-valuenow="summary.pointed" :aria-valuemax="summary.total">
        <span :style="{ width: summary.total ? `${(summary.pointed / summary.total) * 100}%` : '0%' }"></span>
      </div>
      <p v-if="order.local" class="rcv-banner">{{ t('stock.receive.freeHint') }}</p>
      <div v-if="summary.short || summary.over" class="rcv-gaps">
        <span v-if="summary.short" class="rcv-gap-chip short">{{ t('stock.receive.shortCount', { count: summary.short }) }}</span>
        <span v-if="summary.over" class="rcv-gap-chip over">{{ t('stock.receive.overCount', { count: summary.over }) }}</span>
      </div>

      <div v-if="!lines.length" class="rcv-state">
        <span class="rcv-empty-icon">📷</span>
        <p>{{ t('stock.receive.scanFirst') }}</p>
        <button class="rcv-btn primary" @click="scannerOpen = true">{{ t('stock.barcode.scanButton') }}</button>
      </div>

      <ul class="rcv-lines">
        <li
          v-for="l in lines"
          :key="l.id"
          :ref="el => setLineEl(l.id, el)"
          class="rcv-line"
          :class="['gap-' + gapStatus(l), { highlight: highlightId === l.id }]"
        >
          <div class="rcv-line-info">
            <span class="rcv-line-name">{{ l.name }}<span v-if="l.extra" class="rcv-chip">{{ t('stock.receive.extra') }}</span></span>
            <span class="rcv-meta">
              {{ t('stock.receive.ordered', { qty: l.ordered, unit: l.unit || '' }) }}
              <span v-if="gapStatus(l) === 'ok'" class="rcv-gap ok">✓ {{ t('stock.receive.conform') }}</span>
              <span v-else-if="l.pointed" class="rcv-gap" :class="gapStatus(l)">{{ l.gap > 0 ? '+' : '' }}{{ l.gap }}</span>
            </span>
          </div>
          <button class="rcv-step" :aria-label="t('stock.receive.minus')" @click="step(l, -1)">−</button>
          <input
            class="rcv-qty"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            :value="l.pointed ? l.received : ''"
            :placeholder="String(l.ordered)"
            :aria-label="t('stock.receive.receivedAria', { name: l.name })"
            @change="setQty(l, $event.target.value)"
          />
          <button class="rcv-step" :aria-label="t('stock.receive.plus')" @click="step(l, 1)">+</button>
        </li>
      </ul>

      <footer class="rcv-footer">
        <button class="rcv-btn ghost" :disabled="busy || !summary.pending" @click="pointAll">{{ t('stock.receive.pointAll') }}</button>
        <button class="rcv-btn primary" :disabled="busy || !summary.pointed" @click="confirmOpen = true">
          {{ t('stock.receive.validate') }}
        </button>
      </footer>
    </template>

    <!-- ═══ Confirmation ═══ -->
    <div v-if="confirmOpen" class="rcv-overlay" @click.self="confirmOpen = false">
      <div class="rcv-sheet" role="dialog" aria-modal="true">
        <h3 class="rcv-sheet-title">{{ t('stock.receive.confirmTitle') }}</h3>
        <p class="rcv-sheet-meta">{{ t('stock.receive.confirmText', { pointed: summary.pointed, total: summary.total }) }}</p>
        <ul v-if="gapLines.length" class="rcv-sheet-gaps">
          <li v-for="l in gapLines" :key="l.id">
            <span>{{ l.name }}</span>
            <span class="rcv-gap" :class="gapStatus(l)">{{ l.received }} / {{ l.ordered }} ({{ l.gap > 0 ? '+' : '' }}{{ l.gap }})</span>
          </li>
        </ul>
        <p v-if="summary.pending" class="rcv-sheet-warn">{{ t('stock.receive.pendingWarn', { count: summary.pending }) }}</p>
        <div class="rcv-sheet-actions">
          <button class="rcv-btn ghost" :disabled="busy" @click="confirmOpen = false">{{ t('common.cancel') }}</button>
          <button class="rcv-btn primary" :disabled="busy" @click="validate">{{ busy ? '…' : t('stock.receive.confirm') }}</button>
        </div>
      </div>
    </div>

    <BarcodeScanner v-if="scannerOpen" @detected="onScanned" @close="scannerOpen = false" />
    <div v-if="toastMsg" class="rcv-toast" role="status">{{ toastMsg }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import BarcodeScanner from '../../components/BarcodeScanner.vue'
import { lookupBarcode } from '../../shared/barcode'
import { fetchInventoryItems } from '../../shared/inventory'
import {
  fetchSentOrders, freeReception, FREE_RECEPTION_ID, loadProgress, saveProgress, startedOrderIds,
  receiptLines, receiptSummary, gapStatus, setReceived, clearReceived, scanIntoReceipt, receiveOrder,
} from '../../shared/purchaseOrders'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()
const router = useRouter()

const orders = ref([])
const available = ref(true)
const loading = ref(true)
const error = ref(null)
const started = ref(new Set())

const order = ref(null)
const progress = ref({ received: {}, extra: [] })
const scannerOpen = ref(false)
const confirmOpen = ref(false)
const busy = ref(false)
const highlightId = ref(null)
const toastMsg = ref('')

// Stock chargé une fois : correspondance des codes-barres hors-ligne
let stockItems = null
const lineEls = new Map()

const lines = computed(() => (order.value ? receiptLines(order.value, progress.value) : []))
const summary = computed(() => (order.value ? receiptSummary(order.value, progress.value) : { total: 0, pointed: 0, pending: 0, short: 0, over: 0 }))
const gapLines = computed(() => lines.value.filter(l => l.pointed && l.gap))

function orderTitle(o) {
  return o.local ? t('stock.receive.freeReception') : (o.supplier || o.reference)
}

function fmtDate(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short' })
}

let toastTimer = null
function toast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 3000)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await fetchSentOrders()
    orders.value = res.orders
    available.value = res.available
    started.value = startedOrderIds()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function openOrder(o) {
  order.value = o
  progress.value = loadProgress(o.id)
}

function back() {
  if (order.value) {
    order.value = null
    started.value = startedOrderIds()
    return
  }
  router.push('/stock')
}

function update(next) {
  progress.value = next
  saveProgress(order.value.id, next)
}

function setQty(line, raw) {
  if (raw === '' || raw == null) return update(clearReceived(progress.value, line.id))
  const n = Number(String(raw).replace(',', '.'))
  if (Number.isFinite(n)) update(setReceived(progress.value, line.id, n))
}

// Ligne pas encore pointée : « + » la pointe conforme, « − » avec une unité de moins
function step(line, delta) {
  const next = line.pointed ? line.received + delta : line.ordered + Math.min(delta, 0)
  update(setReceived(progress.value, line.id, next))
}

function pointAll() {
  let next = progress.value
  for (const l of lines.value) if (!l.pointed) next = setReceived(next, l.id, l.ordered)
  update(next)
}

function setLineEl(id, el) {
  if (el) lineEls.set(id, el)
  else lineEls.delete(id)
}

async function lookup(code) {
  if (!stockItems) {
    try { stockItems = (await fetchInventoryItems()).items } catch { stockItems = [] }
  }
  return lookupBarcode(code, stockItems)
}

async function onScanned(code) {
  scannerOpen.value = false
  try {
    const res = await scanIntoReceipt(order.value, progress.value, code, lookup)
    if (!res.lineId) {
      toast(t(`stock.receive.scan.${res.status}`, { code }))
      return
    }
    update(res.progress)
    try { navigator.vibrate?.(60) } catch { /* non supporté */ }
    if (res.status === 'extra') toast(t('stock.receive.scan.extra'))
    highlightId.value = res.lineId
    await nextTick()
    lineEls.get(res.lineId)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setTimeout(() => { if (highlightId.value === res.lineId) highlightId.value = null }, 2000)
  } catch (e) {
    toast(e.message || t('stock.receive.scan.error'))
  }
}

async function validate() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await receiveOrder(order.value, progress.value)
    confirmOpen.value = false
    if (res.failed.length) {
      progress.value = loadProgress(order.value.id)
      toast(t('stock.receive.partialFail', { count: res.failed.length, names: res.failed.map(f => f.name).join(', ') }))
      return
    }
    toast(res.queued ? t('stock.receive.queued') : t('stock.receive.done'))
    order.value = null
    stockItems = null
    await load()
  } catch (e) {
    toast(e.message)
  } finally {
    busy.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => clearTimeout(toastTimer))

defineExpose({ openOrder, onScanned, validate })
</script>

<style scoped>
.rcv-shell {
  display: flex; flex-direction: column; gap: 10px;
  min-height: 100dvh;
  padding: 0 12px calc(150px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14); color: var(--text, #fff);
}

.rcv-header {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 10px;
  margin: 0 -12px; padding: 10px 12px;
  background: var(--nav-bg, #15152a); border-bottom: 1px solid var(--card-border, #2a2a40);
}
.rcv-back, .rcv-icon-btn {
  width: 38px; height: 38px; border-radius: 10px; font-size: 18px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}
.rcv-header-main { flex: 1; min-width: 0; }
.rcv-title { margin: 0; font-size: 18px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rcv-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); }

.rcv-banner {
  margin: 0; padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 700;
  color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.12);
}

.rcv-orders, .rcv-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rcv-order {
  width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 14px; text-align: left; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff); font: inherit;
}
.rcv-order-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rcv-order-main strong { font-size: 15px; }
.rcv-chevron { font-size: 22px; color: var(--muted, #8a8aa0); }
.rcv-meta { font-size: 12px; color: var(--muted, #8a8aa0); }
.rcv-chip {
  display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 9px; font-size: 11px; font-weight: 800;
  color: var(--accent, #6366f1); background: rgba(99, 102, 241, 0.15);
}

.rcv-progress { height: 6px; border-radius: 3px; overflow: hidden; background: var(--card-border, #2a2a40); }
.rcv-progress span { display: block; height: 100%; background: var(--primary, #10b981); transition: width 0.2s; }

.rcv-gaps { display: flex; gap: 6px; flex-wrap: wrap; }
.rcv-gap-chip { padding: 4px 10px; border-radius: 10px; font-size: 12px; font-weight: 800; }
.rcv-gap-chip.short { color: var(--danger, #ef4444); background: rgba(239, 68, 68, 0.12); }
.rcv-gap-chip.over { color: var(--amber, #f59e0b); background: rgba(245, 158, 11, 0.12); }

.rcv-line {
  display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-radius: 14px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.rcv-line.gap-ok { border-color: rgba(16, 185, 129, 0.45); }
.rcv-line.gap-short { border-color: rgba(239, 68, 68, 0.6); }
.rcv-line.gap-over { border-color: rgba(245, 158, 11, 0.6); }
.rcv-line.highlight { border-color: var(--primary, #10b981); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.3); }
.rcv-line-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.rcv-line-name { font-size: 14px; font-weight: 700; line-height: 1.2; }
.rcv-gap { margin-left: 4px; font-weight: 800; }
.rcv-gap.ok { color: var(--primary, #10b981); }
.rcv-gap.short { color: var(--danger, #ef4444); }
.rcv-gap.over { color: var(--amber, #f59e0b); }

.rcv-step {
  width: 40px; height: 44px; border-radius: 12px; font-size: 20px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: rgba(255, 255, 255, 0.04); color: var(--text, #fff);
}
.rcv-qty {
  width: 68px; height: 44px; box-sizing: border-box; padding: 0 6px; border-radius: 12px; text-align: center;
  font-size: 17px; font-weight: 800;
  border: 2px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.rcv-qty:focus { border-color: var(--primary, #10b981); outline: none; }

.rcv-footer {
  position: fixed; left: 0; right: 0; bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 60;
  display: grid; grid-template-columns: 1fr 2fr; gap: 8px; padding: 10px 12px;
  background: var(--nav-bg, #15152a); border-top: 1px solid var(--card-border, #2a2a40);
}

.rcv-btn {
  padding: 13px 10px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40);
}
.rcv-btn.primary { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.rcv-btn.ghost { background: none; color: var(--text, #fff); }
.rcv-btn:disabled { opacity: 0.4; cursor: default; }
.rcv-wide { width: 100%; }

.rcv-state {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 40px 16px; text-align: center; color: var(--muted, #8a8aa0);
}
.rcv-error { color: var(--danger, #ef4444); }
.rcv-empty-icon { font-size: 40px; }
.rcv-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: rcv-spin 0.7s linear infinite;
}
@keyframes rcv-spin { to { transform: rotate(360deg); } }

.rcv-overlay {
  position: fixed; inset: 0; z-index: 250; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.rcv-sheet {
  width: 100%; max-width: 520px; max-height: 90dvh; overflow-y: auto; box-sizing: border-box;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0;
  background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
  display: flex; flex-direction: column; gap: 10px;
}
.rcv-sheet-title { margin: 0; font-size: 18px; font-weight: 800; }
.rcv-sheet-meta { margin: 0; font-size: 13px; color: var(--muted, #8a8aa0); }
.rcv-sheet-gaps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.rcv-sheet-gaps li { display: flex; justify-content: space-between; gap: 8px; }
.rcv-sheet-warn { margin: 0; font-size: 13px; font-weight: 700; color: var(--amber, #f59e0b); }
.rcv-sheet-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }

.rcv-toast {
  position: fixed; left: 12px; right: 12px; bottom: calc(140px + env(safe-area-inset-bottom)); z-index: 300;
  padding: 12px 14px; border-radius: 12px; font-size: 13px; font-weight: 700;
  background: #111827; color: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
</style>
