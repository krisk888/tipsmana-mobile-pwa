<template>
  <div class="cuisine-view">
    <header class="page-header">
      <h2>🍳 Cuisine</h2>
      <p class="subtitle">Commandes en attente de préparation</p>
    </header>

    <!-- KPI strip -->
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">En attente</span>
        <span class="kpi-value">{{ orders.length }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Montant total</span>
        <span class="kpi-value">{{ formatEur(totalPending) }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Plus ancienne</span>
        <span class="kpi-value kpi-time">{{ oldestWait }}</span>
      </div>
    </div>

    <div class="toolbar">
      <span class="count-label" :class="{ urgent: orders.length > 0 }">
        {{ orders.length > 0 ? `${orders.length} commande${orders.length > 1 ? 's' : ''} à préparer` : 'File vide' }}
      </span>
      <button class="btn-refresh" @click="load" :disabled="loading">
        {{ loading ? '…' : '↻ Actualiser' }}
      </button>
    </div>

    <div v-if="loading && !orders.length" class="loading-state">Chargement des commandes…</div>

    <div v-else-if="error && !orders.length" class="error-state">
      <p class="error-title">⚠️ {{ error }}</p>
      <button class="btn-retry" @click="load">↻ Réessayer</button>
    </div>

    <div v-else-if="!orders.length" class="empty-state">
      <p class="empty-icon">🍽️</p>
      <p>Tout est servi, rien en attente</p>
    </div>

    <div v-else class="order-list">
      <div
        v-for="o in sortedOrders"
        :key="o.id"
        class="order-card"
        :class="'age-' + ageBucket(o.created_at)"
      >
        <div class="order-card-header" @click="toggleDetail(o.id)">
          <div class="order-main">
            <div class="order-title-row">
              <strong>Cmd #{{ shortId(o.id) }}</strong>
              <span class="order-age" :class="'age-' + ageBucket(o.created_at)">
                {{ formatAge(o.created_at) }}
              </span>
            </div>
            <div class="order-meta">
              <span class="shift-badge" :class="o.shift">{{ shiftLabel(o.shift) }}</span>
              <span v-if="o.total_items != null">{{ o.total_items }} art.</span>
              <span v-if="o.imported_by_user_name">{{ o.imported_by_user_name }}</span>
            </div>
          </div>
          <div class="order-right">
            <span class="order-amount">{{ formatEur(o.total_sales_ttc) }}</span>
            <span class="chevron" :class="{ open: expanded[o.id] }">▾</span>
          </div>
        </div>

        <div v-if="expanded[o.id]" class="order-detail">
          <div v-if="detailLoading[o.id]" class="detail-hint">Chargement du détail…</div>
          <div v-else-if="detailError[o.id]" class="detail-hint detail-error">{{ detailError[o.id] }}</div>
          <ul v-else-if="detailItems[o.id] && detailItems[o.id].length" class="item-list">
            <li v-for="li in detailItems[o.id]" :key="li.id" class="item-row">
              <span class="item-qty">×{{ qty(li) }}</span>
              <span class="item-name">{{ itemName(li) }}</span>
              <span v-if="li.notes || li.comment" class="item-note">{{ li.notes || li.comment }}</span>
            </li>
          </ul>
          <p v-else class="detail-hint">Aucun article détaillé</p>

          <button
            class="btn-ready"
            :disabled="readyLoading[o.id]"
            @click.stop="markReady(o.id)"
          >
            {{ readyLoading[o.id] ? '…' : '✅ Prêt — servir' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="flash" class="toast" :class="flash.type">{{ flash.text }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../../shared/api'

const orders = ref([])
const loading = ref(true)
const error = ref(null)
const expanded = ref({})
const detailLoading = ref({})
const detailError = ref({})
const detailItems = ref({})
const readyLoading = ref({})
const flash = ref(null)
const now = ref(Date.now())

const today = new Date()
const todayISO = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-')

function formatEur(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0)
}
function shortId(id) { return id ? String(id).slice(0, 8) : '—' }
function shiftLabel(s) {
  return { lunch: 'Midi', dinner: 'Soir', all_day: 'Journée' }[s] || (s || '—')
}
function qty(li) { return li.quantity != null ? Number(li.quantity) : 1 }
function itemName(li) {
  return li.item_name_original
    || li.product_name || li.recipe_name
    || 'Produit n°' + shortId(li.product_id || li.recipe_id)
}
function ageMinutes(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
}
function formatAge(dateStr) {
  const min = ageMinutes(dateStr)
  if (min === null) return ''
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `il y a ${h}h${m ? ' ' + m + 'min' : ''}`
}
function ageBucket(dateStr) {
  const min = ageMinutes(dateStr)
  if (min === null) return 'new'
  if (min < 2) return 'new'      // vert — vient d'arriver
  if (min < 5) return 'watch'    // jaune — à surveiller
  return 'late'                  // rouge — en retard
}
function firstOrderDate() {
  for (const o of sortedOrders.value) {
    const min = ageMinutes(o.created_at)
    if (min !== null) return min
  }
  return null
}
const oldestWait = computed(() => {
  const min = firstOrderDate()
  if (min === null) return '—'
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h}h${min % 60 ? ' ' + (min % 60) + 'min' : ''}`
})
const totalPending = computed(() =>
  orders.value.reduce((sum, o) => sum + (Number(o.total_sales_ttc) || 0), 0)
)
const sortedOrders = computed(() =>
  [...orders.value].sort((a, b) =>
    (new Date(a.created_at) - new Date(b.created_at))
  )
)

function showFlash(text, type = 'ok') {
  flash.value = { text, type }
  setTimeout(() => { flash.value = null }, 3000)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get(
      `/sales/entries?date_from=${todayISO}&date_to=${todayISO}&validation_status=pending`
    )
    const data = res && res.data
    orders.value = Array.isArray(data) ? data : []
  } catch (e) {
    error.value = e.message || 'Serveur injoignable'
    if (!orders.value.length) orders.value = []
  } finally {
    loading.value = false
  }
}

async function toggleDetail(id) {
  if (expanded.value[id]) {
    expanded.value[id] = false
    return
  }
  expanded.value[id] = true
  if (detailItems.value[id]) return
  detailLoading.value[id] = true
  detailError.value[id] = null
  try {
    const res = await api.get(`/sales/entries/${id}`)
    const data = (res && res.data) || res
    detailItems.value[id] = data.line_items || []
  } catch (e) {
    detailError.value[id] = e.message || 'Détail indisponible'
  } finally {
    detailLoading.value[id] = false
  }
}

async function markReady(id) {
  readyLoading.value[id] = true
  try {
    await api.put(`/sales/entries/${id}`, { validation_status: 'validated' })
    orders.value = orders.value.filter(o => o.id !== id)
    expanded.value[id] = false
    showFlash('✅ Commande servie')
  } catch (e) {
    showFlash('❌ ' + (e.message || 'Mise à jour échouée'), 'err')
  } finally {
    readyLoading.value[id] = false
  }
}

let refreshTimer
let clockTimer
onMounted(() => {
  load()
  refreshTimer = setInterval(load, 30000)   // re-pull silencieux
  clockTimer = setInterval(() => { now.value = Date.now() }, 10000) // tick âge
})
onUnmounted(() => {
  clearInterval(refreshTimer)
  clearInterval(clockTimer)
})
</script>

<style scoped>
.cuisine-view { padding: 16px; padding-bottom: 90px; }
.page-header { margin-bottom: 14px; }
.page-header h2 { font-size: 22px; color: var(--text, #fff); margin: 0; }
.subtitle { font-size: 13px; color: var(--muted, #888); margin-top: 4px; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
.kpi-card {
  background: var(--card-bg, #1e1e32);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 12px; padding: 12px 10px;
  display: flex; flex-direction: column; min-width: 0;
}
.kpi-label { font-size: 10px; color: var(--muted, #888); text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-value { font-size: 17px; font-weight: 700; color: var(--text, #fff); margin-top: 4px; }
.kpi-value.kpi-time { font-size: 14px; }

/* Toolbar */
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.count-label { font-size: 13px; color: var(--muted, #aaa); font-weight: 600; }
.count-label.urgent { color: #00d2a0; }
.btn-refresh {
  background: var(--card-bg, #1e1e32); color: var(--text, #fff);
  border: 1px solid var(--card-border, #2a2a40); border-radius: 8px;
  padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-refresh:disabled { opacity: 0.4; }

/* States */
.loading-state, .error-state, .empty-state { color: var(--muted, #666); text-align: center; padding: 40px 16px; }
.empty-icon { font-size: 48px; margin-bottom: 8px; }
.error-title { color: #ff6b6b; font-size: 14px; margin-bottom: 12px; }
.btn-retry {
  background: #6c5ce7; color: #fff; border: none; border-radius: 8px;
  padding: 10px 24px; font-size: 14px; font-weight: 600; cursor: pointer;
}

/* Order cards */
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card {
  background: var(--card-bg, #1e1e32);
  border: 1px solid var(--card-border, #2a2a40);
  border-left: 4px solid #10b981;
  border-radius: 12px; padding: 14px;
  transition: border-color 0.2s;
}
.order-card.age-watch { border-left-color: #f59e0b; }
.order-card.age-late { border-left-color: #ef4444; }
.order-card:active { background: var(--hover-bg, #26263c); }
.order-card-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; cursor: pointer; }
.order-main { min-width: 0; flex: 1; }
.order-title-row { display: flex; align-items: center; gap: 8px; }
.order-title-row strong { color: var(--text, #fff); font-size: 15px; }
.order-age { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
.order-age.age-new { background: rgba(16,185,129,0.15); color: #10b981; }
.order-age.age-watch { background: rgba(245,158,11,0.15); color: #f59e0b; }
.order-age.age-late { background: rgba(239,68,68,0.15); color: #ef4444; animation: pulse 1.5s infinite; }
@keyframes pulse { 50% { opacity: 0.55; } }
.order-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--muted, #888); margin-top: 6px; flex-wrap: wrap;
}
.shift-badge { padding: 2px 8px; border-radius: 6px; font-weight: 600; }
.shift-badge.lunch { background: rgba(255,193,7,0.15); color: #ffc107; }
.shift-badge.dinner { background: rgba(108,92,231,0.2); color: #a29bfe; }
.order-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.order-amount { color: #00d2a0; font-weight: 700; font-size: 16px; }
.chevron { color: var(--muted, #666); font-size: 12px; transition: transform 0.2s; }
.chevron.open { transform: rotate(180deg); }

/* Detail */
.order-detail { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--card-border, #2a2a40); }
.detail-hint { font-size: 12px; color: var(--muted, #888); }
.detail-error { color: #ff6b6b; }
.item-list { list-style: none; margin: 0 0 12px; padding: 0; }
.item-row {
  display: flex; gap: 8px; align-items: baseline; padding: 7px 0;
  font-size: 13.5px; color: var(--text, #ddd);
  border-bottom: 1px solid var(--card-border, #2a2a40);
}
.item-row:last-child { border-bottom: none; }
.item-qty { color: #6c5ce7; font-weight: 700; min-width: 30px; }
.item-name { flex: 1; }
.item-note { font-size: 11px; color: #f59e0b; font-style: italic; }
.btn-ready {
  width: 100%; padding: 13px; border: none; border-radius: 10px;
  background: #00d2a0; color: #0f0f1a;
  font-size: 14px; font-weight: 700; cursor: pointer;
  margin-top: 4px;
}
.btn-ready:disabled { opacity: 0.5; }

/* Toast */
.toast {
  position: fixed; left: 16px; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom));
  background: #059669; color: #fff; text-align: center;
  padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4); z-index: 300;
  animation: toast-in 0.25s ease-out;
}
.toast.err { background: #ef4444; }
@keyframes toast-in { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
</style>