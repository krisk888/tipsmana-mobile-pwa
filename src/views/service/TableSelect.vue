<template>
  <div class="svc-shell" :class="{ 'merge-mode': mergeMode }">
    <!-- ═══ HEADER ═══ -->
    <header class="svc-header">
      <div class="svc-header-left">
        <h1 class="svc-title">🍽 {{ t('tables.title') }}</h1>
        <span class="svc-subtitle">{{ establishmentName }}</span>
      </div>
      <div class="svc-header-right">
        <button class="svc-icon-btn svc-scan-btn" :title="t('tables.scanQr')" @click="scannerOpen = true">📷</button>
        <router-link to="/service/history" class="svc-icon-btn" :title="t('common.titles.serviceHistory')">🧾</router-link>
        <router-link to="/service/report" class="svc-icon-btn" :title="t('common.titles.serviceReport')">📊</router-link>
        <router-link to="/service/profile" class="svc-icon-btn" :title="t('common.titles.serviceProfile')">👤</router-link>
        <button class="svc-icon-btn" :disabled="loading" :title="t('common.refresh')" @click="load()">
          <span :class="{ spinning: loading }">⟳</span>
        </button>
      </div>
    </header>

    <!-- Tirer vers le bas : tables et notes rechargées -->
    <PullIndicator :distance="pullDistance" :refreshing="pullRefreshing" :threshold="PULL_THRESHOLD" />

    <!-- Bascule d'établissement (boss multi-établissement) -->
    <div v-if="authStore.establishments.length > 1" class="svc-est">
      <EstablishmentSwitcher />
    </div>

    <p v-if="mergeMode" class="svc-merge-hint">{{ t('tables.merge.hint') }}</p>

    <!-- ═══ FILTRES ═══ -->
    <div class="svc-chips">
      <button
        v-for="f in filters"
        :key="f.key"
        class="svc-chip"
        :class="{ active: filter === f.key }"
        @click="filter = f.key"
      >
        {{ f.label }} <span class="svc-chip-count">{{ f.count }}</span>
      </button>
      <button
        class="svc-merge-btn"
        :class="{ active: mergeMode }"
        :title="t('tables.merge.title')"
        @click="toggleMergeMode"
      >{{ mergeMode ? '✕ ' + t('common.cancel') : '🔗 ' + t('tables.merge.button') }}</button>
    </div>

    <div v-if="spaces.length > 1" class="svc-chips svc-spaces">
      <button
        v-for="s in spaces"
        :key="s.id"
        class="svc-chip"
        :class="{ active: activeSpaceId === s.id }"
        @click="activeSpaceId = s.id"
      >{{ s.icon }} {{ s.id === '__autres' ? t('tables.otherSpace') : s.name }}</button>
    </div>

    <!-- ═══ LÉGENDE STATUTS + MASQUER LIBRES ═══ -->
    <div v-if="loaded && spaceTables.length" class="svc-status-bar">
      <div class="svc-legend">
        <span
          v-for="s in statusCounts"
          :key="s.state"
          class="svc-legend-item"
          :class="'legend-' + s.state"
          :title="t('tables.states.' + s.state)"
        >{{ STATUS_DOTS[s.state] }} {{ t('tables.states.' + s.state) }} <b>{{ s.count }}</b></span>
      </div>
      <label class="svc-hide-free">
        <input v-model="hideFree" type="checkbox" class="svc-hide-free-input" />
        <span>{{ t('tables.hideFree') }}</span>
      </label>
    </div>
    <p v-if="lastUpdate" class="svc-updated">{{ t('tables.updatedAt', { time: lastUpdate }) }}</p>

    <!-- ═══ ÉTATS ═══ -->
    <div v-if="loading && !loaded" class="svc-state">
      <span class="svc-spinner"></span>
      <span>{{ t('tables.loading') }}</span>
    </div>
    <div v-else-if="error && !spaces.length" class="svc-state svc-error">
      <p>⚠️ {{ error }}</p>
      <button class="btn-primary" @click="load()">{{ t('common.retry') }}</button>
    </div>

    <template v-else>
      <p v-if="partial" class="svc-warning">⚠️ {{ t('tables.partial') }}</p>
      <p v-if="late.size" class="svc-late-banner" role="status">🔴 {{ t('tables.late.banner', { count: late.size }) }}</p>

      <!-- ═══ GRILLE TABLES ═══ -->
      <div v-if="visibleTables.length" class="svc-table-grid">
        <button
          v-for="table in visibleTables"
          :key="table.number"
          class="svc-table"
          :class="['state-' + table.state, { selected: mergeMode && selected.includes(table.number), late: late.has(table.number) }]"
          :aria-label="t('tables.tableAria', { number: table.number, state: stateLabel(table.state) })"
          @click="pickTable(table)"
        >
          <span v-if="mergeMode && selected.includes(table.number)" class="svc-table-check">✓</span>
          <span v-else class="svc-table-badge" :class="'badge-' + table.state">{{ STATUS_DOTS[table.state] }}</span>
          <span class="svc-table-num">{{ table.number }}</span>
          <span class="svc-table-state">{{ stateLabel(table.state) }}</span>
          <span v-if="table.linkedTo" class="svc-table-link">↔ T{{ table.linkedTo }}</span>
          <span v-else-if="table.mergedWith?.length" class="svc-table-link">+ {{ table.mergedWith.join(', ') }}</span>
          <span v-if="table.state !== 'libre'" class="svc-table-meta">
            👤{{ table.covers || 1 }}<template v-if="table.itemCount"> · {{ t('tables.itemsShort', { count: table.itemCount }) }}</template>
          </span>
          <span v-if="table.total" class="svc-table-total">{{ formatEur(table.total) }}</span>
          <span v-if="late.has(table.number)" class="svc-table-late">⏱ {{ t('tables.late.minutes', { min: lateMinutes(late.get(table.number), now) }) }}</span>
        </button>
      </div>
      <div v-else class="svc-state">
        <span class="svc-empty-icon">🪑</span>
        <p>{{ emptyLabel }}</p>
      </div>

      <!-- ═══ TABLE HORS PLAN ═══ -->
      <div class="svc-manual">
        <label class="svc-manual-label" for="svc-manual-input">{{ t('tables.manual.label') }}</label>
        <input
          id="svc-manual-input"
          v-model="manualNumber"
          class="svc-manual-input"
          type="number"
          inputmode="numeric"
          min="1"
          max="999"
          :placeholder="t('tables.manual.placeholder')"
          @keydown.enter="openManual"
        />
        <button class="btn-primary" :disabled="!manualValid" @click="openManual">{{ t('common.open') }}</button>
      </div>
    </template>

    <!-- ═══ BARRE DE FUSION ═══ -->
    <div v-if="mergeMode" class="svc-merge-bar">
      <span class="svc-merge-count">
        {{ t('tables.merge.count', { count: selected.length }) }}<template v-if="selected.length"> · {{ selected.join(', ') }}</template>
      </span>
      <button class="btn-primary" :disabled="!canMerge" @click="openMergeConfirm">{{ t('tables.merge.button') }}</button>
    </div>

    <!-- ═══ CONFIRMATION FUSION ═══ -->
    <div v-if="mergeConfirm" class="modal-overlay" @click.self="mergeConfirm = null">
      <div class="modal-card">
        <div class="modal-title">🔗 {{ t('tables.merge.confirmTitle', { count: selected.length }) }}</div>
        <p class="modal-text">{{ t('tables.merge.confirmText') }}</p>
        <div class="covers-grid">
          <button
            v-for="n in selected"
            :key="n"
            class="covers-btn"
            :class="{ active: mergeConfirm.target === n }"
            @click="mergeConfirm.target = n"
          >{{ n }}</button>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" @click="mergeConfirm = null">{{ t('common.cancel') }}</button>
          <button class="btn-primary" :disabled="mergeConfirm.busy" @click="confirmMerge">{{ t('tables.merge.button') }}</button>
        </div>
      </div>
    </div>

    <!-- ═══ SCAN QR TABLE ═══ -->
    <QrTableScanner v-if="scannerOpen" @detected="onScanned" @close="scannerOpen = false" />

    <!-- ═══ MODAL COUVERTS ═══ -->
    <div v-if="coversFor" class="modal-overlay" @click.self="coversFor = null">
      <div class="modal-card">
        <div class="modal-title">👥 {{ t('common.table', { number: coversFor.number }) }}</div>
        <p class="modal-text">{{ t('tables.covers.title') }}</p>
        <div class="covers-grid">
          <button
            v-for="n in 12"
            :key="n"
            class="covers-btn"
            :class="{ active: covers === n }"
            @click="covers = n"
          >{{ n }}</button>
        </div>
        <div class="modal-actions">
          <button class="btn-ghost" @click="coversFor = null">{{ t('common.cancel') }}</button>
          <button class="btn-primary" @click="confirmCovers">{{ t('tables.covers.start') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import EstablishmentSwitcher from '../../components/EstablishmentSwitcher.vue'
import QrTableScanner from '../../components/QrTableScanner.vue'
import PullIndicator from '../../components/PullIndicator.vue'
import { usePullToRefresh, PULL_THRESHOLD } from '../../shared/pullToRefresh'
import { fetchTables, formatEur, mergeTableTickets, currentEstablishmentId } from '../../shared/serviceOrders'
import { lateTables, lateMinutes, tableLateAlert } from '../../shared/lateAlerts'
import { useI18n } from '../../i18n'

const router = useRouter()
const authStore = useAuthStore()
const { t, intlLocale } = useI18n()

const spaces = ref([])
const activeSpaceId = ref(null)
const filter = ref('all')
const loading = ref(false)
const loaded = ref(false)
const error = ref(null)
const partial = ref(false)
const manualNumber = ref('')
const coversFor = ref(null)
const covers = ref(2)
const scannerOpen = ref(false)
const mergeMode = ref(false)
const selected = ref([])
const mergeConfirm = ref(null)
const lastUpdate = ref('')

// Badge par statut : 🟢 libre · 🔴 occupée · 🟡 réservée · ⚪ en attente (addition demandée)
const STATUS_DOTS = { libre: '🟢', occupee: '🔴', reservee: '🟡', addition: '⚪' }
const STATUS_ORDER = ['libre', 'occupee', 'reservee', 'addition']

// « Masquer les tables libres » : mémorisé sur l'appareil
const HIDE_FREE_KEY = 'tipsmana_hide_free_tables'
const hideFree = ref(readHideFree())
watch(hideFree, (v) => {
  try { localStorage.setItem(HIDE_FREE_KEY, v ? '1' : '0') } catch { /* mode privé */ }
})

function readHideFree() {
  try { return localStorage.getItem(HIDE_FREE_KEY) === '1' } catch { return false }
}

// Table en retard : envoi en cuisine il y a plus de 15 min, ni prêt ni servi
// (suivi local, relu toutes les 15 s) → rouge + vibration une fois par table
const LATE_TICK = 15000
const now = ref(Date.now())
let lateTimer = null
const late = computed(() => lateTables(currentEstablishmentId(), now.value))
watch(late, (m) => tableLateAlert.check([...m.keys()]), { immediate: true })

// Statut des tables rafraîchi toutes les 30 s (et au retour sur l'onglet)
const POLL_INTERVAL = 30000
let pollTimer = null

const establishmentName = computed(() => authStore.establishment?.name || '')

const activeSpace = computed(() =>
  spaces.value.find(s => s.id === activeSpaceId.value) || spaces.value[0] || null
)

const spaceTables = computed(() => activeSpace.value?.tables || [])

const filters = computed(() => {
  const all = spaceTables.value
  return [
    { key: 'all', label: t('common.all'), count: all.length },
    { key: 'libre', label: t('tables.filters.free'), count: all.filter(x => x.state === 'libre').length },
    { key: 'occupee', label: t('tables.filters.busy'), count: all.filter(x => x.state !== 'libre').length },
  ]
})

const statusCounts = computed(() =>
  STATUS_ORDER.map(state => ({ state, count: spaceTables.value.filter(x => x.state === state).length }))
    .filter(s => s.count || s.state === 'libre' || s.state === 'occupee')
)

const visibleTables = computed(() => {
  let list = spaceTables.value
  if (filter.value === 'libre') list = list.filter(x => x.state === 'libre')
  if (filter.value === 'occupee') list = list.filter(x => x.state !== 'libre')
  // En mode fusion on garde les libres : elles peuvent rejoindre la note
  if (hideFree.value && !mergeMode.value) list = list.filter(x => x.state !== 'libre')
  return list
})

const emptyLabel = computed(() => {
  if (!spaceTables.value.length) return t('tables.empty.noTables')
  if (hideFree.value && filter.value !== 'occupee') return t('tables.empty.allFreeHidden')
  return t('tables.empty.filter')
})

const manualValid = computed(() => {
  const n = Number(manualNumber.value)
  return Number.isInteger(n) && n > 0 && n < 1000
})

const canMerge = computed(() =>
  selected.value.length >= 2 && selected.value.some(n => findTable(n)?.ticketId)
)

function stateLabel(state) {
  return t(`tables.states.${STATUS_DOTS[state] ? state : 'libre'}`)
}

const { distance: pullDistance, refreshing: pullRefreshing } = usePullToRefresh(() => load())

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const res = await fetchTables()
    spaces.value = res.spaces
    partial.value = res.partial
    error.value = null
    lastUpdate.value = new Date().toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
    if (!spaces.value.some(s => s.id === activeSpaceId.value)) {
      activeSpaceId.value = spaces.value[0]?.id || null
    }
  } catch (e) {
    if (!silent) error.value = e.message || t('tables.errors.load')
  } finally {
    loading.value = false
    loaded.value = true
  }
}

