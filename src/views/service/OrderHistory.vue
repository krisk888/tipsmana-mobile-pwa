<template>
  <div class="oh-shell">
    <!-- ═══ HEADER ═══ -->
    <header class="oh-header">
      <button class="oh-back" title="Tables" @click="router.push('/service')">←</button>
      <div class="oh-header-main">
        <h1 class="oh-title">🧾 Commandes</h1>
        <span class="oh-subtitle">{{ activeCount }} table(s) en service</span>
      </div>
      <button class="oh-icon-btn" :disabled="loading" title="Rafraîchir" @click="load()">
        <span :class="{ spinning: loading }">⟳</span>
      </button>
    </header>

    <!-- ═══ FILTRES STATUT ═══ -->
    <div class="oh-chips">
      <button
        v-for="f in filters"
        :key="f.key"
        class="oh-chip"
        :class="{ active: filter === f.key }"
        @click="filter = f.key"
      >
        {{ f.label }} <span v-if="f.count" class="oh-chip-count">{{ f.count }}</span>
      </button>
    </div>

    <!-- ═══ ÉTATS ═══ -->
    <div v-if="loading && !loaded" class="oh-state">
      <span class="oh-spinner"></span>
      <span>Chargement des commandes…</span>
    </div>
    <div v-else-if="error && !orders.length" class="oh-state oh-error">
      <p>⚠️ {{ error }}</p>
      <button class="btn-primary" @click="load()">Réessayer</button>
    </div>
    <div v-else-if="!visibleOrders.length" class="oh-state">
      <span class="oh-empty-icon">✅</span>
      <p>{{ filter === 'all' ? 'Aucune commande en cours' : 'Aucune commande dans ce statut' }}</p>
    </div>

    <!-- ═══ LISTE PAR TABLE ═══ -->
    <div v-else class="oh-list">
      <div
        v-for="o in visibleOrders"
        :key="o.ticket.id"
        class="oh-card"
        :class="'status-' + o.status"
      >
        <div class="oh-card-header" @click="toggle(o.ticket.id)">
          <div class="oh-card-left">
            <span class="oh-card-table">Table {{ o.ticket.tableNumber }}</span>
            <span class="oh-badge" :class="'status-' + o.status">
              {{ ORDER_STATUSES[o.status].icon }} {{ ORDER_STATUSES[o.status].label }}
            </span>
          </div>
          <div class="oh-card-right">
            <span class="oh-card-total">{{ formatEur(o.ticket.totalTtc) }}</span>
            <span class="oh-chevron" :class="{ open: expanded[o.ticket.id] }">▾</span>
          </div>
        </div>
        <div class="oh-card-meta">
          <span>👤{{ o.ticket.covers }}</span>
          <span>{{ itemCount(o.ticket) }} art.</span>
          <span v-if="o.ticket.serveur">{{ o.ticket.serveur }}</span>
          <span v-if="o.ticket.openedAt">{{ timeLabel(o) }}</span>
          <span v-if="o.readyCount" class="oh-ready">🔔 {{ o.readyCount }} prêt(s) à servir</span>
          <span v-if="o.failedCount" class="oh-failed">⚠️ {{ o.failedCount }} non envoyé(s)</span>
        </div>

        <div v-if="expanded[o.ticket.id]" class="oh-detail">
          <div v-for="i in o.ticket.items" :key="i.id" class="oh-item">
            <span class="oh-item-qty">{{ i.qty }}×</span>
            <span class="oh-item-info">
              <span class="oh-item-name">{{ i.name }}</span>
              <span v-if="i.options || i.note" class="oh-item-sub">{{ [i.options, i.note].filter(Boolean).join(' · ') }}</span>
            </span>
            <span class="oh-item-price">{{ formatEur(i.qty * i.price) }}</span>
          </div>

          <div v-if="o.kitchenItems.length" class="oh-kitchen">
            <div class="oh-kitchen-title">Suivi cuisine</div>
            <div v-for="(k, idx) in o.kitchenItems" :key="idx" class="oh-kitchen-item">
              <span>{{ k.qty }}× {{ k.name }}</span>
              <span class="oh-kds" :class="'kds-' + k.status">{{ kdsLabel(k.status) }}</span>
            </div>
          </div>

          <div class="oh-totals">
            <span>HT {{ formatEur(o.ticket.totalHt) }}</span>
            <span>TVA {{ formatEur(o.ticket.totalTtc - o.ticket.totalHt) }}</span>
            <strong>TTC {{ formatEur(o.ticket.totalTtc) }}</strong>
          </div>

          <button
            v-if="o.status !== 'solde'"
            class="btn-primary oh-open"
            @click="router.push({ name: 'ServiceOrder', params: { number: o.ticket.tableNumber } })"
          >➕ Compléter la commande</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ORDER_STATUSES, formatEur, fetchOpenTickets, fetchKitchenItems,
  syncHistory, getKitchenRecord, orderStatus, currentEstablishmentId,
} from '../../shared/serviceOrders'

