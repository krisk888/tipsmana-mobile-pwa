<template>
  <div class="kds-view">
    <!-- ═══ NOTIFICATION OVERLAY ═══ -->
    <div v-if="incomingPulse" class="new-order-pulse" @click="incomingPulse = false">
      <span class="pulse-icon">🔔</span>
      <span class="pulse-text">Nouvelle commande !</span>
    </div>

    <!-- ═══ HEADER ═══ -->
    <header class="kds-header">
      <div class="kds-title-row">
        <h2>🍳 Cuisine</h2>
        <div class="kds-header-actions">
          <button class="header-btn" @click="loadOrders" title="Rafraîchir">↻</button>
          <div class="kds-header-status">
            <span class="status-dot" :class="{ connected, disconnected: !connected }"></span>
            <span class="status-text">{{ connected ? 'En ligne' : 'Hors ligne' }}</span>
          </div>
        </div>
      </div>
      <p class="kds-subtitle">Écran cuisine — commandes en préparation</p>
    </header>

    <!-- ═══ KPI STRIP ═══ -->
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">En attente</span>
        <span class="kpi-value">{{ pendingCount }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">En préparation</span>
        <span class="kpi-value">{{ preparingCount }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Prêt</span>
        <span class="kpi-value kpi-time">{{ readyCount }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Plus ancienne</span>
        <span class="kpi-value kpi-time" :class="{ urgent: oldestMinutes > 15 }">{{ oldestDisplay }}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Articles</span>
        <span class="kpi-value">{{ totalItems }}</span>
      </div>
    </div>

    <!-- ═══ FILTERS ═══ -->
    <div class="kds-filters">
      <button
        v-for="f in filterOptions"
        :key="f.key"
        class="filter-btn"
        :class="{
          active: filter === f.key,
          'filter-pending': f.key === 'pending',
          'filter-preparing': f.key === 'preparing',
          'filter-ready': f.key === 'ready',
          'filter-served': f.key === 'served',
        }"
        @click="filter = f.key"
      >
        {{ f.label }}
        <span class="filter-count" v-if="f.count !== null">({{ f.count }})</span>
      </button>
    </div>

    <!-- ═══ LOADING ═══ -->
    <div v-if="loading && !orders.length" class="kds-loading">
      <div class="spinner"></div>
      <p>Chargement des commandes…</p>
    </div>

    <!-- ═══ ERROR ═══ -->
    <div v-else-if="error && !orders.length" class="kds-error">
      <p class="error-icon">⚠️</p>
      <p class="error-text">{{ error }}</p>
      <button class="btn-retry" @click="loadOrders">↻ Réessayer</button>
      <button class="btn-demo" @click="loadDemo">🎮 Mode démo</button>
    </div>

    <!-- ═══ EMPTY ═══ -->
    <div v-else-if="!filteredOrders.length" class="kds-empty">
      <p class="empty-icon">{{ filter === 'served' ? '📋' : '🍽️' }}</p>
      <p>{{ emptyMessage }}</p>
      <p class="empty-sub">La cuisine respire…</p>
    </div>

    <!-- ═══ ORDER LIST ═══ -->
    <div v-else class="order-list">
      <div
        v-for="o in filteredOrders"
        :key="o.id"
        class="order-card"
        :class="cardClass(o)"
        :data-new="o._new ? 'true' : null"
      >
        <!-- Header row -->
        <div class="card-header" @click="toggleOrder(o.id)">
          <div class="card-header-left">
            <span class="card-ticket">#{{ shortId(o.ticket_ref || o.id) }}</span>
            <span class="card-age" :class="ageClass(o)">
              <span class="age-icon">{{ ageIcon(o) }}</span>
              <span class="age-text">{{ ageDisplay(o) }}</span>
            </span>
          </div>
          <div class="card-header-right">
            <span class="card-status-badge" :class="'status-' + o.status">
              {{ statusLabel(o.status) }}
            </span>
            <span class="chevron" :class="{ open: expanded[o.id] }">▾</span>
          </div>
        </div>

        <!-- Items preview (collapsed) -->
        <div v-if="!expanded[o.id]" class="items-preview" @click="toggleOrder(o.id)">
          <span
            v-for="(item, idx) in previewItems(o)"
            :key="idx"
            class="preview-chip"
            :class="item.status"
          >{{ item.qty }}× {{ item.name }}</span>
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
              <div class="item-main">
                <span class="item-qty">{{ item.qty }}×</span>
                <span class="item-name">{{ item.name }}</span>
                <span v-if="item.status === 'ready'" class="item-badge badge-ready">✅ Prêt</span>
                <span v-if="item.status === 'served'" class="item-badge badge-served">☑️ Servi</span>
              </div>
              <div v-if="item.note" class="item-note">📝 {{ item.note }}</div>
              <div class="item-timer" v-if="item.status === 'pending' || item.status === 'preparing'">
                <span class="timer-icon">⏱</span>
                <span class="timer-text">{{ itemAgeDisplay(o, idx) }}</span>
              </div>
              <div class="item-actions">
                <!-- Valider : pending→preparing -->
                <button
                  v-if="item.status === 'pending' || item.status === 'printing' || item.status === 'printed'"
                  class="item-action-btn action-validate"
                  @click.stop="markItemReady(o.id, idx)"
                  :disabled="actionLoading[itemKey(o.id, idx)]"
                >
                  {{ actionLoading[itemKey(o.id, idx)] ? '…' : '🟢 Valider' }}
                </button>
                <!-- Prêt : preparing→ready -->
                <button
                  v-if="item.status === 'preparing'"
                  class="item-action-btn action-ready"
                  @click.stop="markItemReady(o.id, idx)"
                  :disabled="actionLoading[itemKey(o.id, idx)]"
                >
                  {{ actionLoading[itemKey(o.id, idx)] ? '…' : '✅ Prêt' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Order-level action -->
          <div class="detail-actions">
            <button
              v-if="canValidateOrder(o)"
              class="order-action-btn action-validate"
              @click.stop="markOrderReady(o.id)"
              :disabled="actionLoading[o.id]"
            >
              {{ actionLoading[o.id] ? '…' : '🟢 Valider tout' }}
            </button>
            <button
              v-if="canReadyOrder(o)"
              class="order-action-btn action-ready"
              @click.stop="markOrderReady(o.id)"
              :disabled="actionLoading[o.id]"
            >
              {{ actionLoading[o.id] ? '…' : '✅ Tout prêt' }}
            </button>
            <button
              v-if="canServeOrder(o)"
              class="order-action-btn action-serve"
              @click.stop="markOrderReady(o.id)"
              :disabled="actionLoading[o.id]"
            >
              {{ actionLoading[o.id] ? '…' : '☑️ Servir' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ TOAST ═══ -->
    <div v-if="flash" class="toast" :class="flash.type">{{ flash.text }}</div>
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
const actionLoading = ref({})
const flash = ref(null)
const connected = ref(false)
const filter = ref('all')
const knownIds = new Set()
const now = ref(Date.now())
const incomingPulse = ref(false)

// ── WebSocket state ────────────────────────────────────
let ws = null
let reconnectAttempt = 0
let reconnectTimer = null
let fallbackTimer = null
let fallbackActive = false
const WS_RECONNECT_MAX = 30000
const WS_RECONNECT_BASE = 1000
const FALLBACK_INTERVAL = 30000

// ── Filter definitions ──────────────────────────────────
const filterOptions = computed(() => [
  { key: 'all',      label: 'Toutes',       count: pendingOrders.value.length },
  { key: 'pending',  label: 'En attente',   count: ordersBySta.value('pending').length + ordersBySta.value('printing').length + ordersBySta.value('printed').length },
  { key: 'preparing',label: 'En prépa',     count: ordersBySta.value('preparing').length },
  { key: 'ready',    label: 'Prêt',         count: ordersBySta.value('ready').length },
  { key: 'served',   label: 'Servi',        count: ordersBySta.value('served').length },
])

// ── Helpers for computed ────────────────────────────────
function ordersByStatus(status) {
  return orders.value.filter(o => o.status === status)
}

// ── Computed ────────────────────────────────────────────
const pendingOrders = computed(() =>
  orders.value.filter(o => o.status !== 'served')
)

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

const pendingCount = computed(() => pendingOrders.value.length)

const preparingCount = computed(() =>
  ordersByStatus('preparing').length
)

const readyCount = computed(() =>
  ordersByStatus('ready').length
)

const totalItems = computed(() =>
  pendingOrders.value.reduce((sum, o) =>
    sum + (o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0), 0)
)

const oldestMinutes = computed(() => {
  const first = sortedOrders.value[0]
  if (!first) return 0
  return ageMinutes(first.created_at) || 0
})

const oldestDisplay = computed(() => {
  const m = oldestMinutes.value
  if (m < 1) return "à l'instant"
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'min' : ''}`
})

const emptyMessage = computed(() => {
  if (filter.value === 'served') return "Aucune commande servie"
  if (filter.value === 'ready') return "Aucun plat prêt"
  if (filter.value === 'preparing') return "Rien en préparation"
  if (filter.value === 'pending') return "Tout est validé"
  return 'Tout est servi, rien en attente'
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

function ageMinutes(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((now.value - d.getTime()) / 60000))
}

function ageSeconds(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((now.value - d.getTime()) / 1000))
}

function ageDisplay(o) {
  const sec = ageSeconds(o.created_at)
  if (sec === null) return '—'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return `${min}min ${s}s`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${m}min`
}

function ageIcon(o) {
  const min = ageMinutes(o.created_at)
  if (min === null) return '🕐'
  if (min < 5) return '🟢'
  if (min < 15) return '🟡'
  return '🔴'
}

function ageClass(o) {
  const min = ageMinutes(o.created_at)
  if (min === null || o.status === 'ready' || o.status === 'served') return 'age-fresh'
  if (min < 5) return 'age-fresh'
  if (min < 15) return 'age-watch'
  return 'age-late'
}

function cardClass(o) {
  const min = ageMinutes(o.created_at)
  const cls = ['card-' + o.status]
  if (min !== null && min > 15 && o.status !== 'served' && o.status !== 'ready') cls.push('card-urgent')
  else if (min !== null && min > 5 && o.status !== 'served' && o.status !== 'ready') cls.push('card-watch')
  return cls.join(' ')
}

function previewItems(o) {
  return (o.items || []).slice(0, 6)
}

function itemKey(orderId, itemIndex) {
  return `${orderId}-${itemIndex}`
}

function canValidateOrder(o) {
  // Returns true if any item is pending/printing/printed and none are preparing yet
  if (!o.items || !o.items.length) return false
  return o.items.some(i => i.status === 'pending' || i.status === 'printing' || i.status === 'printed')
}

function canReadyOrder(o) {
  // All items are at least preparing, none pending, none ready/served
  if (!o.items || !o.items.length) return false
  if (o.items.some(i => i.status === 'pending' || i.status === 'printing' || i.status === 'printed')) return false
  return o.items.some(i => i.status === 'preparing') && !o.items.every(i => i.status === 'ready' || i.status === 'served')
}

function canServeOrder(o) {
  // All items ready or served
  if (!o.items || !o.items.length) return false
  return o.items.every(i => i.status === 'ready' || i.status === 'served') && o.status !== 'served'
}

function itemAgeDisplay(order, itemIndex) {
  // Show elapsed time for this item based on its status change
  // If item became 'preparing', show time since status change
  // For simplicity, use order creation time as base
  const sec = ageSeconds(order.created_at)
  if (sec === null) return '—'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  return `${min}m ${s}s`
}

function showFlash(text, type = 'ok') {
  flash.value = { text, type }
  setTimeout(() => { flash.value = null }, 3000)
}

function showIncomingPulse() {
  incomingPulse.value = true
  setTimeout(() => { incomingPulse.value = false }, 2000)
}

// ── Audio notification (Web Audio API) ─────────────────
function playNotification() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.2)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.45)
  } catch (e) {
    // Silently ignore audio errors
  }
}

// ── WebSocket ──────────────────────────────────────────
function getWsUrl() {
  const token = api.getToken()
  const establishmentId = api.getEstablishmentId()
  if (!token || !establishmentId) return null

  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
  const host = window.location.hostname
  return `${protocol}${host}/ws/kds/${establishmentId}?token=${encodeURIComponent(token)}`
}

function connectWebSocket() {
  if (ws) {
    try { ws.close() } catch (e) { /* ignore */ }
    ws = null
  }

  const url = getWsUrl()
  if (!url) {
    console.warn('[KDS] Cannot connect WS: missing token or establishment_id')
    scheduleReconnect()
    return
  }

  try {
    ws = new WebSocket(url)
  } catch (e) {
    console.warn('[KDS] WS creation failed:', e.message)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    console.log('[KDS] WS connected')
    connected.value = true
    reconnectAttempt = 0
    stopFallbackPolling()
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleWsMessage(msg)
    } catch (e) {
      console.warn('[KDS] WS parse error:', e.message)
    }
  }

  ws.onerror = (err) => {
    console.warn('[KDS] WS error')
  }

  ws.onclose = (event) => {
    console.log(`[KDS] WS closed (code=${event.code})`)
    connected.value = false
    ws = null
    startFallbackPolling()
    scheduleReconnect()
  }
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'new_order':
      upsertOrder(msg.data)
      playNotification()
      showIncomingPulse()
      knownIds.add(msg.data.id)
      showFlash('📦 Nouvelle commande !')
      break

    case 'status_update': {
      // Backend format: { type, order_id, status, data, timestamp }
      // Also support legacy nested: { type, data: { order_id, status } }
      const orderId = msg.order_id || (msg.data && msg.data.order_id)
      const newStatus = msg.status || (msg.data && msg.data.status)
      const updatedData = msg.data && msg.data !== msg ? msg.data : null
      if (orderId && newStatus) {
        updateOrderStatus(orderId, newStatus, updatedData)
      }
      break
    }

    case 'validate_order':
      // Legacy: another KDS client validated an item
      handleValidateOrder(msg.data || msg)
      break

    case 'course_called':
      // New course bons released — reload to pick them up
      showFlash('📋 Nouveau service appelé')
      loadOrders()
      break

    default:
      console.log('[KDS] Unknown message type:', msg.type, msg)
  }
}

