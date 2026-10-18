<template>
  <div class="kds-view">
    <!-- ═══ HEADER ═══ -->
    <header class="kds-header">
      <div class="kds-title-row">
        <h2>🍳 Cuisine</h2>
        <div class="kds-header-status">
          <span class="status-dot" :class="{ connected, disconnected: !connected }"></span>
          <span class="status-text">{{ connected ? 'Connecté' : 'Hors ligne' }}</span>
        </div>
      </div>
      <p class="kds-subtitle">Écran cuisine — commandes en préparation</p>
    </header>

    <!-- ═══ KPI STRIP ═══ -->
    <div class="kpi-row">
      <div class="kpi-card">
        <span class="kpi-label">En attente</span>
        <span class="kpi-value">{{ pendingOrders.length }}</span>
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
      <button class="filter-btn" :class="{ active: filter === 'all' }" @click="filter = 'all'">
        En cours ({{ pendingOrders.length }})
      </button>
      <button class="filter-btn urgent-btn" :class="{ active: filter === 'urgent' }" @click="filter = 'urgent'">
        ⏰ Urgents ({{ urgentOrders.length }})
      </button>
      <button class="filter-btn served-btn" :class="{ active: filter === 'served' }" @click="filter = 'served'">
        ✅ Servis ({{ readyOrders.length }})
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
      <p class="empty-icon">🍽️</p>
      <p>Tout est servi, rien en attente</p>
      <p class="empty-sub">La cuisine respire…</p>
    </div>

    <!-- ═══ ORDER LIST ═══ -->
    <div v-else class="order-list">
      <div v-for="o in filteredOrders" :key="o.id" class="order-card" :class="cardClass(o)">
        <!-- Header row -->
        <div class="card-header" @click="toggleOrder(o.id)">
          <div class="card-header-left">
            <span class="card-ticket">#{{ shortId(o.ticket_ref || o.id) }}</span>
            <span class="card-age" :class="ageClass(o)">
              <span class="age-icon">{{ ageIcon(o) }}</span>
              {{ ageDisplay(o) }}
            </span>
          </div>
          <div class="card-header-right">
            <span
              class="card-status-badge"
              :class="(o.status === 'ready' || o.status === 'served') ? 'status-ready' : 'status-pending'"
            >
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
            <div v-for="(item, idx) in o.items" :key="idx" class="detail-item" :class="item.status">
              <div class="item-main">
                <span class="item-qty">{{ item.qty }}×</span>
                <span class="item-name">{{ item.name }}</span>
                <span v-if="item.status === 'ready'" class="item-ready-badge">✅</span>
                <span v-if="item.status === 'served'" class="item-ready-badge">☑️</span>
              </div>
              <div v-if="item.note" class="item-note">📝 {{ item.note }}</div>
              <div class="item-actions">
                <button
                  v-if="item.status === 'pending' || item.status === 'preparing' || item.status === 'printed' || item.status === 'printing'"
                  class="item-ready-btn"
                  @click.stop="markItemReady(o.id, idx)"
                  :disabled="actionLoading[`${o.id}-${idx}`]"
                >
                  {{ actionLoading[`${o.id}-${idx}`] ? '…' : '✅ Prêt' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Order-level action -->
          <div class="detail-actions">
            <button
              v-if="canMarkOrderReady(o)"
              class="order-ready-btn"
              @click.stop="markOrderReady(o.id)"
              :disabled="actionLoading[o.id]"
            >
              {{ actionLoading[o.id] ? '…' : '✅ Tout prêt — servir' }}
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
const orders = ref([])          // master list from API (pending + ready + served)
const loading = ref(true)
const error = ref(null)
const expanded = ref({})
const actionLoading = ref({})
const flash = ref(null)
const connected = ref(false)
const filter = ref('all')       // 'all' | 'urgent' | 'served'
const knownIds = new Set()      // ids seen on last poll (for new-order detection)
const now = ref(Date.now())

// ── WebSocket state ────────────────────────────────────
let ws = null                   // WebSocket instance
let reconnectAttempt = 0        // exponential backoff counter
let reconnectTimer = null       // scheduled reconnect timeout
let fallbackTimer = null        // HTTP polling fallback interval
let fallbackActive = false      // true when WS is down and HTTP fallback is running
const WS_RECONNECT_MAX = 30000  // max backoff 30s
const WS_RECONNECT_BASE = 1000  // initial backoff 1s
const FALLBACK_INTERVAL = 30000 // 30s HTTP polling fallback

// ── Computed ────────────────────────────────────────────
const pendingOrders = computed(() =>
  orders.value.filter(o => o.status !== 'served')
)

const urgentOrders = computed(() =>
  orders.value.filter(o => {
    if (o.status === 'served') return false
    const m = ageMinutes(o.created_at)
    return m !== null && m > 15
  })
)

const readyOrders = computed(() =>
  orders.value.filter(o => o.status === 'ready' || o.status === 'served')
)

const sortedOrders = computed(() =>
  [...pendingOrders.value].sort((a, b) =>
    (new Date(a.created_at) || 0) - (new Date(b.created_at) || 0)
  )
)

const filteredOrders = computed(() => {
  if (filter.value === 'urgent') return urgentOrders.value
  if (filter.value === 'served') return readyOrders.value
  return sortedOrders.value
})

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

function ageDisplay(o) {
  const min = ageMinutes(o.created_at)
  if (min === null) return '—'
  if (min < 1) return "< 1 min"
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h${min % 60}`
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
  const cls = []
  if (o.status === 'served') cls.push('card-served')
  else if (o.status === 'ready') cls.push('card-ready')
  else if (min !== null && min > 15) cls.push('card-urgent')
  else if (min !== null && min > 5) cls.push('card-watch')
  return cls.join(' ')
}

function previewItems(o) {
  return (o.items || []).slice(0, 4)
}

function canMarkOrderReady(o) {
  if (!o.items || !o.items.length) return false
  return o.items.some(i =>
    i.status === 'pending' || i.status === 'preparing' ||
    i.status === 'printed' || i.status === 'printing'
  )
}

function showFlash(text, type = 'ok') {
  flash.value = { text, type }
  setTimeout(() => { flash.value = null }, 3000)
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
  // Close any existing connection cleanly
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
    // onerror fires before onclose, so we handle cleanup in onclose
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
      // Upsert the new order into the list
      upsertOrder(msg.data)
      playNotification()
      knownIds.add(msg.data.id)
      showFlash('📦 Nouvelle commande !')
      break

    case 'status_update':
      // Update an order's status in-place
      updateOrderStatus(msg.data.order_id, msg.data.status)
      break

    case 'validate_order':
      // Another device validated this order — update items locally
      handleValidateOrder(msg.data)
      break

    default:
      console.log('[KDS] Unknown message type:', msg.type, msg)
  }
}

function upsertOrder(orderData) {
  const idx = orders.value.findIndex(o => o.id === orderData.id)
  if (idx >= 0) {
    // Update existing
    orders.value[idx] = { ...orders.value[idx], ...orderData }
    // Force reactivity
    orders.value = [...orders.value]
  } else {
    // Insert new
    orders.value = [orderData, ...orders.value]
  }
}

function updateOrderStatus(orderId, newStatus) {
  const order = orders.value.find(o => o.id === orderId)
  if (!order) return
  order.status = newStatus
  // Also update items if the whole order is ready/served
  if (newStatus === 'ready' || newStatus === 'served') {
    ;(order.items || []).forEach(item => {
      if (item.status !== 'served') item.status = newStatus === 'served' ? 'served' : 'ready'
    })
  }
  // Force reactivity
  orders.value = [...orders.value]
}

function handleValidateOrder(data) {
  const { order_id, item_index } = data
  const order = orders.value.find(o => o.id === order_id)
  if (!order) return

  if (item_index === null || item_index === undefined) {
    // Whole order validated
    order.status = 'ready'
    ;(order.items || []).forEach(item => { item.status = 'ready' })
  } else {
    // Single item validated
    const item = (order.items || [])[item_index]
    if (item) item.status = 'ready'
    // If all items are now ready, mark order ready
    if ((order.items || []).every(i => i.status === 'ready' || i.status === 'served')) {
      order.status = 'ready'
    }
  }
  // Force reactivity
  orders.value = [...orders.value]
}

function scheduleReconnect() {
  // Clear any pending reconnect
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
  if (fallbackTimer) return // already running
  fallbackActive = true
  console.log('[KDS] Starting HTTP polling fallback (30s)')
  loadOrders() // immediate first fetch
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
  // Don't set loading on fallback polls to avoid flicker
  if (!fallbackActive) loading.value = true
  error.value = null
  try {
    const res = await api.get('/cash/kds/cuisine?include_served=true')
    const items = extractList(res)

    // Detect new orders → audio alert (only when fallback is active)
    if (fallbackActive) {
      const incoming = items.filter(i => i.status !== 'served')
      const fresh = incoming.filter(i => !knownIds.has(i.id))
      if (fresh.length && knownIds.size > 0) playNotification()
      fresh.forEach(i => knownIds.add(i.id))
    }
    // Remove ids that no longer exist (order served)
    const liveIds = new Set(items.map(i => i.id))
    for (const id of knownIds) if (!liveIds.has(id)) knownIds.delete(id)

    orders.value = items
  } catch (e) {
    console.warn('[KDS] API /cash/kds indisponible, fallback /sales/entries:', e.message)
    // Fallback: sales entries "pending" (stub compatible)
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
      status: 'pending',
      created_at: new Date(nowDate.getTime() - 8 * 60000).toISOString(),
      items: [
        { name: 'Pizza Margherita', qty: 1, note: 'Sans gluten', status: 'pending' },
        { name: 'Tiramisu', qty: 2, status: 'pending' },
      ],
    },
    {
      id: 'demo-3',
      ticket_ref: 'A125',
      station: 'cuisine',
      status: 'pending',
      created_at: new Date(nowDate.getTime() - 3 * 60000).toISOString(),
      items: [{ name: 'Tagliatelles Carbonara', qty: 1, status: 'pending' }],
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

// ── Mark item ready (line-level) ───────────────────────
async function markItemReady(orderId, itemIndex) {
  const key = `${orderId}-${itemIndex}`
  actionLoading.value[key] = true
  try {
    await api.post(`/cash/kds/cuisine/orders/${orderId}/validate`, { item_index: itemIndex })
    await loadOrders()
    showFlash('✅ Article prêt')
  } catch (e) {
    showFlash('❌ ' + (e.message || 'Échec validation'), 'err')
  } finally {
    actionLoading.value[key] = false
  }
}

// ── Mark whole order ready ────────────────────────────
async function markOrderReady(orderId) {
  actionLoading.value[orderId] = true
  try {
    await api.post(`/cash/kds/cuisine/orders/${orderId}/validate`, { item_index: null })
    await loadOrders()
    showFlash('✅ Commande prête à servir')
  } catch (e) {
    showFlash('❌ ' + (e.message || 'Échec validation'), 'err')
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
    // Remove handlers so onclose doesn't trigger reconnect during cleanup
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    try { ws.close() } catch (e) { /* ignore */ }
    ws = null
  }
}

onMounted(() => {
  // Initial data load
  loadOrders()

  // Connect WebSocket for real-time updates
  connectWebSocket()

  // Clock tick for age calculations
  clockTimer = setInterval(() => { now.value = Date.now() }, 5000)

  // Unlock audio on first user gesture
  document.addEventListener('pointerdown', resumeAudio, { once: true })
})

onUnmounted(() => {
  cleanupWebSocket()
  clearInterval(clockTimer)
  document.removeEventListener('pointerdown', resumeAudio)
})
</script>

<style scoped>
/* ═══ Layout ═══ */
.kds-view {
  padding: 12px;
  padding-bottom: 90px;
  min-height: 100dvh;
}

/* ═══ Header ═══ */
.kds-header { margin-bottom: 12px; }
.kds-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.kds-title-row h2 {
  font-size: 20px;
  color: var(--text, #fff);
  margin: 0;
}
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
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  transition: background 0.3s;
}
.status-dot.connected { background: #10b981; }
.status-dot.disconnected { background: #ef4444; }
.kds-subtitle {
  font-size: 12px;
  color: var(--muted, #888);
  margin-top: 3px;
}

/* ═══ KPI ═══ */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.kpi-card {
  background: var(--card-bg, #1e1e32);
  border: 1px solid var(--card-border, #2a2a40);
  border-radius: 12px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.kpi-label {
  font-size: 10px;
  color: var(--muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.kpi-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text, #fff);
  margin-top: 3px;
}
.kpi-value.kpi-time { font-size: 13px; }
.kpi-value.urgent { color: #ef4444; }

/* ═══ Filters ═══ */
.kds-filters {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.kds-filters::-webkit-scrollbar { display: none; }
.filter-btn {
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid var(--card-border, #2a2a40);
  background: var(--card-bg, #1e1e32);
  color: var(--muted, #aaa);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.filter-btn.active {
  background: #059669;
  color: #fff;
  border-color: #059669;
}
.filter-btn.urgent-btn.active { background: #ef4444; border-color: #ef4444; }
.filter-btn.served-btn.active { background: #6366f1; border-color: #6366f1; }

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
  width: 32px;
  height: 32px;
  border: 3px solid var(--card-border, #2a2a40);
  border-top-color: #059669;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-icon { font-size: 40px; margin-bottom: 8px; }
.error-text { font-size: 14px; color: #ef4444; margin-bottom: 16px; }
.empty-icon { font-size: 48px; margin-bottom: 6px; }
.empty-sub { font-size: 12px; margin-top: 4px; }
.btn-retry, .btn-demo {
  padding: 10px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin: 4px;
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
  gap: 10px;
}
.order-card {
  background: var(--card-bg, #1e1e32);
  border: 1px solid var(--card-border, #2a2a40);
  border-left: 4px solid #10b981;
  border-radius: 12px;
  padding: 12px 14px;
  transition: border-color 0.3s, opacity 0.3s;
}
.order-card.card-watch { border-left-color: #f59e0b; }
.order-card.card-urgent { border-left-color: #ef4444; }
.order-card.card-ready { border-left-color: #6366f1; opacity: 0.85; }
.order-card.card-served { border-left-color: #6b7280; opacity: 0.5; }

/* ═══ Card header ═══ */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 0;
}
.card-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.card-ticket {
  font-weight: 700;
  font-size: 15px;
  color: var(--text, #fff);
  white-space: nowrap;
}
.card-age {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.card-age.age-fresh { background: rgba(16,185,129,0.15); color: #10b981; }
.card-age.age-watch { background: rgba(245,158,11,0.15); color: #f59e0b; }
.card-age.age-late {
  background: rgba(239,68,68,0.15);
  color: #ef4444;
  animation: pulse 1.5s infinite;
}
@keyframes pulse { 50% { opacity: 0.5; } }
.age-icon { font-size: 12px; line-height: 1; }

.card-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.card-status-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.3px;
}
.card-status-badge.status-pending { background: rgba(245,158,11,0.15); color: #f59e0b; }
.card-status-badge.status-ready { background: rgba(99,102,241,0.15); color: #818cf8; }
.chevron {
  color: var(--muted, #555);
  font-size: 12px;
  transition: transform 0.2s;
}
.chevron.open { transform: rotate(180deg); }

/* ═══ Items preview ═══ */
.items-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  cursor: pointer;
}
.preview-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
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
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--card-border, #2a2a40);
}
.detail-note {
  font-size: 12px;
  color: #f59e0b;
  background: rgba(245,158,11,0.08);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
}
.detail-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  border-left: 3px solid #f59e0b;
  transition: background 0.2s;
}
.detail-item.ready { border-left-color: #6366f1; opacity: 0.7; }
.detail-item.served { border-left-color: #6b7280; opacity: 0.4; }
.item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-qty {
  font-weight: 700;
  color: #6c5ce7;
  font-size: 14px;
  min-width: 28px;
}
.item-name {
  flex: 1;
  font-size: 14px;
  color: var(--text, #ddd);
}
.item-ready-badge { font-size: 14px; }
.item-note { font-size: 11px; color: #f59e0b; font-style: italic; }
.item-actions {
  display: flex;
  justify-content: flex-end;
}
.item-ready-btn {
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: #059669;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.item-ready-btn:disabled { opacity: 0.4; }
.item-ready-btn:active { background: #047857; }

.detail-actions {
  margin-top: 10px;
}
.order-ready-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.order-ready-btn:disabled { opacity: 0.4; }
.order-ready-btn:active { background: #4f46e5; }

/* ═══ Toast ═══ */
.toast {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(76px + env(safe-area-inset-bottom));
  background: #059669;
  color: #fff;
  text-align: center;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  z-index: 300;
  animation: toast-in 0.25s ease-out;
}
.toast.err { background: #ef4444; }
@keyframes toast-in {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