const router = useRouter()
const estId = currentEstablishmentId()

const orders = ref([])
const loading = ref(false)
const loaded = ref(false)
const error = ref(null)
const filter = ref('all')
const expanded = ref({})

const POLL_INTERVAL = 20000
let pollTimer = null

const KDS_LABELS = { pending: 'En attente', preparing: 'En prépa', ready: 'Prêt', served: 'Servi' }

const filters = computed(() => [
  { key: 'all', label: 'Toutes', count: orders.value.length },
  ...Object.entries(ORDER_STATUSES).map(([key, s]) => ({
    key,
    label: s.label,
    count: orders.value.filter(o => o.status === key).length,
  })),
])

const visibleOrders = computed(() =>
  filter.value === 'all' ? orders.value : orders.value.filter(o => o.status === filter.value)
)

const activeCount = computed(() => orders.value.filter(o => o.status !== 'solde').length)

function kdsLabel(status) {
  return KDS_LABELS[status] || status || '—'
}

function itemCount(ticket) {
  return ticket.items.reduce((s, i) => s + i.qty, 0)
}

function timeLabel(o) {
  const ts = o.closedAt || o.ticket.openedAt
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return o.closedAt ? `soldée ${hm}` : `ouverte ${hm}`
}

function toggle(id) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

async function buildOrder(entry) {
  const ticket = entry.ticket
  const closed = !!entry.closedAt
  const rec = getKitchenRecord(estId, ticket.id)
  // Notes soldées : plus de suivi cuisine utile
  const { items: kitchenItems } = closed ? { items: [] } : await fetchKitchenItems(rec.refs)
  return {
    ticket,
    closedAt: entry.closedAt,
    kitchenItems,
    readyCount: kitchenItems.filter(k => k.status === 'ready').reduce((s, k) => s + (Number(k.qty) || 1), 0),
    failedCount: closed ? 0 : ticket.items.filter(i => rec.failedItemIds.includes(i.id)).length,
    status: orderStatus({ closed, refs: rec.refs, kitchenItems }),
  }
}

const STATUS_ORDER = { en_cuisine: 0, en_cours: 1, servi: 2, solde: 3 }

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const open = await fetchOpenTickets()
    const entries = syncHistory(estId, open)
    const built = await Promise.all(entries.map(buildOrder))
    built.sort((a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.ticket.tableNumber - b.ticket.tableNumber
    )
    orders.value = built
    error.value = null
  } catch (e) {
    if (!silent) error.value = e.message || 'Impossible de charger les commandes'
  } finally {
    loading.value = false
    loaded.value = true
  }
}

