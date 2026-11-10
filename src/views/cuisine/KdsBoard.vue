<template>
  <div class="kdsb-shell" @pointerdown.capture="unlockAudio">
    <header class="kdsb-header">
      <div class="kdsb-header-left">
        <h1 class="kdsb-title">🍳 {{ t('kitchen.board.title') }}</h1>
        <span class="kdsb-subtitle">{{ t('kitchen.board.hint') }}</span>
      </div>
      <!-- Attente en direct : plus longue attente, bons en retard (> 15 min) -->
      <div v-if="wait.waiting" class="kdsb-wait" :class="{ late: wait.late }" role="status">
        <span>⏱ {{ formatElapsed(wait.longest) }}</span>
        <span v-if="wait.late" class="kdsb-wait-late">🔴 {{ t('kitchen.late.count', { count: wait.late }) }}</span>
      </div>
      <div class="kdsb-header-right">
        <router-link to="/cuisine" class="kdsb-icon-btn" :title="t('kitchen.board.listView')">☰</router-link>
        <button class="kdsb-icon-btn" :disabled="loading" :title="t('common.refresh')" @click="load()">
          <span :class="{ spinning: loading }">⟳</span>
        </button>
      </div>
    </header>

    <p v-if="error" class="kdsb-error" role="alert">
      ⚠️ {{ error }} <button class="kdsb-retry" @click="load()">{{ t('common.retry') }}</button>
    </p>

    <div class="kdsb-board">
      <section
        v-for="col in KDS_COLUMNS"
        :key="col"
        class="kdsb-col"
        :class="['col-' + col, { 'drop-target': drag && drag.over === col && drag.from !== col }]"
        :data-kds-column="col"
      >
        <h2 class="kdsb-col-title">
          {{ t('kitchen.board.columns.' + col) }}
          <span class="kdsb-col-count">{{ columns[col].length }}</span>
        </h2>

        <p v-if="!columns[col].length" class="kdsb-col-empty">{{ t('kitchen.board.emptyColumn') }}</p>

        <article
          v-for="o in columns[col]"
          :key="o.id"
          class="kdsb-card"
          :class="['age-' + ageLevel(elapsedMs(o.created_at, now)), { dragging: drag?.id === o.id, fresh: freshIds.has(o.id), late: isOrderLate(o, now) }]"
          :style="drag?.id === o.id ? dragStyle : null"
          :data-order-id="o.id"
        >
          <div
            class="kdsb-card-head"
            @pointerdown="startDrag($event, o, col)"
          >
            <span class="kdsb-grip" aria-hidden="true">⠿</span>
            <span class="kdsb-ref">{{ orderLabel(o) }}</span>
            <span v-if="isOrderLate(o, now)" class="kdsb-late-tag">{{ t('kitchen.late.tag') }}</span>
            <span class="kdsb-timer" :title="t('kitchen.board.elapsed')">
              ⏱ {{ formatElapsed(elapsedMs(o.created_at, now)) }}
            </span>
          </div>
          <ul class="kdsb-items">
            <li v-for="(item, idx) in o.items || []" :key="idx" :class="'item-' + item.status">
              <span class="kdsb-qty">{{ item.qty }}×</span> {{ item.name }}
              <span v-if="item.note" class="kdsb-note">📝 {{ item.note }}</span>
            </li>
          </ul>
          <div class="kdsb-actions">
            <button
              v-if="prevColumn(col)"
              class="kdsb-move"
              :disabled="busy[o.id]"
              :aria-label="t('kitchen.board.moveTo', { column: t('kitchen.board.columns.' + prevColumn(col)) })"
              @click="move(o, prevColumn(col))"
            >←</button>
            <button
              class="kdsb-move kdsb-move-next"
              :disabled="busy[o.id]"
              @click="move(o, nextStatus(col))"
            >{{ busy[o.id] ? '…' : nextLabel(col) }} →</button>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from '../../i18n'
import { reportKitchenOrders, vibrateNewOrder } from '../../shared/kitchenWatch'
import {
  KDS_COLUMNS, groupByColumn, elapsedMs, formatElapsed, ageLevel, findNewOrders,
  fetchKdsOrders, changeOrderStatus, withStatus, playNewOrderSound, unlockAudio,
} from '../../shared/kds'
import { isOrderLate, lateOrderIds, waitSummary, kitchenLateAlert } from '../../shared/lateAlerts'

const POLL_INTERVAL = 10000
const DRAG_THRESHOLD = 8

const { t } = useI18n()

const orders = ref([])
const loading = ref(false)
const error = ref(null)
const now = ref(Date.now())
const busy = ref({})
const freshIds = ref(new Set())
const knownIds = new Set()