function findTable(number) {
  for (const s of spaces.value) {
    const table = s.tables.find(x => x.number === number)
    if (table) return table
  }
  return null
}

function pickTable(table) {
  if (mergeMode.value) return toggleSelected(table)
  // Table rattachée à une note fusionnée : on ouvre la table principale
  if (table.linkedTo) {
    router.push({ name: 'ServiceOrder', params: { number: table.linkedTo } })
    return
  }
  if (table.state === 'libre') {
    covers.value = 2
    coversFor.value = table
    return
  }
  router.push({ name: 'ServiceOrder', params: { number: table.number } })
}

/* ═══ Fusion ═══ */
function toast(message, type = 'success') {
  if (window.__showToast) window.__showToast(message, type)
}

function toggleMergeMode() {
  mergeMode.value = !mergeMode.value
  selected.value = []
  mergeConfirm.value = null
}

function toggleSelected(table) {
  const n = table.linkedTo || table.number
  selected.value = selected.value.includes(n)
    ? selected.value.filter(x => x !== n)
    : [...selected.value, n].sort((a, b) => a - b)
}

function openMergeConfirm() {
  if (!canMerge.value) return
  // Par défaut : la plus petite table qui a déjà une note
  const target = selected.value.find(n => findTable(n)?.ticketId) ?? selected.value[0]
  mergeConfirm.value = { target, busy: false }
}

