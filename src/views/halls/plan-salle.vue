<template>
  <div class="plan-salle-shell">
    <!-- ═══ HEADER ═══ -->
    <header class="ps-header">
      <div class="ps-header-left">
        <button class="ps-back-btn" @click="goBack">
          <TipsIcon name="quitter" :size="20" />
        </button>
        <h1 class="ps-title">{{ t('halls.title') }}</h1>
      </div>
      <div class="ps-header-right">
        <span class="ps-ws-status" :class="{ connected }" :title="connected ? t('halls.wsConnected') : t('halls.wsDisconnected')">
          <span class="ps-ws-dot"></span>
        </span>
        <button class="ps-refresh-btn" @click="loadSpaces" :disabled="loading" :title="t('common.refresh')">
          <span :class="{ spinning: loading }">⟳</span>
        </button>
      </div>
    </header>

    <!-- Tirer vers le bas : plan et notes rechargés -->
    <PullIndicator :distance="pullDistance" :refreshing="pullRefreshing" :threshold="PULL_THRESHOLD" />

    <!-- ═══ ONGLETS ESPACES ═══ -->
    <div class="ps-tabs" v-if="spaces.length > 0">
      <button
        v-for="s in spaces"
        :key="s.id"
        class="ps-tab"
        :class="{ active: activeSpaceId === s.id }"
        @click="activeSpaceId = s.id"
      >
        {{ s.icon }} {{ s.name }}
        <span class="ps-tab-count">({{ occupiedCount(s) }})</span>
      </button>
    </div>

    <!-- ═══ CANEVAS PLAN ═══ -->
    <div class="ps-canvas-wrap" v-if="activeSpace">
      <div class="ps-legend">
        <span><span class="lgd lgd-libre"></span> {{ t('halls.legend.free') }}</span>
        <span><span class="lgd lgd-commande"></span> {{ t('halls.legend.order') }}</span>
        <span><span class="lgd lgd-occupee"></span> {{ t('halls.legend.occupied') }}</span>
        <span><span class="lgd lgd-reservee"></span> {{ t('halls.legend.reserved') }}</span>
      </div>

      <div
        class="ps-canvas"
        ref="canvasRef"
        @touchmove.prevent="onTouchMove"
        @touchend="onDragEnd"
        @mousemove="onMouseMove"
        @mouseup="onDragEnd"
        @mouseleave="onDragEnd"
      >
        <div
          v-for="tb in activeSpace.tables"
          :key="tb.number"
          class="ps-table"
          :class="[
            tb.shape || 'round',
            tb.size || 'medium',
            'state-' + (tb.state || 'libre'),
            { dragging: isDragging && dragTable && dragTable.number === tb.number }
          ]"
          :style="tableStyle(tb)"
          @touchstart.prevent="onTouchStart(tb, $event)"
          @mousedown.prevent="onTableMouseDown(tb, $event)"
          @click.stop="onTableClick(tb)"
          @contextmenu.prevent"
        >
          <span class="ps-table-num">{{ tb.number }}</span>
          <span v-if="tb.state !== 'libre'" class="ps-table-info">
            <span class="ps-table-covers">👤{{ tb.covers || 1 }}</span>
            <span class="ps-table-serveur">{{ tb.serveur }}</span>
          </span>
          <!-- Floating action: navigate to caisse -->
          <div
            v-if="tableActionsShown === tb.number"
            class="ps-table-actions"
            @click.stop
          >
            <button
              class="ps-ta-btn"
              @click.stop="navigateToCaisse(tb)"
              :title="t('halls.viewInCaisse')"
            >🛒</button>
            <button
              class="ps-ta-btn"
              @click.stop="openHistory(tb)"
              :title="t('halls.history.action')"
              :aria-label="t('halls.history.action')"
            >🕘</button>
            <button
              class="ps-ta-btn ps-ta-close"
              @click.stop="hideTableActions"
              :title="t('common.close')"
            >✕</button>
          </div>
        </div>

        <div v-if="!activeSpace.tables.length" class="ps-empty">
          {{ t('halls.noTables') }}
        </div>
      </div>
    </div>

    <p v-if="activeSpace && activeSpace.tables.length" class="ps-hint">{{ t('halls.history.longPressHint') }}</p>

    <!-- Appui long sur une table : historique du jour -->
    <TableHistorySheet v-if="historyTable != null" :table="historyTable" @close="historyTable = null" />

    <!-- ═══ LOADING / ERROR ═══ -->
    <div v-if="loading && !spaces.length" class="ps-loading">
      <span class="ps-spinner"></span>
      <span>{{ t('halls.loading') }}</span>
    </div>
    <div v-else-if="error" class="ps-error">
      <p>❌ {{ error }}</p>
      <button class="ps-retry-btn" @click="loadSpaces">{{ t('common.retry') }}</button>
    </div>
    <div v-else-if="!spaces.length && !loading" class="ps-empty-full">
      <span class="ps-empty-icon">🪑</span>
      <p>{{ t('halls.noSpaces') }}</p>
      <p class="ps-empty-hint">{{ t('halls.noSpacesHint') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../shared/api'
import TipsIcon from '../../components/TipsIcon.vue'
import TableHistorySheet from '../../components/TableHistorySheet.vue'
import PullIndicator from '../../components/PullIndicator.vue'
import { usePullToRefresh, PULL_THRESHOLD } from '../../shared/pullToRefresh'
import { fetchOpenTickets } from '../../shared/serviceOrders'
import { createLongPress } from '../../shared/longPress'
import { useI18n } from '../../i18n'

const { t } = useI18n()

const router = useRouter()

/* ═══ State ═══ */
const spaces = ref([])
const activeSpaceId = ref(null)
const loading = ref(false)
const error = ref(null)
const connected = ref(false) // état du temps réel (WebSocket KDS)

const canvasRef = ref(null)

/* Drag state — on sauvegarde la table en drag + offsets */
const dragTable = ref(null) // référence mutable pour update
const draggingTableNumber = ref(null)
const dragOffsetX = ref(0)
const dragOffsetY = ref(0)
const isDragging = ref(false)

/* ═══ Computed ═══ */
const activeSpace = computed(() =>
  spaces.value.find(s => s.id === activeSpaceId.value) || null
)

function occupiedCount(space) {
  if (!space?.tables) return 0
  return space.tables.filter(t => t.state !== 'libre').length
}

function tableStyle(t) {
  return {
    left: `${Math.max(2, Math.min(95, t.x || 50))}%`,
    top: `${Math.max(2, Math.min(95, t.y || 50))}%`,
    transform: 'translate(-50%, -50%)',
  }
}

/* ═══ Navigation ═══ */
function goBack() {
  router.back()
}

/* ═══ Chargement ═══ */
async function loadSpaces() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get('/floorplan/spaces')
    const list = res?.data || []
    spaces.value = list
    if (list.length > 0 && !activeSpaceId.value) {
      activeSpaceId.value = list[0].id
    }
  } catch (e) {
    error.value = e.message || t('halls.loadError')
  } finally {
    loading.value = false
  }
}