const columns = computed(() => groupByColumn(orders.value))
const wait = computed(() => waitSummary(orders.value, now.value))

// Bon qui passe les 15 min : vibration (une fois par bon)
watch(now, (ts) => kitchenLateAlert.check(lateOrderIds(orders.value, ts)))

// Bons à jour (chargement ou déplacement) : badge « en attente » de l'app
watch(orders, list => reportKitchenOrders(list))

function toast(message, type = 'success') {
  window.__showToast?.(message, type)
}

function orderLabel(o) {
  const table = o.table_number ?? o.table
  return table != null && table !== '' ? t('common.table', { number: table }) : `#${String(o.ticket_ref || o.id).slice(-6)}`
}

function prevColumn(col) {
  const i = KDS_COLUMNS.indexOf(col)
  return i > 0 ? KDS_COLUMNS[i - 1] : null
}

// Après « Prêt » : servi (le bon quitte le tableau)
function nextStatus(col) {
  return KDS_COLUMNS[KDS_COLUMNS.indexOf(col) + 1] || 'served'
}

function nextLabel(col) {
  const next = nextStatus(col)
  return next === 'served' ? t('kitchen.actions.serve') : t('kitchen.board.columns.' + next)
}

/* ═══ Chargement + détection des nouvelles commandes ═══ */

