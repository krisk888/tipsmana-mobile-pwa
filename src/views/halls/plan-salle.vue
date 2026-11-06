<template>
  <div class="plan-salle-shell">
    <!-- ═══ HEADER ═══ -->
    <header class="ps-header">
      <div class="ps-header-left">
        <button class="ps-back-btn" @click="goBack">
          <TipsIcon name="quitter" :size="20" />
        </button>
        <h1 class="ps-title">🪑 Plan de salle</h1>
      </div>
      <div class="ps-header-right">
        <button class="ps-refresh-btn" @click="loadSpaces" :disabled="loading" title="Rafraîchir">
          <span :class="{ spinning: loading }">⟳</span>
        </button>
      </div>
    </header>

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
        <span><span class="lgd lgd-libre"></span> Libre</span>
        <span><span class="lgd lgd-commande"></span> Commande</span>
        <span><span class="lgd lgd-occupee"></span> Occupé</span>
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
          v-for="t in activeSpace.tables"
          :key="t.number"
          class="ps-table"
          :class="[
            t.shape || 'round',
            t.size || 'medium',
            'state-' + (t.state || 'libre'),
            { dragging: isDragging && dragTable && dragTable.number === t.number }
          ]"
          :style="tableStyle(t)"
          @touchstart.prevent="onTouchStart(t, $event)"
          @mousedown.prevent="onTableMouseDown(t, $event)"
          @click.stop="onTableClick(t)"
        >
          <span class="ps-table-num">{{ t.number }}</span>
          <span v-if="t.state !== 'libre'" class="ps-table-info">
            <span class="ps-table-covers">👤{{ t.covers || 1 }}</span>
            <span class="ps-table-serveur">{{ t.serveur }}</span>
          </span>
        </div>

        <div v-if="!activeSpace.tables.length" class="ps-empty">
          Aucune table configurée dans cet espace.
        </div>
      </div>
    </div>

    <!-- ═══ LOADING / ERROR ═══ -->
    <div v-if="loading && !spaces.length" class="ps-loading">
      <span class="ps-spinner"></span>
      <span>Chargement du plan de salle…</span>
    </div>
    <div v-else-if="error" class="ps-error">
      <p>❌ {{ error }}</p>
      <button class="ps-retry-btn" @click="loadSpaces">Réessayer</button>
    </div>
    <div v-else-if="!spaces.length && !loading" class="ps-empty-full">
      <span class="ps-empty-icon">🪑</span>
      <p>Aucun espace configuré.</p>
      <p class="ps-empty-hint">Configurez le plan de salle depuis la caisse.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '../../shared/api'
import TipsIcon from '../../components/TipsIcon.vue'

const router = useRouter()

/* ═══ State ═══ */
const spaces = ref([])
const activeSpaceId = ref(null)
const loading = ref(false)
const error = ref(null)

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
    error.value = e.message || 'Erreur de chargement du plan de salle'
  } finally {
    loading.value = false
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

function startDrag(table, clientX, clientY) {
  dragTable.value = table
  draggingTableNumber.value = table.number
  isDragging.value = true
  // Offset between cursor and table visual center (already anchored at -50% -50%)
  const base = calcPercent(clientX, clientY)
  dragOffsetX.value = base.x - (table.x || 50)
  dragOffsetY.value = base.y - (table.y || 50)
}

function moveDrag(clientX, clientY) {
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

/* ═══ Clic table → navigation vers la caisse ═══ */
function onTableClick(table) {
  // Navigation vers la caisse avec cette table sélectionnée
  router.push({ path: '/caisse', query: { table: table.number } })
}

onMounted(() => {
  loadSpaces()
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
.state-addition { background: #f59e0b; color: #fff; }

/* Numéro de table */
.ps-table-num { font-weight: 700; line-height: 1.1; }
.ps-table-info { display: flex; flex-direction: column; align-items: center; font-size: 8px; line-height: 1.1; opacity: 0.9; margin-top: 1px; }
.ps-table-covers { font-size: 9px; }
.ps-table-serveur { font-size: 7px; max-width: 50px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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