onMounted(() => {
  load()
  pollTimer = setInterval(() => load(true), POLL_INTERVAL)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.oh-shell {
  display: flex; flex-direction: column; gap: 10px;
  min-height: 100dvh;
  padding: 0 12px calc(90px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14);
  color: var(--text, #fff);
}

/* ─── Header ─── */
.oh-header {
  position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; gap: 10px;
  margin: 0 -12px; padding: 10px 12px;
  background: var(--nav-bg, #15152a); border-bottom: 1px solid var(--card-border, #2a2a40);
}
.oh-back, .oh-icon-btn {
  width: 38px; height: 38px; border-radius: 10px; font-size: 18px; font-weight: 800; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
}
.oh-icon-btn:disabled { opacity: 0.5; }
.oh-header-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.oh-title { font-size: 18px; font-weight: 800; margin: 0; }
.oh-subtitle { font-size: 12px; color: var(--muted, #8a8aa0); }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Chips ─── */
.oh-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.oh-chips::-webkit-scrollbar { display: none; }
.oh-chip {
  flex-shrink: 0; padding: 8px 14px; border-radius: 20px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--muted, #8a8aa0); font-size: 13px; font-weight: 700;
}
.oh-chip.active { background: var(--primary, #10b981); border-color: var(--primary, #10b981); color: #0d0d14; }
.oh-chip-count { font-size: 11px; opacity: 0.75; margin-left: 2px; }

/* ─── Cartes ─── */
.oh-list { display: flex; flex-direction: column; gap: 10px; }
.oh-card {
  padding: 12px 14px; border-radius: 12px;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
  border-left: 4px solid var(--card-border, #2a2a40);
}
.oh-card.status-en_cours { border-left-color: #60a5fa; }
.oh-card.status-en_cuisine { border-left-color: var(--amber, #f59e0b); }
.oh-card.status-servi { border-left-color: var(--success, #10b981); }
.oh-card.status-solde { border-left-color: #6b7280; opacity: 0.6; }
.oh-card-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; }
.oh-card-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.oh-card-table { font-size: 16px; font-weight: 800; }
.oh-badge { font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; }
.oh-badge.status-en_cours { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
.oh-badge.status-en_cuisine { background: rgba(245, 158, 11, 0.15); color: var(--amber, #f59e0b); }
.oh-badge.status-servi { background: rgba(16, 185, 129, 0.15); color: var(--success, #10b981); }
.oh-badge.status-solde { background: rgba(107, 114, 128, 0.18); color: #9ca3af; }
.oh-card-right { display: flex; align-items: center; gap: 8px; }
.oh-card-total { font-size: 15px; font-weight: 800; color: var(--success, #10b981); }
.oh-chevron { color: var(--muted, #8a8aa0); font-size: 12px; transition: transform 0.2s; }
.oh-chevron.open { transform: rotate(180deg); }
.oh-card-meta {
  display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px;
  font-size: 12px; color: var(--muted, #8a8aa0);
}
.oh-ready { color: var(--success, #10b981); font-weight: 800; }
.oh-failed { color: var(--amber, #f59e0b); font-weight: 800; }

/* ─── Détail ─── */
.oh-detail { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--card-border, #2a2a40); }
.oh-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.oh-item-qty { min-width: 26px; font-weight: 800; color: var(--primary, #10b981); }
.oh-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.oh-item-name { font-size: 13px; font-weight: 700; }
.oh-item-sub { font-size: 11px; color: var(--muted, #8a8aa0); }
.oh-item-price { font-size: 13px; font-weight: 700; }
.oh-kitchen { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.03); }
.oh-kitchen-title {
  font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;
  color: var(--muted, #8a8aa0); margin-bottom: 4px;
}
.oh-kitchen-item { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; font-size: 12px; }
.oh-kds { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 6px; }
.oh-kds.kds-pending { background: rgba(245, 158, 11, 0.15); color: var(--amber, #f59e0b); }
.oh-kds.kds-preparing { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
.oh-kds.kds-ready { background: rgba(16, 185, 129, 0.15); color: var(--success, #10b981); }
.oh-kds.kds-served { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }
.oh-totals {
  display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;
  font-size: 12px; color: var(--muted, #8a8aa0);
}
.oh-totals strong { color: var(--text, #fff); }
.oh-open { width: 100%; margin-top: 10px; }

/* ─── États ─── */
.oh-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: 48px 16px; text-align: center; color: var(--muted, #8a8aa0);
}
.oh-error { color: var(--danger, #ef4444); }
.oh-empty-icon { font-size: 44px; }
.oh-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: spin 0.7s linear infinite;
}

.btn-primary {
  padding: 12px 18px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--primary, #10b981); color: #0d0d14; font-size: 14px; font-weight: 800;
}
</style>