let loadSeq = 0
async function load({ silent = false } = {}) {
  const seq = ++loadSeq
  if (!silent) loading.value = true
  try {
    const list = await fetchKdsOrders()
    if (seq !== loadSeq) return // une réponse plus récente (ou un déplacement) a déjà eu lieu
    const fresh = findNewOrders(knownIds, list)
    if (fresh.length) {
      playNewOrderSound()
      vibrateNewOrder()
      toast(t('kitchen.toast.newOrders', { count: fresh.length }))
      freshIds.value = new Set([...freshIds.value, ...fresh.map(o => o.id)])
      setTimeout(() => {
        const next = new Set(freshIds.value)
        fresh.forEach(o => next.delete(o.id))
        freshIds.value = next
      }, 4000)
    }
    knownIds.clear()
    list.forEach(o => knownIds.add(o.id))
    // Bons en cours de modification : on garde l'état local optimiste
    orders.value = list.map(o => (busy.value[o.id] ? orders.value.find(x => x.id === o.id) || o : o))
    error.value = null
  } catch (e) {
    if (seq === loadSeq) error.value = e.message || t('kitchen.errors.unreachable')
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

/* ═══ Changement de statut (bouton ou glisser-déposer) ═══ */

async function move(order, toStatus) {
  if (busy.value[order.id] || order.status === toStatus) return
  const before = orders.value.find(o => o.id === order.id)
  if (!before) return
  busy.value = { ...busy.value, [order.id]: true }
  loadSeq++ // invalide un rechargement en vol (il écraserait le déplacement)
  orders.value = orders.value.map(o => (o.id === order.id ? withStatus(o, toStatus) : o))
  try {
    await changeOrderStatus(before, toStatus)
    if (toStatus === 'served') orders.value = orders.value.filter(o => o.id !== order.id)
  } catch (e) {
    orders.value = orders.value.map(o => (o.id === order.id ? before : o))
    toast(e.code === 'backward_unsupported' ? t('kitchen.board.backwardUnsupported') : (e.message || t('kitchen.toast.failed')), 'error')
  } finally {
    const next = { ...busy.value }
    delete next[order.id]
    busy.value = next
  }
}

/* ═══ Glisser-déposer tactile (pointer events : le DnD HTML5 ne marche pas au doigt) ═══ */

const drag = ref(null)
const dragStyle = computed(() => drag.value?.active
  ? { transform: `translate(${drag.value.dx}px, ${drag.value.dy}px)`, zIndex: 50 }
  : null)

function columnAt(x, y) {
  const el = document.elementFromPoint?.(x, y)
  return el?.closest?.('[data-kds-column]')?.dataset.kdsColumn || null
}

function startDrag(e, order, col) {
  if (e.button != null && e.button !== 0) return
  if (busy.value[order.id]) return
  drag.value = { id: order.id, order, from: col, over: col, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, active: false }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', cancelDrag)
}

function onDragMove(e) {
  const d = drag.value
  if (!d) return
  d.dx = e.clientX - d.x0
  d.dy = e.clientY - d.y0
  if (!d.active && Math.hypot(d.dx, d.dy) < DRAG_THRESHOLD) return
  d.active = true
  d.over = columnAt(e.clientX, e.clientY) || d.over
  e.preventDefault?.()
}

function removeDragListeners() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', cancelDrag)
}

function endDrag(e) {
  const d = drag.value
  removeDragListeners()
  drag.value = null
  if (!d?.active) return
  const target = columnAt(e.clientX, e.clientY) || d.over
  if (target && target !== d.from) move(d.order, target)
}

function cancelDrag() {
  removeDragListeners()
  drag.value = null
}

/* ═══ Cycle de vie ═══ */

let pollTimer = null
let clockTimer = null

onMounted(() => {
  load()
  pollTimer = setInterval(() => { if (!drag.value) load({ silent: true }) }, POLL_INTERVAL)
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
  clearInterval(clockTimer)
  removeDragListeners()
})

defineExpose({ move, load })
</script>

<style scoped>
.kdsb-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100dvh;
  padding: 12px 12px calc(90px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14);
  color: var(--text, #fff);
}

.kdsb-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kdsb-header-left { display: flex; flex-direction: column; min-width: 0; }
.kdsb-title { font-size: 20px; font-weight: 800; margin: 0; }
.kdsb-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); }
.kdsb-header-right { display: flex; gap: 6px; }
.kdsb-icon-btn {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff); font-size: 18px; cursor: pointer; text-decoration: none;
}
.kdsb-icon-btn:disabled { opacity: 0.5; }
.spinning { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.kdsb-error { font-size: 13px; color: #ff8a8a; }
.kdsb-retry { margin-left: 6px; background: none; border: 1px solid currentColor; color: inherit; border-radius: 8px; padding: 2px 8px; }

/* Colonnes : défilement horizontal sur téléphone, 3 colonnes sur tablette */
.kdsb-board {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(78vw, 1fr);
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 6px;
}
@media (min-width: 720px) {
  .kdsb-board { grid-auto-columns: 1fr; overflow-x: visible; }
}

.kdsb-col {
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60vh;
  padding: 8px;
  border-radius: 14px;
  background: var(--card-bg, #1a1a2e);
  border: 2px solid transparent;
  transition: border-color 0.15s, background 0.15s;
}
.kdsb-col.drop-target { border-color: #059669; background: rgba(5, 150, 105, 0.12); }
.kdsb-col-title { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 800; margin: 2px 4px; }
.kdsb-col-count { font-size: 12px; padding: 1px 8px; border-radius: 10px; background: var(--card-border, #2a2a40); }
.kdsb-col-empty { font-size: 12px; color: var(--muted, #8a8aa0); text-align: center; padding: 20px 0; }

.kdsb-card {
  position: relative;
  border-radius: 12px;
  background: var(--bg, #0d0d14);
  border-left: 5px solid #10b981;
  padding: 8px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.kdsb-card.age-warn { border-left-color: #f59e0b; }
.kdsb-card.age-late { border-left-color: #ef4444; }
.kdsb-card.late { border-color: #ef4444; background: rgba(239, 68, 68, 0.12); animation: kdsb-late-pulse 1.6s ease-in-out infinite; }
@keyframes kdsb-late-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}
.kdsb-late-tag { padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; background: #ef4444; color: #fff; }
.kdsb-wait {
  display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
  font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; color: #10b981;
}
.kdsb-wait.late { color: #f87171; }
.kdsb-wait-late { font-size: 11px; }
.kdsb-card.dragging { opacity: 0.9; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45); }
.kdsb-card.fresh { animation: fresh 1s ease-in-out 3; }
@keyframes fresh { 50% { box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.7); } }

.kdsb-card-head {
  display: flex; align-items: center; gap: 6px;
  cursor: grab; touch-action: none; user-select: none;
}
.kdsb-grip { color: var(--muted, #8a8aa0); font-size: 18px; }
.kdsb-ref { font-weight: 800; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kdsb-timer { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; padding: 2px 8px; border-radius: 8px; background: rgba(16, 185, 129, 0.18); color: #34d399; }
.age-warn .kdsb-timer { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.age-late .kdsb-timer { background: rgba(239, 68, 68, 0.2); color: #f87171; }

.kdsb-items { list-style: none; margin: 6px 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: 14px; }
.kdsb-items .item-ready, .kdsb-items .item-served { opacity: 0.55; text-decoration: line-through; }
.kdsb-qty { font-weight: 800; }
.kdsb-note { display: block; font-size: 12px; color: #fbbf24; }

.kdsb-actions { display: flex; gap: 6px; }
.kdsb-move {
  min-height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--card-border, #2a2a40);
  background: var(--card-bg, #1a1a2e); color: var(--text, #fff); font-weight: 700; cursor: pointer;
}
.kdsb-move-next { flex: 1; background: #059669; border-color: #059669; color: #fff; }
.kdsb-move:disabled { opacity: 0.5; }
</style>
