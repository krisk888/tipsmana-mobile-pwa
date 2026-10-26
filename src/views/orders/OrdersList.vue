<template>
  <div class="orders-view">
    <header class="page-header">
      <div class="header-row">
        <h2>📋 Commandes</h2>
        <button class="header-btn" @click="loadOrders" title="Rafraîchir">↻</button>
      </div>
      <p class="subtitle">Commandes en cours — {{ pendingCount }} en attente</p>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Chargement des commandes…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      <p class="error-icon">⚠️</p>
      <p class="error-text">{{ error }}</p>
      <button class="btn-retry" @click="loadOrders">↻ Réessayer</button>
    </div>

    <!-- Filter bar -->
    <div v-else class="filter-bar">
      <button
        v-for="f in filterOptions"
        :key="f.key"
        class="filter-chip"
        :class="{ active: filter === f.key }"
        @click="filter = f.key"
      >
        {{ f.label }}
        <span class="filter-count" v-if="f.count">{{ f.count }}</span>
      </button>
    </div>

    <!-- Empty -->
    <div v-if="!loading && !error && !filteredOrders.length" class="empty-state">
      <p class="empty-icon">✅</p>
      <p>{{ emptyMessage }}</p>
    </div>

    <!-- Order list -->
    <div v-else-if="!loading && !error" class="order-list">
      <div
        v-for="o in filteredOrders"
        :key="o.id"
        class="order-card"
        :class="'card-' + o.status"
        @click="toggleOrder(o.id)"
      >
        <div class="card-header">
          <div class="card-header-left">
            <span class="card-ticket">#{{ shortId(o.ticket_ref || o.id) }}</span>
            <span class="card-status-badge" :class="'status-' + o.status">
              {{ statusLabel(o.status) }}
            </span>
          </div>
          <div class="card-header-right">
            <span class="card-age">{{ ageDisplay(o) }}</span>
            <span class="card-items-count">{{ itemCount(o) }} art.</span>
            <span class="chevron" :class="{ open: expanded[o.id] }">▾</span>
          </div>
        </div>

        <!-- Expanded detail -->
        <div v-if="expanded[o.id]" class="card-detail">
          <div v-if="o.note || o.notes" class="detail-note">
            📝 {{ o.note || o.notes }}
          </div>
          <div class="detail-items">
            <div
              v-for="(item, idx) in o.items"
              :key="idx"
              class="detail-item"
              :class="item.status"
            >
              <span class="item-qty">{{ item.qty }}×</span>
              <span class="item-name">{{ item.name }}</span>
              <span v-if="item.note" class="item-note">📝 {{ item.note }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../../shared/api'

// ── State ──────────────────────────────────────────────
const orders = ref([])
const loading = ref(true)
const error = ref(null)
const expanded = ref({})
const filter = ref('all')

const now = ref(Date.now())

// ── Filter definitions ──────────────────────────────────
const filterOptions = computed(() => [
  { key: 'all',     label: 'Toutes',     count: orders.value.length },
  { key: 'pending',  label: 'En attente', count: ordersByStatus('pending').length },
  { key: 'preparing',label: 'En prépa',   count: ordersByStatus('preparing').length },
  { key: 'ready',   label: 'Prêt',       count: ordersByStatus('ready').length },
  { key: 'served',  label: 'Servi',      count: ordersByStatus('served').length },
])

function ordersByStatus(status) {
  return orders.value.filter(o => o.status === status)
}

// ── Computed ────────────────────────────────────────────
const sortedOrders = computed(() =>
  [...orders.value].sort((a, b) => {
    const da = new Date(a.created_at)
    const db = new Date(b.created_at)
    if (isNaN(da.getTime())) return 1
    if (isNaN(db.getTime())) return -1
    return da - db
  })
)

const filteredOrders = computed(() => {
  if (filter.value === 'all') return sortedOrders.value
  return sortedOrders.value.filter(o => o.status === filter.value)
})

const pendingCount = computed(() =>
  orders.value.filter(o => o.status !== 'served').length
)

const emptyMessage = computed(() => {
  if (filter.value === 'served') return 'Aucune commande servie'
  if (filter.value === 'ready') return 'Aucun plat prêt'
  if (filter.value === 'preparing') return 'Rien en préparation'
  if (filter.value === 'pending') return 'Tout est validé'
  return 'Aucune commande pour le moment'
})

// ── Helpers ─────────────────────────────────────────────
function shortId(id) {
  return id ? String(id).slice(-6) : '—'
}

function statusLabel(s) {
  const map = {
    pending: 'En attente',
    printing: 'Impression',
    printed: 'Imprimé',
    preparing: 'En prépa',
    ready: 'Prêt',
    served: 'Servi',
  }
  return map[s] || s || '—'
}

function ageDisplay(o) {
  if (!o.created_at) return '—'
  const d = new Date(o.created_at)
  if (isNaN(d.getTime())) return '—'
  const sec = Math.max(0, Math.floor((now.value - d.getTime()) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return `${min}m ${s}s`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${m}`
}

function itemCount(o) {
  return (o.items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0)
}

function toggleOrder(id) {
  const next = { ...expanded.value }
  next[id] = !next[id]
  expanded.value = next
}

// ── API ─────────────────────────────────────────────────
function extractList(res) {
  const data = res?.data?.data || res?.data || res || {}
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  return []
}

async function loadOrders() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get('/cash/kds/cuisine?include_served=true')
    orders.value = extractList(res)
    // Auto-expand first pending order
    const firstPending = orders.value.find(o => o.status === 'pending')
    if (firstPending && !Object.keys(expanded.value).length) {
      expanded.value[firstPending.id] = true
    }
  } catch (e) {
    error.value = e.message || 'Serveur injoignable'
    if (!orders.value.length) orders.value = []
  } finally {
    loading.value = false
  }
}

// ── Lifecycle ──────────────────────────────────────────
let refreshTimer

onMounted(() => {
  loadOrders()
  refreshTimer = setInterval(() => {
    now.value = Date.now()
  }, 5000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.orders-view {
  padding: 16px;
  padding-bottom: 80px;
  min-height: 100dvh;
}

/* Header */
.page-header { margin-bottom: 16px; }
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.header-row h2 { font-size: 22px; color: #fff; margin: 0; }
.header-btn {
  width: 36px; height: 36px; border: none; border-radius: 50%;
  background: #1e1e32; color: #fff; font-size: 18px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.header-btn:active { background: #059669; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }

/* States */
.loading-state, .error-state, .empty-state {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 60px 16px; color: #888; text-align: center;
}
.spinner {
  width: 40px; height: 40px; border: 4px solid #2a2a40;
  border-top-color: #059669; border-radius: 50%;
  animation: spin 0.8s linear infinite; margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-icon, .empty-icon { font-size: 48px; margin-bottom: 10px; }
.error-text { font-size: 16px; color: #ef4444; margin-bottom: 18px; }
.btn-retry {
  padding: 12px 28px; border: none; border-radius: 12px;
  background: #6c5ce7; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer;
}

/* Filter bar */
.filter-bar {
  display: flex; gap: 6px; margin-bottom: 14px;
  overflow-x: auto; flex-wrap: nowrap;
}
.filter-bar::-webkit-scrollbar { display: none; }
.filter-chip {
  flex-shrink: 0; padding: 8px 14px; border-radius: 20px;
  border: 1px solid #2a2a40; background: #1e1e32;
  color: #aaa; font-size: 13px; font-weight: 600; cursor: pointer;
  white-space: nowrap; transition: all 0.15s;
}
.filter-chip.active { background: #059669; color: #fff; border-color: #059669; }
.filter-count { font-size: 11px; opacity: 0.7; margin-left: 4px; }

/* Order list */
.order-list { display: flex; flex-direction: column; gap: 10px; }
.order-card {
  background: #1e1e32; border: 1px solid #2a2a40;
  border-left: 4px solid #10b981; border-radius: 12px;
  padding: 12px 14px; transition: border-color 0.3s;
  cursor: pointer;
}
.order-card.card-pending { border-left-color: #f59e0b; }
.order-card.card-preparing { border-left-color: #6366f1; }
.order-card.card-ready { border-left-color: #10b981; opacity: 0.85; }
.order-card.card-served { border-left-color: #6b7280; opacity: 0.5; }

.card-header {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
}
.card-header-left {
  display: flex; align-items: center; gap: 8px;
}
.card-ticket {
  font-weight: 700; font-size: 16px; color: #fff;
}
.card-status-badge {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  padding: 3px 8px; border-radius: 6px;
}
.card-status-badge.status-pending,
.card-status-badge.status-printing,
.card-status-badge.status-printed { background: rgba(245,158,11,0.15); color: #f59e0b; }
.card-status-badge.status-preparing { background: rgba(99,102,241,0.15); color: #818cf8; }
.card-status-badge.status-ready { background: rgba(16,185,129,0.15); color: #10b981; }
.card-status-badge.status-served { background: rgba(107,114,128,0.15); color: #9ca3af; }

.card-header-right {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  font-size: 12px; color: #888;
}
.card-age { font-size: 12px; }
.card-items-count { font-size: 11px; color: #666; }
.chevron { color: #555; font-size: 12px; transition: transform 0.2s; }
.chevron.open { transform: rotate(180deg); }

/* Detail */
.card-detail {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid #2a2a40;
}
.detail-note {
  font-size: 13px; color: #f59e0b;
  background: rgba(245,158,11,0.08); border-radius: 8px;
  padding: 8px 12px; margin-bottom: 8px;
}
.detail-items { display: flex; flex-direction: column; gap: 6px; }
.detail-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.03);
  border-left: 3px solid #f59e0b;
}
.detail-item.preparing { border-left-color: #6366f1; }
.detail-item.ready { border-left-color: #10b981; opacity: 0.75; }
.detail-item.served { border-left-color: #6b7280; opacity: 0.4; }
.item-qty { font-weight: 700; color: #6c5ce7; font-size: 16px; min-width: 28px; }
.item-name { flex: 1; font-size: 15px; font-weight: 600; color: #ddd; }
.item-note { font-size: 12px; color: #f59e0b; font-style: italic; }
</style>