async function confirmMerge() {
  const conf = mergeConfirm.value
  if (!conf || conf.busy) return
  conf.busy = true
  try {
    const res = await mergeTableTickets({ tableNumbers: selected.value, targetTable: conf.target })
    const tables = selected.value.join(', ')
    mergeConfirm.value = null
    mergeMode.value = false
    selected.value = []
    if (res.queued) {
      toast(t('tables.merge.queued'), 'warning')
      return
    }
    toast(t('tables.merge.done', { tables, target: conf.target }))
    router.push({ name: 'ServiceOrder', params: { number: conf.target } })
  } catch (e) {
    conf.busy = false
    toast(e.data?.detail || e.message || t('tables.merge.failed'), 'error')
  }
}

function confirmCovers() {
  const table = coversFor.value
  coversFor.value = null
  router.push({ name: 'ServiceOrder', params: { number: table.number }, query: { covers: covers.value, open: 1 } })
}

function openManual() {
  if (!manualValid.value) return
  const number = Number(manualNumber.value)
  manualNumber.value = ''
  openNumber(number)
}

function openNumber(number) {
  pickTable(findTable(number) || { number, state: 'libre' })
}

function onScanned(number) {
  scannerOpen.value = false
  openNumber(number)
}

// Onglet en arrière-plan : pas de requête ; au retour, rafraîchissement immédiat
function poll() {
  if (typeof document !== 'undefined' && document.hidden) return
  load(true)
}