function upsertOrder(orderData) {
  const idx = orders.value.findIndex(o => o.id === orderData.id)
  if (idx >= 0) {
    orders.value[idx] = { ...orders.value[idx], ...orderData }
    orders.value = [...orders.value]
  } else {
    // Mark as new for CSS animation
    orderData._new = true
    orders.value = [orderData, ...orders.value]
    // Remove _new flag after animation
    setTimeout(() => {
      const o = orders.value.find(x => x.id === orderData.id)
      if (o) {
        o._new = false
        orders.value = [...orders.value]
      }
    }, 2000)
  }
}

function updateOrderStatus(orderId, newStatus, updatedData) {
  const order = orders.value.find(o => o.id === orderId)
  if (!order) return

  order.status = newStatus

  // If the backend sent back updated items, use them
  if (updatedData && updatedData.items && Array.isArray(updatedData.items)) {
    order.items = updatedData.items
  } else {
    // Otherwise, advance items based on the new status
    if (newStatus === 'preparing') {
      // Only advance pending items to preparing
      ;(order.items || []).forEach(item => {
        if (item.status === 'pending' || item.status === 'printing' || item.status === 'printed') {
          item.status = 'preparing'
        }
      })
    } else if (newStatus === 'ready') {
      ;(order.items || []).forEach(item => {
        if (item.status !== 'served' && item.status !== 'ready') {
          item.status = 'ready'
        }
      })
    } else if (newStatus === 'served') {
      ;(order.items || []).forEach(item => {
        item.status = 'served'
      })
    }
  }

  orders.value = [...orders.value]
}