// Tirer pour rafraîchir : pas depuis une table (glisser = déplacer la table)
const { distance: pullDistance, refreshing: pullRefreshing } = usePullToRefresh(
  () => Promise.all([loadSpaces(), fetchOpenTickets().catch(() => {})]),
  { ignore: '.ps-table' },
)

/* ═══ Rafraîchissement silencieux (temps réel) ═══ */
// Met à jour les états des tables (libre/occupée/addition/réservée) depuis les
// autres terminaux SANS afficher le spinner ni écraser un drag en cours.
async function refreshSpacesSilent() {
  // Notes ouvertes relevées en parallèle : alimente l'historique d'occupation
  fetchOpenTickets().catch(() => {})
  if (isDragging.value) return // ne pas écraser la position pendant un drag
  try {
    const res = await api.get('/floorplan/spaces')
    const list = res?.data || []
    if (list.length) {
      // Conserve l'onglet actif ; ne remplace que si l'espace existe encore
      const stillExists = list.some(s => s.id === activeSpaceId.value)
      spaces.value = list
      if (!stillExists && list.length) activeSpaceId.value = list[0].id
    }
  } catch {
    // silencieux — le rafraîchissement manuel reste disponible
  }
}

/* ═══ Temps réel — WebSocket KDS (même pattern que Orders.vue) ═══ */
let ws = null
let reconnectAttempt = 0
let reconnectTimer = null
let pollTimer = null
const WS_RECONNECT_MAX = 30000
const WS_RECONNECT_BASE = 1000
const POLL_INTERVAL = 10000 // polling 10s : les changements de tables ne passent pas tous par le WS

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
    console.warn('[PlanSalle] Impossible de connecter le WS (token/établissement manquant)')
    scheduleReconnect()
    return
  }
  try {
    ws = new WebSocket(url)
  } catch (e) {
    console.warn('[PlanSalle] Échec création WS:', e.message)
    scheduleReconnect()
    return
  }
  ws.onopen = () => {
    console.log('[PlanSalle] WS connecté')
    connected.value = true
    reconnectAttempt = 0
  }
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      handleWsMessage(msg)
    } catch (e) {
      console.warn('[PlanSalle] Erreur parse WS:', e.message)
    }
  }
  ws.onerror = () => {
    console.warn('[PlanSalle] Erreur WS')
  }
  ws.onclose = (event) => {
    console.log(`[PlanSalle] WS fermé (code=${event.code})`)
    connected.value = false
    ws = null
    scheduleReconnect()
  }
}