function onVisibility() {
  if (!document.hidden) load(true)
}

onMounted(() => {
  load()
  pollTimer = setInterval(poll, POLL_INTERVAL)
  lateTimer = setInterval(() => { now.value = Date.now() }, LATE_TICK)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (lateTimer) clearInterval(lateTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.svc-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100dvh;
  padding: 12px 12px calc(90px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14);
  color: var(--text, #fff);
}

.svc-shell.merge-mode { padding-bottom: calc(150px + env(safe-area-inset-bottom)); }

/* ─── Header ─── */
.svc-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.svc-header-left { display: flex; flex-direction: column; min-width: 0; }
.svc-title { font-size: 20px; font-weight: 800; margin: 0; }
.svc-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.svc-header-right { display: flex; gap: 6px; }
.svc-icon-btn {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff); font-size: 18px; cursor: pointer; text-decoration: none;
}
.svc-icon-btn:disabled { opacity: 0.5; }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Fusion ─── */
.svc-merge-btn {
  flex-shrink: 0; margin-left: auto; height: 36px; padding: 0 12px; border-radius: 10px; cursor: pointer; white-space: nowrap;
  border: 1px solid #8b5cf6; background: rgba(139, 92, 246, 0.12); color: #a78bfa;
  font-size: 13px; font-weight: 800;
}
.svc-merge-btn.active { background: #8b5cf6; color: #fff; }
.svc-merge-hint { font-size: 12px; color: #a78bfa; margin: 0; }
.svc-table { position: relative; }
.svc-table.late {
  border-color: #ef4444; background: rgba(239, 68, 68, 0.14);
  animation: svc-late-pulse 1.6s ease-in-out infinite;
}
@keyframes svc-late-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}
.svc-table-late { font-size: 11px; font-weight: 800; color: #f87171; }
.svc-late-banner {
  margin: 0; padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 800;
  color: #fca5a5; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4);
}
.svc-table.selected { border-color: #8b5cf6; box-shadow: 0 0 0 2px #8b5cf6 inset; }
.svc-table-check {
  position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #8b5cf6; color: #fff; font-size: 12px; font-weight: 800;
}
.svc-table-link { font-size: 10px; font-weight: 800; color: #a78bfa; }
.svc-merge-bar {
  position: fixed; left: 8px; right: 8px; bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 90;
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 16px;
  border: 1px solid #8b5cf6; background: var(--card-bg, #1a1a2e); box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.45);
}
.svc-merge-count { flex: 1; font-size: 13px; font-weight: 700; }

/* ─── Chips ─── */
.svc-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.svc-chips::-webkit-scrollbar { display: none; }
.svc-chip {
  flex-shrink: 0; padding: 8px 14px; border-radius: 20px;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--muted, #8a8aa0); font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.svc-chip.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.svc-chip-count { font-size: 11px; opacity: 0.75; margin-left: 2px; }

/* ─── Grille tables ─── */
.svc-table-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.svc-table {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  min-height: 92px; padding: 10px 4px; border-radius: 14px; cursor: pointer;
  border: 2px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff); transition: transform 0.1s;
}
.svc-table:active { transform: scale(0.95); }
.svc-table-num { font-size: 24px; font-weight: 800; line-height: 1; }
.svc-table-state { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
.svc-table-meta { font-size: 11px; color: var(--muted, #8a8aa0); }
.svc-table-total { font-size: 12px; font-weight: 800; }
.svc-table-badge { position: absolute; top: 5px; right: 6px; font-size: 11px; line-height: 1; }

/* Couleur de fond par statut : vert libre, rouge occupée, jaune réservée, gris en attente */
.svc-table.state-libre { border-color: rgba(16, 185, 129, 0.55); background: rgba(16, 185, 129, 0.10); }
.svc-table.state-libre .svc-table-state { color: var(--success, #10b981); }
.svc-table.state-occupee { border-color: var(--danger, #ef4444); background: rgba(239, 68, 68, 0.14); }
.svc-table.state-occupee .svc-table-state,
.svc-table.state-occupee .svc-table-total { color: var(--danger, #ef4444); }
.svc-table.state-reservee { border-color: #eab308; background: rgba(234, 179, 8, 0.14); }
.svc-table.state-reservee .svc-table-state { color: #eab308; }
.svc-table.state-addition { border-color: #9ca3af; background: rgba(156, 163, 175, 0.16); }
.svc-table.state-addition .svc-table-state,
.svc-table.state-addition .svc-table-total { color: #9ca3af; }

/* ─── Légende statuts ─── */
.svc-status-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.svc-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; font-weight: 700; color: var(--muted, #8a8aa0); }
.svc-legend-item b { color: var(--text, #fff); margin-left: 1px; }
.svc-hide-free { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; cursor: pointer; }
.svc-hide-free-input { width: 16px; height: 16px; accent-color: var(--primary, #10b981); }
.svc-updated { margin: -4px 0 0; font-size: 10px; color: var(--muted, #8a8aa0); }

/* ─── Saisie manuelle ─── */
.svc-manual {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 14px;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
}
.svc-manual-label { font-size: 13px; font-weight: 700; flex: 1; }
.svc-manual-input {
  width: 84px; padding: 10px; border-radius: 10px; font-size: 16px; font-weight: 800; text-align: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}

/* ─── États ─── */
.svc-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: 48px 16px; text-align: center; color: var(--muted, #8a8aa0);
}
.svc-error { color: var(--danger, #ef4444); }
.svc-empty-icon { font-size: 44px; }
.svc-warning { font-size: 12px; color: var(--amber, #f59e0b); margin: 0; }
.svc-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: spin 0.7s linear infinite;
}

/* ─── Modal ─── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(3px);
}
.modal-card {
  width: 92%; max-width: 400px; padding: 20px; border-radius: 18px;
  display: flex; flex-direction: column; gap: 10px;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}
.modal-title { font-size: 17px; font-weight: 800; }
.modal-text { font-size: 13px; color: var(--muted, #8a8aa0); margin: 0; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
.covers-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.covers-btn {
  padding: 14px 4px; border-radius: 10px; font-size: 18px; font-weight: 800; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14); color: var(--text, #fff);
}
.covers-btn.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }

.btn-primary {
  padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--primary, #10b981); color: #0d0d14; font-size: 14px; font-weight: 800;
}
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-ghost {
  padding: 12px 18px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14);
  color: var(--text, #fff); font-size: 14px; font-weight: 700;
}
</style>