function handleValidateOrder(data) {
  const { order_id, item_index } = data
  const order = orders.value.find(o => o.id === order_id)
  if (!order) return

  if (item_index === null || item_index === undefined) {
    // Whole order: advance all items by one step
    const nextStatus = _nextItemStatus(order.status)
    ;(order.items || []).forEach(item => {
      item.status = nextStatus
    })
    order.status = _nextOrderStatus(order.status)
  } else {
    // Single item
    const item = (order.items || [])[item_index]
    if (item) {
      item.status = _nextItemStatus(item.status)
    }
    // Recompute order status from items
    order.status = _orderStatusFromItems(order.items || [], order.status)
  }

  orders.value = [...orders.value]
}

function _nextItemStatus(current) {
  const flow = ['pending', 'preparing', 'ready', 'served']
  const idx = flow.indexOf(current)
  if (idx >= 0 && idx < flow.length - 1) return flow[idx + 1]
  return current
}

function _nextOrderStatus(current) {
  // Order flow: preparing → ready → served (skipping pending/printing/printed)
  if (current === 'pending' || current === 'printing' || current === 'printed') return 'preparing'
  if (current === 'preparing') return 'ready'
  if (current === 'ready') return 'served'
  return current
}

function _orderStatusFromItems(items, current) {
  const rank = { pending: 0, printing: 0, printed: 0, preparing: 1, ready: 2, served: 3 }
  let lowest = 99, highest = -1
  items.forEach(i => {
    const r = rank[i.status] || 0
    if (r < lowest) lowest = r
    if (r > highest) highest = r
  })
  if (lowest === 3) return 'served'
  if (lowest >= 2) return 'ready'
  if (highest >= 1) return 'preparing'
  return current
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const delay = Math.min(
    WS_RECONNECT_BASE * Math.pow(2, reconnectAttempt),
    WS_RECONNECT_MAX
  )
  reconnectAttempt++

  console.log(`[KDS] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, delay)
}

function startFallbackPolling() {
  if (fallbackTimer) return
  fallbackActive = true
  console.log('[KDS] Starting HTTP polling fallback (30s)')
  loadOrders()
  fallbackTimer = setInterval(loadOrders, FALLBACK_INTERVAL)
}

function stopFallbackPolling() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer)
    fallbackTimer = null
  }
  fallbackActive = false
}

// ── API calls ───────────────────────────────────────────
function extractList(res) {
  const data = res?.data?.data || res?.data || res || {}
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  return []
}

async function loadOrders() {
  if (!fallbackActive) loading.value = true
  error.value = null
  try {
    const res = await api.get('/cash/kds/cuisine?include_served=true')
    const items = extractList(res)

    // Detect new orders → audio + visual alert
    if (fallbackActive) {
      const incoming = items.filter(i => i.status !== 'served')
      const fresh = incoming.filter(i => !knownIds.has(i.id))
      if (fresh.length && knownIds.size > 0) {
        playNotification()
        showIncomingPulse()
        showFlash('📦 Nouvelle commande !')
      }
      fresh.forEach(i => knownIds.add(i.id))
    }

    const liveIds = new Set(items.map(i => i.id))
    for (const id of knownIds) if (!liveIds.has(id)) knownIds.delete(id)

    orders.value = items
  } catch (e) {
    console.warn('[KDS] API /cash/kds indisponible, fallback /sales/entries:', e.message)
    try {
      const today = new Date()
      const iso = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
      ].join('-')
      const res = await api.get(`/sales/entries?date_from=${iso}&date_to=${iso}&validation_status=pending`)
      const data = res?.data || res
      const entries = Array.isArray(data) ? data : false
      if (entries) {
        orders.value = entries.map(entry => ({
          id: entry.id,
          ticket_id: entry.id,
          ticket_ref: entry.ref_number || entry.number || entry.id,
          station: 'cuisine',
          items: (entry.line_items || []).map(li => ({
            name: li.item_name_original || li.product_name || li.recipe_name || 'Produit',
            qty: Number(li.quantity) || 1,
            note: li.notes || li.comment || null,
            status: 'pending',
          })),
          status: 'pending',
          created_at: entry.created_at || entry.date,
        }))
        return
      }
    } catch (e2) {
      console.warn('[KDS] Fallback échoué:', e2.message)
    }
    error.value = e.message || 'Serveur injoignable'
    if (!orders.value.length) orders.value = []
  } finally {
    loading.value = false
  }
}

function loadDemo() {
  error.value = null
  loading.value = false
  connected.value = true
  const nowDate = new Date()
  orders.value = [
    {
      id: 'demo-1',
      ticket_ref: 'A123',
      station: 'cuisine',
      status: 'pending',
      created_at: new Date(nowDate.getTime() - 18 * 60000).toISOString(),
      items: [
        { name: 'Burger Classique', qty: 2, note: 'Sans oignons', status: 'pending' },
        { name: 'Frites Maison', qty: 2, status: 'pending' },
        { name: 'Salade Verte', qty: 1, status: 'pending' },
      ],
    },
    {
      id: 'demo-2',
      ticket_ref: 'A124',
      station: 'cuisine',
      status: 'preparing',
      created_at: new Date(nowDate.getTime() - 8 * 60000).toISOString(),
      items: [
        { name: 'Pizza Margherita', qty: 1, note: 'Sans gluten', status: 'preparing' },
        { name: 'Tiramisu', qty: 2, status: 'pending' },
      ],
    },
    {
      id: 'demo-3',
      ticket_ref: 'A125',
      station: 'cuisine',
      status: 'ready',
      created_at: new Date(nowDate.getTime() - 3 * 60000).toISOString(),
      items: [
        { name: 'Tagliatelles Carbonara', qty: 1, status: 'ready' },
        { name: 'Salade César', qty: 1, status: 'ready' },
      ],
    },
  ]
  orders.value.forEach(o => knownIds.add(o.id))
  playNotification()
  showFlash('🎮 Mode démonstration activé')
}

// ── Toggle ─────────────────────────────────────────────
function toggleOrder(id) {
  expanded.value[id] = !expanded.value[id]
}

// ── Mark item validate/ready/serve (advances by one step) ─
async function markItemReady(orderId, itemIndex) {
  const key = itemKey(orderId, itemIndex)
  actionLoading.value[key] = true
  try {
    await api.post(`/cash/kds/cuisine/orders/${orderId}/validate`, { item_index: itemIndex })

    // Optimistic local update: advance the item one step
    const order = orders.value.find(o => o.id === orderId)
    if (order && order.items && order.items[itemIndex]) {
      order.items[itemIndex].status = _nextItemStatus(order.items[itemIndex].status)
      order.status = _orderStatusFromItems(order.items, order.status)
      orders.value = [...orders.value]
    }

    showFlash('✅ Plat mis à jour')
  } catch (e) {
    showFlash('❌ ' + (e.message || 'Échec'), 'err')
    // Reload on error to get real state
    await loadOrders()
  } finally {
    actionLoading.value[key] = false
  }
}

// ── Mark whole order advanced by one step ──────────────
async function markOrderReady(orderId) {
  actionLoading.value[orderId] = true
  try {
    await api.post(`/cash/kds/cuisine/orders/${orderId}/validate`, { item_index: null })

    // Optimistic local update
    const order = orders.value.find(o => o.id === orderId)
    if (order) {
      const nextSta = _nextOrderStatus(order.status)
      order.status = nextSta
      ;(order.items || []).forEach(item => {
        const rank = { pending: 0, printing: 0, printed: 0, preparing: 1, ready: 2, served: 3 }
        const itemRank = rank[item.status] || 0
        const nextRank = rank[nextSta] || 0
        if (itemRank < nextRank) {
          item.status = nextSta
        }
      })
      orders.value = [...orders.value]
    }

    const labels = { preparing: 'validée', ready: 'prête', served: 'servie' }
    const label = labels[orders.value.find(o => o.id === orderId)?.status] || 'mise à jour'
    showFlash(`✅ Commande ${label}`)
  } catch (e) {
    showFlash('❌ ' + (e.message || 'Échec'), 'err')
    await loadOrders()
  } finally {
    actionLoading.value[orderId] = false
  }
}

// ── Lifecycle ──────────────────────────────────────────
let clockTimer

function resumeAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    if (ctx.state === 'suspended') ctx.resume()
  } catch (e) { /* ignore */ }
  document.removeEventListener('pointerdown', resumeAudio)
}

function cleanupWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  stopFallbackPolling()
  if (ws) {
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    try { ws.close() } catch (e) { /* ignore */ }
    ws = null
  }
}

onMounted(() => {
  loadOrders()
  connectWebSocket()
  // Clock tick every second for live timer
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
  document.addEventListener('pointerdown', resumeAudio, { once: true })
})

onUnmounted(() => {
  cleanupWebSocket()
  clearInterval(clockTimer)
  document.removeEventListener('pointerdown', resumeAudio)
})
</script>

<style scoped>
/* ═══ Variables ═══ */
:root {
  --kds-font-size: 14px;
  --kds-card-radius: 14px;
}

/* ═══ Layout ═══ */
.kds-view {
  padding: 16px 14px;
  padding-bottom: 100px;
  min-height: 100dvh;
}

/* ═══ Notification Pulse Overlay ═══ */
.new-order-pulse {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(5, 150, 105, 0.92);
  color: #fff;
  z-index: 500;
  font-size: 28px;
  font-weight: 800;
  animation: pulse-in 0.3s ease-out, pulse-out 1.8s ease-in forwards;
  pointer-events: none;
}
.new-order-pulse .pulse-icon { font-size: 48px; }
.new-order-pulse .pulse-text { font-size: 24px; }
@keyframes pulse-in {
  from { opacity: 0; transform: scale(1.2); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes pulse-out {
  0%, 40% { opacity: 1; }
  100% { opacity: 0; }
}

/* ═══ Header ═══ */
.kds-header { margin-bottom: 14px; }
.kds-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.kds-title-row h2 {
  font-size: 22px;
  color: var(--text, #fff);
  margin: 0;
  font-weight: 700;
}
.kds-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--card-bg, #1e1e32);
  color: var(--text, #fff);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.header-btn:active { background: #059669; }
.kds-header-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted, #888);
}
.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  transition: background 0.3s;
}
.status-dot.connected { background: #10b981; }
.status-dot.disconnected { background: #ef4444; }
.kds-subtitle {
  font-size: 13px;
  color: var(--muted, #888);
  margin-top: 4px;
}

/* ═══ KPI ═══ */
.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.kpi-card {
  flex: 1 1 auto;
  min-width: 70px;
  background: var(--card-bg, #1e1e32);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 14px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.kpi-label {
  font-size: 10px;
  color: var(--muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
}
.kpi-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--text, #fff);
  margin-top: 4px;
}
.kpi-value.kpi-time { font-size: 14px; }
.kpi-value.urgent { color: #ef4444; }

/* ═══ Filters ═══ */
.kds-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  flex-wrap: nowrap;
}
.kds-filters::-webkit-scrollbar { display: none; }
.filter-btn {
  flex-shrink: 0;
  padding: 10px 16px;
  border-radius: 24px;
  border: 1px solid var(--card-border, #2a2a40);
  background: var(--card-bg, #1e1e32);
  color: var(--muted, #aaa);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.filter-btn.active { background: #059669; color: #fff; border-color: #059669; }
.filter-btn.filter-pending.active { background: #f59e0b; border-color: #f59e0b; }
.filter-btn.filter-preparing.active { background: #6366f1; border-color: #6366f1; }
.filter-btn.filter-ready.active { background: #10b981; border-color: #10b981; }
.filter-btn.filter-served.active { background: #6b7280; border-color: #6b7280; }
.filter-count {
  font-size: 11px;
  opacity: 0.7;
}

/* ═══ States ═══ */
.kds-loading,
.kds-error,
.kds-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 16px;
  color: var(--muted, #888);
  text-align: center;
}
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--card-border, #2a2a40);
  border-top-color: #059669;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-icon { font-size: 48px; margin-bottom: 10px; }
.error-text { font-size: 16px; color: #ef4444; margin-bottom: 18px; }
.empty-icon { font-size: 56px; margin-bottom: 8px; }
.empty-sub { font-size: 14px; margin-top: 6px; }
.btn-retry, .btn-demo {
  padding: 12px 28px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin: 6px;
}
.btn-retry { background: #6c5ce7; color: #fff; }
.btn-demo {
  background: var(--card-bg, #1e1e32);
  color: var(--text, #ddd);
  border: 1px solid var(--card-border, #2a2a40);
}

/* ═══ Order card ═══ */
.order-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.order-card {
  background: var(--card-bg, #1e1e32);
  border: 1px solid var(--card-border, #2a2a40);
  border-left: 5px solid #10b981;
  border-radius: 14px;
  padding: 14px 16px;
  transition: border-color 0.3s, opacity 0.3s, transform 0.2s;
}
.order-card.card-pending { border-left-color: #f59e0b; }
.order-card.card-printing { border-left-color: #f59e0b; }
.order-card.card-printed { border-left-color: #f59e0b; }
.order-card.card-preparing { border-left-color: #6366f1; }
.order-card.card-ready { border-left-color: #10b981; opacity: 0.85; }
.order-card.card-served { border-left-color: #6b7280; opacity: 0.45; }
.order-card.card-watch { border-left-color: #f59e0b; }
.order-card.card-urgent {
  border-left-color: #ef4444;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.25);
}

/* New order animation */
.order-card[data-new="true"] {
  animation: card-slide-in 0.4s ease-out;
}
@keyframes card-slide-in {
  from { transform: translateX(-20px); opacity: 0.3; }
  to { transform: translateX(0); opacity: 1; }
}

/* ═══ Card header ═══ */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 0;
}
.card-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}
.card-ticket {
  font-weight: 700;
  font-size: 18px;
  color: var(--text, #fff);
  white-space: nowrap;
}
.card-age {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.card-age.age-fresh { background: rgba(16,185,129,0.15); color: #10b981; }
.card-age.age-watch { background: rgba(245,158,11,0.15); color: #f59e0b; }
.card-age.age-late {
  background: rgba(239,68,68,0.15);
  color: #ef4444;
  animation: pulse 1.5s infinite;
}
@keyframes pulse { 50% { opacity: 0.5; } }
.age-icon { font-size: 14px; line-height: 1; }
.age-text { font-size: 13px; font-weight: 700; }

.card-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.card-status-badge {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 8px;
  letter-spacing: 0.3px;
}
.card-status-badge.status-pending,
.card-status-badge.status-printing,
.card-status-badge.status-printed { background: rgba(245,158,11,0.15); color: #f59e0b; }
.card-status-badge.status-preparing { background: rgba(99,102,241,0.15); color: #818cf8; }
.card-status-badge.status-ready { background: rgba(16,185,129,0.15); color: #10b981; }
.card-status-badge.status-served { background: rgba(107,114,128,0.15); color: #9ca3af; }
.chevron {
  color: var(--muted, #555);
  font-size: 14px;
  transition: transform 0.2s;
}
.chevron.open { transform: rotate(180deg); }

/* ═══ Items preview ═══ */
.items-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  cursor: pointer;
}
.preview-chip {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  color: var(--muted, #aaa);
  white-space: nowrap;
  border: 1px solid transparent;
}
.preview-chip.ready, .preview-chip.served {
  opacity: 0.5;
  text-decoration: line-through;
}

/* ═══ Detail ═══ */
.card-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--card-border, #2a2a40);
}
.detail-note {
  font-size: 14px;
  color: #f59e0b;
  background: rgba(245,158,11,0.08);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.detail-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border-left: 4px solid #f59e0b;
  transition: background 0.2s, border-color 0.2s;
}
.detail-item.preparing { border-left-color: #6366f1; }
.detail-item.ready { border-left-color: #10b981; opacity: 0.8; }
.detail-item.served { border-left-color: #6b7280; opacity: 0.45; }
.item-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.item-qty {
  font-weight: 700;
  color: #6c5ce7;
  font-size: 18px;
  min-width: 32px;
}
.item-name {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  color: var(--text, #ddd);
}
.item-badge {
  font-size: 13px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
}
.badge-ready { background: rgba(16,185,129,0.15); color: #10b981; }
.badge-served { background: rgba(107,114,128,0.15); color: #9ca3af; }
.item-note {
  font-size: 13px;
  color: #f59e0b;
  font-style: italic;
}
.item-timer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted, #aaa);
}
.timer-icon { font-size: 14px; }
.timer-text { font-family: monospace; letter-spacing: 1px; }
.item-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.item-action-btn {
  padding: 12px 22px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  min-width: 120px;
}
.item-action-btn:disabled { opacity: 0.35; }
.item-action-btn:active { transform: scale(0.96); }
.item-action-btn.action-validate { background: #f59e0b; color: #fff; }
.item-action-btn.action-ready { background: #059669; color: #fff; }

.detail-actions {
  margin-top: 12px;
}
.order-action-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.order-action-btn:disabled { opacity: 0.35; }
.order-action-btn:active { transform: scale(0.97); }
.order-action-btn.action-validate { background: #f59e0b; color: #fff; }
.order-action-btn.action-ready { background: #6366f1; color: #fff; }
.order-action-btn.action-serve { background: #10b981; color: #fff; }

/* ═══ Toast ═══ */
.toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(76px + env(safe-area-inset-bottom));
  background: #059669;
  color: #fff;
  text-align: center;
  padding: 14px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  z-index: 300;
  animation: toast-in 0.25s ease-out;
}
.toast.err { background: #ef4444; }
@keyframes toast-in {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>