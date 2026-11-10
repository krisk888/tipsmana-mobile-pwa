<template>
  <div class="th-overlay" @click.self="emit('close')">
    <div class="th-sheet" role="dialog" aria-modal="true" :aria-label="t('halls.history.title', { number: table })">
      <header class="th-header">
        <div>
          <h3 class="th-title">{{ t('halls.history.title', { number: table }) }}</h3>
          <div class="th-sub">{{ dayLabel }}</div>
        </div>
        <button class="th-icon" :title="t('halls.menuQr.button')" :aria-label="t('halls.menuQr.button')" @click="toggleQr">▦</button>
        <button class="th-icon" :aria-label="t('common.close')" @click="emit('close')">✕</button>
      </header>

      <!-- QR code à poser sur la table : app client (carte, addition, suivi des plats) -->
      <div v-if="qr" class="th-qr">
        <img v-if="qr.dataUrl" :src="qr.dataUrl" :alt="t('halls.menuQr.alt', { number: table })" width="200" height="200" />
        <span v-else class="th-spinner"></span>
        <a class="th-qr-link" :href="qr.url" target="_blank" rel="noopener">{{ qr.url }}</a>
        <p class="th-note">{{ t('halls.menuQr.hint') }}</p>
      </div>

      <div v-if="loading && !tickets.length" class="th-state"><span class="th-spinner"></span></div>

      <template v-else>
        <div class="th-stats">
          <div class="th-stat"><strong>{{ tableStats?.tickets || 0 }}</strong><span>{{ t('halls.history.stats.tickets') }}</span></div>
          <div class="th-stat"><strong>{{ duration(tableStats?.avgDurationMs) }}</strong><span>{{ t('halls.history.stats.avgDuration') }}</span></div>
          <div class="th-stat"><strong>{{ duration(tableStats?.avgWaitMs) }}</strong><span>{{ t('halls.history.stats.avgWait') }}</span></div>
          <div class="th-stat"><strong>{{ money(tableStats?.revenue || 0) }}</strong><span>{{ t('halls.history.stats.revenue') }}</span></div>
        </div>

        <h4 class="th-h4">{{ t('halls.history.tickets') }}</h4>
        <p v-if="!tableTickets.length" class="th-empty">{{ t('halls.history.empty') }}</p>
        <ul v-else class="th-list">
          <li v-for="tk in tableTickets" :key="tk.id" class="th-ticket" :class="{ open: !tk.closedAt }">
            <div class="th-ticket-main">
              <span class="th-time">{{ time(tk.openedAt) }}<template v-if="tk.closedAt"> → {{ time(tk.closedAt) }}</template></span>
              <span class="th-meta">
                <template v-if="!tk.closedAt">{{ t('halls.history.inProgress') }} · </template>
                {{ t('halls.history.wait', { value: duration(waitMs(tk)) }) }} · {{ t('halls.history.duration', { value: duration(durationMs(tk, now)) }) }}
                <template v-if="tk.covers"> · 👤{{ tk.covers }}</template>
                <template v-if="tk.serveur"> · {{ tk.serveur }}</template>
              </span>
            </div>
            <strong class="th-amount">{{ money(tk.total) }}</strong>
          </li>
        </ul>

        <h4 class="th-h4">{{ t('halls.history.dayTitle') }}</h4>
        <div class="th-day">
          <span>{{ t('halls.history.dayAvgDuration', { value: duration(stats.overall.avgDurationMs) }) }}</span>
          <span>{{ t('halls.history.dayRevenuePerTable', { value: money(stats.overall.revenuePerTable) }) }}</span>
        </div>
        <table v-if="stats.tables.length" class="th-table">
          <thead>
            <tr>
              <th>{{ t('halls.history.cols.table') }}</th>
              <th>{{ t('halls.history.cols.tickets') }}</th>
              <th>{{ t('halls.history.cols.avgDuration') }}</th>
              <th>{{ t('halls.history.cols.revenue') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in stats.tables" :key="s.table" :class="{ current: s.table === Number(table) }">
              <td>{{ s.table }}</td>
              <td>{{ s.tickets }}</td>
              <td>{{ duration(s.avgDurationMs) }}</td>
              <td>{{ money(s.revenue) }}</td>
            </tr>
          </tbody>
        </table>

        <p v-if="source === 'local'" class="th-note">ℹ️ {{ t('halls.history.localNote') }}</p>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../shared/api'
import { fetchDayHistory, tableDayStats, ticketsOfTable, waitMs, durationMs, dayOf } from '../shared/tableHistory'
import { guestUrl } from '../shared/guestTicket'
import { useI18n } from '../i18n'

const props = defineProps({
  table: { type: [Number, String], required: true },
})
const emit = defineEmits(['close'])

const { t, intlLocale } = useI18n()

const tickets = ref([])
const source = ref(null)
const loading = ref(true)
const now = ref(Date.now())
const qr = ref(null)

const stats = computed(() => tableDayStats(tickets.value, now.value))
const tableStats = computed(() => stats.value.tables.find(s => s.table === Number(props.table)) || null)
const tableTickets = computed(() => ticketsOfTable(tickets.value, props.table))
const dayLabel = computed(() => new Date(now.value).toLocaleDateString(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }))

function time(ts) {
  return new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
}

function duration(ms) {
  if (ms == null) return '—'
  const min = Math.round(ms / 60000)
  if (min < 60) return t('halls.history.minutes', { n: min })
  return t('halls.history.hours', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') })
}

function money(v) {
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR' }).format(v || 0)
}

function toggleQr() {
  if (qr.value) { qr.value = null; return }
  const entry = { url: guestUrl({ table: props.table, establishmentId: api.getEstablishmentId() }), dataUrl: null }
  qr.value = entry
  import('qrcode')
    .then(({ default: QRCode }) => QRCode.toDataURL(entry.url, { margin: 1, width: 400, errorCorrectionLevel: 'M' }))
    .then((dataUrl) => { if (qr.value === entry) qr.value = { ...entry, dataUrl } })
    .catch(() => {})
}

onMounted(async () => {
  try {
    const res = await fetchDayHistory({ day: dayOf(now.value) })
    tickets.value = res.tickets
    source.value = res.source
  } finally {
    now.value = Date.now()
    loading.value = false
  }
})
</script>

<style scoped>
.th-overlay {
  position: fixed; inset: 0; z-index: 250; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.th-sheet {
  width: 100%; max-width: 560px; max-height: 88dvh; overflow-y: auto; box-sizing: border-box;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0;
  background: var(--card-bg, #1a1a2e); color: var(--text, #fff);
  display: flex; flex-direction: column; gap: 10px;
}
.th-header { display: flex; align-items: center; gap: 8px; }
.th-header > div { flex: 1; min-width: 0; }
.th-title { margin: 0; font-size: 18px; font-weight: 800; }
.th-sub { font-size: 12px; color: var(--muted, #8a8aa0); text-transform: capitalize; }
.th-icon {
  width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-size: 16px;
  border: 1px solid var(--card-border, #2a2a40); background: none; color: var(--text, #fff);
}

.th-qr { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px; border-radius: 14px; background: #fff; color: #111827; }
.th-qr img { width: 200px; height: 200px; }
.th-qr-link { font-size: 11px; color: #047857; word-break: break-all; text-align: center; }
.th-qr .th-note { color: #6b7280; }

.th-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.th-stat {
  display: flex; flex-direction: column; gap: 2px; padding: 10px 4px; border-radius: 12px; text-align: center;
  border: 1px solid var(--card-border, #2a2a40); background: rgba(255, 255, 255, 0.03);
}
.th-stat strong { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.th-stat span { font-size: 10px; color: var(--muted, #8a8aa0); }

.th-h4 { margin: 6px 0 0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #8a8aa0); }
.th-empty { margin: 0; font-size: 13px; color: var(--muted, #8a8aa0); }
.th-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.th-ticket {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px;
  border: 1px solid var(--card-border, #2a2a40);
}
.th-ticket.open { border-color: rgba(239, 68, 68, 0.5); }
.th-ticket-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.th-time { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.th-meta { font-size: 11px; color: var(--muted, #8a8aa0); }
.th-amount { font-size: 15px; font-variant-numeric: tabular-nums; }

.th-day { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; }
.th-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.th-table th { text-align: left; font-size: 11px; font-weight: 700; color: var(--muted, #8a8aa0); padding: 4px 6px; }
.th-table td { padding: 6px; border-top: 1px solid var(--card-border, #2a2a40); }
.th-table tr.current td { font-weight: 800; color: var(--primary, #10b981); }

.th-note { margin: 0; font-size: 11px; color: var(--muted, #8a8aa0); }
.th-state { display: flex; justify-content: center; padding: 32px; }
.th-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: th-spin 0.7s linear infinite;
}
@keyframes th-spin { to { transform: rotate(360deg); } }
</style>
