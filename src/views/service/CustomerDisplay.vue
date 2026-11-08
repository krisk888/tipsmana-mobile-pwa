<template>
  <div class="cd-shell">
    <header class="cd-header">
      <img src="/images/logo_icon_m.jpg" alt="" class="cd-logo" />
      <div class="cd-header-main">
        <div class="cd-kicker">{{ t('service.customerDisplay.kicker') }}</div>
        <div class="cd-title">{{ t('common.table', { number: note?.tableNumber || tableNumber || '—' }) }}</div>
      </div>
    </header>

    <!-- Note réglée -->
    <div v-if="closed" class="cd-state">
      <span class="cd-state-icon">✅</span>
      <p class="cd-state-title">{{ t('service.customerDisplay.closedTitle') }}</p>
      <p class="cd-state-text">{{ t('service.customerDisplay.closedText') }}</p>
    </div>

    <div v-else-if="!note && loading" class="cd-state">
      <span class="cd-spinner"></span>
      <p class="cd-state-text">{{ t('service.customerDisplay.loading') }}</p>
    </div>

    <div v-else-if="!note" class="cd-state">
      <span class="cd-state-icon">🧾</span>
      <p class="cd-state-title">{{ t('service.customerDisplay.unavailableTitle') }}</p>
      <p class="cd-state-text">{{ t('service.customerDisplay.unavailableText') }}</p>
    </div>

    <template v-else>
      <main class="cd-list">
        <p v-if="!note.items.length" class="cd-state-text">{{ t('service.customerDisplay.empty') }}</p>
        <section v-for="g in groups" :key="g.key" class="cd-group">
          <h2 class="cd-group-title">{{ t(g.labelKey) }}</h2>
          <div v-for="i in g.lines" :key="i.id" class="cd-line">
            <span class="cd-qty">{{ i.qty }}</span>
            <span class="cd-name">{{ i.name }}</span>
            <span class="cd-price">{{ formatEur(i.qty * i.price) }}</span>
          </div>
        </section>
      </main>

      <footer class="cd-footer">
        <div class="cd-total">
          <span>{{ t('service.customerDisplay.total') }}</span>
          <span class="cd-total-amount">{{ formatEur(note.totalTtc) }}</span>
        </div>
        <div class="cd-sub">
          {{ t('service.customerDisplay.vatIncluded', { amount: formatEur(note.totalTtc - note.totalHt) }) }} · {{ t('common.items', { count: itemCount }) }}
        </div>
        <div class="cd-status" :class="{ stale }">
          <template v-if="stale">{{ t('service.customerDisplay.offline', { time: formatTime(updatedAt) }) }}</template>
          <template v-else>{{ t('service.customerDisplay.autoUpdate', { time: formatTime(updatedAt) }) }}</template>
        </div>
      </footer>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { decodeSnapshot, fetchCustomerNote, groupByCourse, formatEur, toNumber } from '../../shared/serviceOrders'
import { useI18n } from '../../i18n'

const { t, intlLocale } = useI18n()

const REFRESH_MS = 10000

const route = useRoute()
const ticketId = String(route.params.ticketId || '')
const tableNumber = toNumber(route.query.t) || null

// Instantané porté par le QR (#s=…) : affiché immédiatement, repli si l'API ne répond pas
const snapshot = decodeSnapshot(new URLSearchParams(String(route.hash || '').replace(/^#/, '')).get('s'))

const note = ref(snapshot)
const updatedAt = ref(snapshot?.snapshotAt || null)
const stale = ref(!!snapshot)
const closed = ref(false)
const loading = ref(true)
let timer = null

const groups = computed(() => groupByCourse(note.value?.items || []))
const itemCount = computed(() => (note.value?.items || []).reduce((s, i) => s + i.qty, 0))

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
}

async function refresh() {
  if (closed.value || !ticketId) {
    loading.value = false
    return
  }
  try {
    const res = await fetchCustomerNote({ ticketId, tableNumber })
    if (res.closed) {
      closed.value = true
      stop()
    } else if (res.ticket) {
      note.value = res.ticket
      updatedAt.value = Date.now()
      stale.value = false
    } else {
      stale.value = true
    }
  } catch {
    stale.value = true
  } finally {
    loading.value = false
  }
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

function onVisibility() {
  if (document.visibilityState === 'visible') refresh()
}

onMounted(() => {
  refresh()
  timer = setInterval(() => {
    if (document.visibilityState !== 'hidden') refresh()
  }, REFRESH_MS)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  stop()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
/* Écran client : clair et lisible quel que soit le thème de l'app */
.cd-shell {
  display: flex; flex-direction: column;
  min-height: 100dvh;
  background: #fafaf7; color: #111827;
  font-size: 18px;
}

.cd-header {
  display: flex; align-items: center; gap: 14px;
  padding: calc(18px + env(safe-area-inset-top)) 20px 18px;
  border-bottom: 1px solid #e5e7eb; background: #fff;
}
.cd-logo { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; }
.cd-kicker { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; }
.cd-title { font-size: 30px; font-weight: 800; line-height: 1.1; }

.cd-list { flex: 1; padding: 8px 20px 24px; }
.cd-group { margin-top: 18px; }
.cd-group-title {
  margin: 0 0 4px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #6b7280;
}
.cd-line {
  display: flex; align-items: baseline; gap: 12px; padding: 12px 0;
  border-bottom: 1px solid #ececec;
}
.cd-qty { min-width: 28px; font-size: 20px; font-weight: 800; color: #059669; }
.cd-name { flex: 1; min-width: 0; font-size: 20px; font-weight: 600; line-height: 1.25; }
.cd-price { font-size: 20px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }

.cd-footer {
  position: sticky; bottom: 0;
  padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
  background: #fff; border-top: 1px solid #e5e7eb; box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.05);
}
.cd-total { display: flex; align-items: baseline; justify-content: space-between; font-size: 24px; font-weight: 800; }
.cd-total-amount { font-size: 38px; font-variant-numeric: tabular-nums; }
.cd-sub { margin-top: 2px; font-size: 15px; color: #6b7280; }
.cd-status { margin-top: 10px; font-size: 13px; color: #9ca3af; }
.cd-status.stale { color: #b45309; }

.cd-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 48px 24px; text-align: center;
}
.cd-state-icon { font-size: 64px; }
.cd-state-title { margin: 0; font-size: 28px; font-weight: 800; }
.cd-state-text { margin: 0; font-size: 18px; color: #6b7280; }
.cd-spinner {
  width: 40px; height: 40px; border-radius: 50%;
  border: 4px solid #e5e7eb; border-top-color: #059669;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