function handleWsMessage(msg) {
  // Les évènements commandes (new_order / status_update / course_called) changent
  // l'état des tables (occupée / addition) — on resynchronise le plan.
  switch (msg.type) {
    case 'new_order':
    case 'status_update':
    case 'course_called':
    case 'validate_order':
      refreshSpacesSilent()
      break
    default:
      break
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const delay = Math.min(WS_RECONNECT_BASE * Math.pow(2, reconnectAttempt), WS_RECONNECT_MAX)
  reconnectAttempt++
  console.log(`[PlanSalle] Reconnexion WS dans ${delay}ms (tentative ${reconnectAttempt})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, delay)
}

function cleanupWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    try { ws.close() } catch (e) { /* ignore */ }
    ws = null
  }
}

/* ═══ Drag & Drop — touch & mouse avec persistance ═══ */

function getTableInActiveSpace(num) {
  const sp = activeSpace.value
  if (!sp) return null
  return sp.tables.find(t => t.number === num)
}

/** Calcule la position en % à partir des coordonnées client/touch. */
function calcPercent(clientX, clientY) {
  if (!canvasRef.value) return { x: 50, y: 50 }
  const rect = canvasRef.value.getBoundingClientRect()
  const xPct = ((clientX - rect.left) / rect.width) * 100
  const yPct = ((clientY - rect.top) / rect.height) * 100
  return {
    x: Math.round(Math.max(2, Math.min(98, xPct))),
    y: Math.round(Math.max(2, Math.min(98, yPct))),
  }
}

/* ═══ Appui long → historique de la table ═══ */
const historyTable = ref(null)
// Un appui long ne doit ni déplacer la table ni changer son statut au relâcher
let suppressClick = false

const longPress = createLongPress({
  onLongPress(table) {
    // Fin du drag sans sauvegarde : la table n'a pas bougé au-delà du seuil
    isDragging.value = false
    draggingTableNumber.value = null
    suppressClick = true
    openHistory(table)
  },
})

function openHistory(table) {
  hideTableActions()
  historyTable.value = table.number
  navigator.vibrate?.(30)
}

function startDrag(table, clientX, clientY) {
  suppressClick = false
  longPress.start(table, clientX, clientY)
  dragTable.value = table
  draggingTableNumber.value = table.number
  isDragging.value = true
  // Offset between cursor and table visual center (already anchored at -50% -50%)
  const base = calcPercent(clientX, clientY)
  dragOffsetX.value = base.x - (table.x || 50)
  dragOffsetY.value = base.y - (table.y || 50)
}

function moveDrag(clientX, clientY) {
  longPress.move(clientX, clientY)
  if (!isDragging.value || draggingTableNumber.value === null) return
  const raw = calcPercent(clientX, clientY)
  // Apply the initial offset so the table tracks smoothly without jumping
  const newX = Math.round(Math.max(2, Math.min(98, raw.x - dragOffsetX.value)))
  const newY = Math.round(Math.max(2, Math.min(98, raw.y - dragOffsetY.value)))
  const table = getTableInActiveSpace(draggingTableNumber.value)
  if (!table) return
  table.x = newX
  table.y = newY
}

function onTouchStart(table, e) {
  const touch = e.touches[0]
  startDrag(table, touch.clientX, touch.clientY)
}

function onTableMouseDown(table, e) {
  if (e.button !== 0) return
  startDrag(table, e.clientX, e.clientY)
}

function onTouchMove(e) {
  const touch = e.touches[0]
  moveDrag(touch.clientX, touch.clientY)
}

function onMouseMove(e) {
  if (!isDragging.value) return
  moveDrag(e.clientX, e.clientY)
}

async function onDragEnd() {
  longPress.cancel()
  if (!isDragging.value || draggingTableNumber.value === null) return
  const table = getTableInActiveSpace(draggingTableNumber.value)
  isDragging.value = false
  draggingTableNumber.value = null

  if (table) {
    try {
      await api.put('/floorplan/spaces', {
        spaces: spaces.value.map(s => ({
          number: s.number,
          name: s.name,
          icon: s.icon || '🪑',
          sort_order: s.sort_order || 0,
          tables: s.tables.map(t => ({
            number: t.number,
            x: t.x || 50,
            y: t.y || 50,
            shape: t.shape || 'round',
            size: t.size || 'medium',
          })),
        })),
      })
    } catch {
      // silencieux — l'utilisateur reverra l'ancienne position au prochain load
    }
  }
}

/* ═══ Clic table → changer statut + navigation caisse ═══ */
function onTableClick(table) {
  if (suppressClick) { suppressClick = false; return }
  // Cycle through states: libre → occupée → réservée → libre
  const cycle = { 'libre': 'occupee', 'occupee': 'reservee', 'reservee': 'libre' }
  const nextState = cycle[table.state] || 'libre'
  const oldState = table.state

  // Optimistic update
  table.state = nextState

  // API call to persist
  api.put(`/floorplan/tables/${table.number}/status`, { status: nextState })
    .catch(() => {
      // Rollback on failure
      table.state = oldState
    })

  // Also offer navigation via a small floating action
  showTableActions(table)
}

const tableActionsShown = ref(null)
const tableActionsTable = ref(null)

function showTableActions(table) {
  tableActionsShown.value = table.number
  tableActionsTable.value = table
  setTimeout(() => {
    if (tableActionsShown.value === table.number) {
      tableActionsShown.value = null
    }
  }, 5000)
}

function hideTableActions() {
  tableActionsShown.value = null
  tableActionsTable.value = null
}

function navigateToCaisse(table) {
  router.push({ path: '/caisse', query: { table: table.number } })
  hideTableActions()
}

onMounted(() => {
  loadSpaces()
  connectWebSocket()
  // Polling 10s : synchronise les états de tables (libre/occupée/addition)
  // venus des autres terminaux, même sans évènement WS.
  pollTimer = setInterval(refreshSpacesSilent, POLL_INTERVAL)
})

onUnmounted(() => {
  longPress.cancel()
  cleanupWebSocket()
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
/* ═══ Layout ═══ */
.plan-salle-shell {
  display: flex; flex-direction: column;
  min-height: calc(100dvh - 80px);
  padding: 12px;
  gap: 8px;
}

/* ═══ Header ═══ */
.ps-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 0;
}
.ps-header-left { display: flex; align-items: center; gap: 8px; }
.ps-back-btn {
  background: none; border: none; color: var(--text, #fff);
  font-size: 20px; cursor: pointer; padding: 4px;
}
.ps-title { font-size: 18px; font-weight: 600; margin: 0; }
.ps-refresh-btn {
  background: none; border: none; color: var(--text, #fff);
  font-size: 20px; cursor: pointer; padding: 6px 10px;
  border-radius: 8px; transition: background 0.2s;
}
.ps-refresh-btn:active { background: rgba(255,255,255,0.1); }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ═══ Indicateur temps réel ═══ */
.ps-ws-status { display: inline-flex; align-items: center; padding: 6px 8px; }
.ps-ws-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #666; transition: background 0.3s;
}
.ps-ws-status.connected .ps-ws-dot {
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34,197,94,0.6);
  animation: ps-ws-pulse 2s ease-in-out infinite;
}
@keyframes ps-ws-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ═══ Onglets ═══ */
.ps-tabs {
  display: flex; gap: 6px; overflow-x: auto;
  padding: 4px 0; scrollbar-width: none;
  -ms-overflow-style: none;
}
.ps-tabs::-webkit-scrollbar { display: none; }
.ps-tab {
  flex-shrink: 0; padding: 8px 14px;
  border: 1px solid var(--nav-border, #2a2a40);
  background: var(--nav-bg, #1a1a2e);
  color: var(--nav-inactive, #6b6b7b);
  border-radius: 20px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.2s;
  white-space: nowrap;
}
.ps-tab.active {
  background: var(--nav-active, #059669);
  color: #fff; border-color: var(--nav-active, #059669);
}
.ps-tab-count { font-size: 11px; opacity: 0.7; margin-left: 2px; }

/* ═══ Canvas ═══ */
.ps-canvas-wrap { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.ps-legend {
  display: flex; gap: 12px; justify-content: center;
  padding: 8px 0; font-size: 12px; color: var(--nav-inactive, #6b6b7b);
}
.lgd { display: inline-block; width: 10px; height: 10px; border-radius: 50%; vertical-align: middle; margin-right: 4px; }
.lgd-libre { background: #22c55e; }
.lgd-commande { background: #f59e0b; }
.lgd-occupee { background: #ef4444; }
.lgd-reservee { background: #8b5cf6; }

.ps-canvas {
  position: relative; flex: 1; min-height: 340px;
  background: var(--nav-bg, #1a1a2e);
  border-radius: 12px; border: 1px solid var(--nav-border, #2a2a40);
  overflow: hidden; touch-action: none;
}

/* ═══ Tables ═══ */
.ps-table {
  position: absolute; cursor: grab; user-select: none;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 2px;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  will-change: left, top;
  z-index: 1;
}
.ps-table.dragging {
  z-index: 10; cursor: grabbing;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  transform: translate(-50%, -50%) scale(1.15) !important;
}

/* Taille */
.ps-table.small { width: 48px; height: 48px; font-size: 10px; }
.ps-table.medium { width: 56px; height: 56px; font-size: 11px; }
.ps-table.large { width: 66px; height: 66px; font-size: 12px; }

/* Forme */
.ps-table.round { border-radius: 50%; }
.ps-table.square { border-radius: 6px; }

/* États par couleur */
.state-libre { background: #22c55e; color: #fff; }
.state-occupee { background: #ef4444; color: #fff; }
.state-reservee { background: #8b5cf6; color: #fff; }
.state-addition { background: #f59e0b; color: #fff; }

/* ═══ Floating action popup ═══ */
.ps-table-actions {
  position: absolute;
  bottom: -36px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  z-index: 20;
  animation: ps-ta-in 0.2s ease-out;
  white-space: nowrap;
}
.ps-ta-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.6);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  transition: transform 0.1s;
}
.ps-ta-btn:active { transform: scale(0.9); }
.ps-ta-close { background: rgba(239,68,68,0.7); }
@keyframes ps-ta-in {
  from { opacity: 0; transform: translateX(-50%) translateY(6px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Numéro de table */
.ps-table-num { font-weight: 700; line-height: 1.1; }
.ps-table-info { display: flex; flex-direction: column; align-items: center; font-size: 8px; line-height: 1.1; opacity: 0.9; margin-top: 1px; }
.ps-table-covers { font-size: 9px; }
.ps-table-serveur { font-size: 7px; max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ps-hint { margin: 0; font-size: 11px; text-align: center; color: var(--nav-inactive, #6b6b7b); }

/* ═══ États ═══ */
.ps-empty { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--nav-inactive, #6b6b7b); font-size: 14px; pointer-events: none; }
.ps-loading, .ps-error, .ps-empty-full {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; color: var(--nav-inactive, #6b6b7b);
  padding: 40px; text-align: center;
}
.ps-spinner { width: 28px; height: 28px; border: 3px solid var(--nav-border, #2a2a40); border-top-color: var(--nav-active, #059669); border-radius: 50%; animation: spin 0.7s linear infinite; }
.ps-error { color: var(--danger, #ef4444); }
.ps-retry-btn {
  padding: 8px 20px; border-radius: 8px;
  background: var(--nav-active, #059669); color: #fff;
  border: none; font-size: 14px; cursor: pointer;
}
.ps-empty-icon { font-size: 48px; }
.ps-empty-hint { font-size: 13px; opacity: 0.7; }

/* ═══ Theme light ═══ */
:deep(.theme-light) .ps-canvas { background: #e8e8e0; border-color: #ccc; }
:deep(.theme-light) .ps-tab { background: #e8e8e0; border-color: #ccc; color: #7d7d75; }
:deep(.theme-light) .ps-tab.active { background: #059669; color: #fff; border-color: #059669; }
</style>