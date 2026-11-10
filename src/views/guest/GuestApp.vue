<template>
  <div class="gu-shell">
    <header class="gu-header">
      <img src="/images/logo_icon_m.jpg" alt="" class="gu-logo" />
      <div class="gu-header-main">
        <div class="gu-kicker">{{ t('guest.kicker') }}</div>
        <h1 class="gu-title">{{ establishmentName || t('guest.title') }}</h1>
      </div>
      <span v-if="params.table" class="gu-table">{{ t('common.table', { number: params.table }) }}</span>
    </header>

    <!-- Retour du paiement en ligne -->
    <div v-if="paymentReturn" class="gu-banner gu-pay-return" :class="{ ok: paymentReturn === 'paid' }" role="status">
      {{ paymentReturn === 'paid' ? '✅ ' + t('guest.pay.returnPaid') : '↩️ ' + t('guest.pay.returnCancelled') }}
    </div>

    <!-- Lien sans table (app client ouverte sans avoir scanné de QR) -->
    <div v-if="!params.table" class="gu-state">
      <span class="gu-state-icon">📷</span>
      <p class="gu-state-title">{{ t('guest.noTableTitle') }}</p>
      <p class="gu-state-text">{{ t('guest.noTableText') }}</p>
    </div>

    <template v-else>
      <div class="gu-tabs" role="tablist">
        <button
          v-for="k in TABS"
          :key="k"
          role="tab"
          class="gu-tab"
          :class="{ active: tab === k }"
          :aria-selected="tab === k"
          @click="tab = k"
        >
          {{ t(`guest.tabs.${k}`) }}
          <span v-if="k === 'bill' && itemCount" class="gu-tab-count">{{ itemCount }}</span>
          <span v-else-if="k === 'history' && history.length" class="gu-tab-count">{{ history.length }}</span>
        </button>
      </div>

      <!-- ═══ ADDITION ═══ -->
      <section v-if="tab === 'bill'" class="gu-panel">
        <div v-if="billLoading && !bill" class="gu-state">
          <span class="gu-spinner"></span>
          <p class="gu-state-text">{{ t('guest.loading') }}</p>
        </div>

        <div v-else-if="!bill" class="gu-state">
          <span class="gu-state-icon">{{ billReason === 'offline' ? '📴' : '🧾' }}</span>
          <p class="gu-state-title">{{ t(`guest.errors.${billReason}Title`) }}</p>
          <p class="gu-state-text">{{ t(`guest.errors.${billReason}Text`) }}</p>
          <button class="gu-btn" @click="loadBill()">{{ t('common.retry') }}</button>
        </div>

        <div v-else-if="!ticket || (!ticket.items.length && ticket.open)" class="gu-state">
          <span class="gu-state-icon">🍽</span>
          <p class="gu-state-title">{{ t('guest.emptyTitle') }}</p>
          <p class="gu-state-text">{{ t('guest.emptyText') }}</p>
        </div>

        <template v-else>
          <div v-if="!ticket.open" class="gu-banner ok" role="status">✅ {{ t('guest.closed') }}</div>
          <div v-else-if="stale" class="gu-banner" role="status">📴 {{ t('guest.stale', { time: formatTime(updatedAt) }) }}</div>

          <div v-if="ticket.open && trackedCount" class="gu-progress">
            <span v-for="s in STATUSES" :key="s" class="gu-progress-chip" :class="`st-${s}`">
              {{ STATUS_ICONS[s] }} {{ t(`guest.statusCount.${s}`, { count: counts[s] }) }}
            </span>
          </div>

          <ul class="gu-lines">
            <li v-for="i in ticket.items" :key="i.id" class="gu-line">
              <span class="gu-line-qty">{{ i.qty }}×</span>
              <div class="gu-line-main">
                <span class="gu-line-name">{{ i.name }}</span>
                <span v-if="modifierChips(i).length" class="gu-mods">
                  <span v-for="(m, k) in modifierChips(i)" :key="k" class="gu-mod">{{ m.label }}</span>
                </span>
                <span v-if="i.status && ticket.open" class="gu-status" :class="`st-${i.status}`">
                  {{ STATUS_ICONS[i.status] }} {{ t(`guest.status.${i.status}`) }}
                </span>
              </div>
              <span class="gu-line-price">{{ formatEur(i.qty * i.price) }}</span>
            </li>
          </ul>

          <div class="gu-total">
            <span>{{ t('guest.total') }}</span>
            <span class="gu-total-amount">{{ formatEur(ticket.totalTtc) }}</span>
          </div>
          <p class="gu-footnote">{{ t('guest.vatIncluded') }} · {{ t('guest.updated', { time: formatTime(updatedAt) }) }}</p>
        </template>
      </section>

      <!-- ═══ HISTORIQUE ═══ -->
      <section v-else-if="tab === 'history'" class="gu-panel">
        <div v-if="!history.length" class="gu-state">
          <span class="gu-state-icon">🕘</span>
          <p class="gu-state-title">{{ t('guest.history.emptyTitle') }}</p>
          <p class="gu-state-text">{{ t('guest.history.emptyText') }}</p>
        </div>
        <template v-else>
          <div class="gu-history-totals">
            <div class="gu-history-stat">
              <span>{{ t('guest.history.paid') }}</span>
              <strong>{{ formatEur(historySums.paid) }}</strong>
            </div>
            <div class="gu-history-stat due">
              <span>{{ t('guest.history.due') }}</span>
              <strong>{{ formatEur(historySums.due) }}</strong>
            </div>
          </div>
          <ul class="gu-visits">
            <li v-for="v in history" :key="v.key" class="gu-visit">
              <details>
                <summary class="gu-visit-head">
                  <div class="gu-visit-main">
                    <span class="gu-visit-title">{{ v.establishmentName || t('common.table', { number: v.table }) }}</span>
                    <span class="gu-visit-meta">
                      {{ formatDay(v.firstSeen) }} · {{ t('guest.history.items', { count: visitQty(v) }) }}
                      <template v-if="v.establishmentName"> · {{ t('common.table', { number: v.table }) }}</template>
                    </span>
                  </div>
                  <div class="gu-visit-side">
                    <span class="gu-visit-total">{{ formatEur(v.total) }}</span>
                    <span class="gu-visit-badge" :class="v.paid ? 'paid' : 'due'">
                      {{ v.paid ? t(`guest.history.paidVia.${v.paidVia || 'table'}`) : t('guest.history.unpaid') }}
                    </span>
                  </div>
                </summary>
                <ul class="gu-visit-items">
                  <li v-for="(i, k) in v.items" :key="k">
                    <span>{{ i.qty }}× {{ i.name }}</span>
                    <span>{{ formatEur(i.qty * i.price) }}</span>
                  </li>
                </ul>
              </details>
            </li>
          </ul>
          <p class="gu-footnote">{{ t('guest.history.deviceOnly') }}</p>
        </template>
      </section>

      <!-- ═══ CARTE ═══ -->
      <section v-else class="gu-panel">
        <div v-if="menuLoading && !menu" class="gu-state">
          <span class="gu-spinner"></span>
          <p class="gu-state-text">{{ t('menu.loading') }}</p>
        </div>
        <div v-else-if="!menu" class="gu-state">
          <span class="gu-state-icon">{{ menuReason === 'offline' ? '📴' : '🍽' }}</span>
          <p class="gu-state-title">{{ t(`menu.errors.${menuReason}Title`) }}</p>
          <p class="gu-state-text">{{ t(`menu.errors.${menuReason}Text`) }}</p>
          <button class="gu-btn" @click="loadMenu">{{ t('common.retry') }}</button>
        </div>
        <template v-else>
          <nav class="gu-cats" :aria-label="t('menu.categories')">
            <button
              v-for="c in menu.categories"
              :key="c.id"
              class="gu-cat"
              :class="{ active: activeCat === c.id }"
              @click="activeCat = c.id"
            >{{ c.name }}</button>
          </nav>
          <p v-if="!menu.categories.length" class="gu-state-text">{{ t('menu.empty') }}</p>
          <ul class="gu-menu">
            <li v-for="i in activeItems" :key="i.id" class="gu-dish">
              <img
                v-if="i.imageUrl && !brokenImages[i.imageUrl]"
                class="gu-dish-img"
                :src="i.imageUrl"
                :alt="i.name"
                loading="lazy"
                decoding="async"
                @error="brokenImages[i.imageUrl] = true"
              />
              <div class="gu-dish-body">
                <div class="gu-dish-top">
                  <h3 class="gu-dish-name">{{ i.name }}</h3>
                  <span v-if="showPrices && i.price != null" class="gu-dish-price">{{ formatEur(i.price) }}</span>
                </div>
                <p v-if="i.description" class="gu-dish-desc">{{ i.description }}</p>
                <p v-if="i.allergens.length" class="gu-dish-allergens">{{ t('menu.allergens', { list: i.allergens.join(', ') }) }}</p>
              </div>
            </li>
          </ul>
        </template>
      </section>
    </template>

    <footer class="gu-footer">
      <div v-if="params.table" class="gu-dock">
        <button class="gu-call" @click="openCall">🔔 {{ t('menu.callWaiter') }}</button>
        <button v-if="canPay" class="gu-pay" @click="openPay">💳 {{ t('guest.pay.button', { amount: formatEur(ticket.totalTtc) }) }}</button>
      </div>
      <LanguageSwitcher />
    </footer>

    <!-- ═══ Appeler le serveur ═══ -->
    <div v-if="sheet === 'call'" class="gu-overlay" @click.self="sheet = null">
      <div class="gu-sheet" role="dialog" aria-modal="true" :aria-label="t('waiterCall.title')">
        <h2 class="gu-sheet-title">🔔 {{ t('waiterCall.title') }}</h2>
        <p class="gu-sheet-text">{{ t('guest.call.hint') }}</p>
        <div class="gu-call-grid">
          <button
            v-for="m in WAITER_CALL_MESSAGES"
            :key="m.code"
            class="gu-call-opt"
            :class="{ sent: callSent[m.code] }"
            :disabled="callBusy"
            @click="sendCall(m.code)"
          >
            <span class="gu-call-icon">{{ m.icon }}</span>
            <span>{{ t(m.labelKey) }}</span>
          </button>
        </div>
        <p v-if="callFeedback" class="gu-sheet-feedback" :class="callFeedback.ok ? 'ok' : 'ko'" role="status">{{ callFeedback.text }}</p>
        <button class="gu-btn ghost" @click="sheet = null">{{ t('common.close') }}</button>
      </div>
    </div>

    <!-- ═══ Payer ═══ -->
    <div v-if="sheet === 'pay' && ticket" class="gu-overlay" @click.self="sheet = null">
      <div class="gu-sheet" role="dialog" aria-modal="true" :aria-label="t('guest.pay.title')">
        <h2 class="gu-sheet-title">💳 {{ t('guest.pay.title') }}</h2>
        <div class="gu-pay-amount">{{ formatEur(ticket.totalTtc) }}</div>

        <template v-if="onlineProviders.length">
          <p class="gu-sheet-text">{{ t('guest.pay.online') }}</p>
          <button
            v-for="p in onlineProviders"
            :key="p.code"
            class="gu-btn gu-provider"
            :disabled="payBusy"
            @click="payOnline(p.code)"
          >{{ p.icon }} {{ t('guest.pay.with', { provider: p.label }) }}</button>
        </template>

        <p v-if="payError" class="gu-sheet-feedback ko" role="alert">{{ payError }}</p>

        <div class="gu-pay-divider"><span>{{ onlineProviders.length ? t('guest.pay.or') : t('guest.pay.atTableTitle') }}</span></div>

        <template v-if="tableQr">
          <img class="gu-pay-qr" :src="tableQr" :alt="t('guest.pay.qrAlt')" />
          <p class="gu-sheet-text">{{ t('guest.pay.qrHint') }}</p>
          <p v-if="callFeedback" class="gu-sheet-feedback" :class="callFeedback.ok ? 'ok' : 'ko'" role="status">{{ callFeedback.text }}</p>
        </template>
        <button v-else class="gu-btn gu-provider ghost" :disabled="callBusy" @click="payAtTable">🧾 {{ t('guest.pay.atTable') }}</button>

        <button class="gu-btn ghost" @click="sheet = null">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import {
  fetchGuestBill, guestParamsFromRoute, rememberGuestTable, statusCounts, applyGuestManifest, GUEST_POLL_MS,
} from '../../shared/guestTicket'
import { fetchPublicMenu } from '../../shared/publicMenu'
import { WAITER_CALL_MESSAGES, callWaiter } from '../../shared/waiterCall'
import { recordGuestVisit, readGuestHistory, markVisitPaid, historyTotals } from '../../shared/guestHistory'
import {
  paymentProviders, startGuestPayment, paymentReturnStatus, tablePaymentQr,
} from '../../shared/guestPayment'
import { modifierChips } from '../../shared/menuModifiers'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../i18n'

const TABS = ['bill', 'menu', 'history']
const PROVIDERS = paymentProviders()
const STATUSES = ['en_cours', 'pret', 'servi']
const STATUS_ICONS = { en_cours: '🔥', pret: '🛎️', servi: '✅' }

const { t, locale, intlLocale } = useI18n()
const route = useRoute()

const params = computed(() => guestParamsFromRoute(route))
const tab = ref('bill')

const bill = ref(null)
const billSource = ref(null)
const billReason = ref('unavailable')
const billLoading = ref(true)
const updatedAt = ref(null)

const menu = ref(null)
const menuReason = ref('unavailable')
const menuLoading = ref(false)
const activeCat = ref(null)
const brokenImages = reactive({})

const ticket = computed(() => bill.value?.ticket || null)

/* ═══ Historique, appel serveur, paiement ═══ */
const history = ref(readGuestHistory())
const historySums = computed(() => historyTotals(history.value))
const paymentReturn = ref(paymentReturnStatus(route))
const sheet = ref(null)
const callBusy = ref(false)
const callSent = reactive({})
const callFeedback = ref(null)
const payBusy = ref(false)
const payError = ref('')
const payUnavailable = ref(false)
const tableQr = ref('')

const stale = computed(() => billSource.value === 'cache')
const establishmentName = computed(() => bill.value?.establishmentName || menu.value?.establishmentName || null)
const itemCount = computed(() => (ticket.value?.items || []).reduce((s, i) => s + i.qty, 0))
const counts = computed(() => statusCounts(ticket.value?.items))
const trackedCount = computed(() => counts.value.en_cours + counts.value.pret + counts.value.servi)
// Carte sans prix : réglage de l'établissement (API) ou ?prices=0 sur le QR
const showPrices = computed(() => !params.value.hidePrices && bill.value?.showPrices !== false)
const activeItems = computed(() => {
  const cats = menu.value?.categories || []
  return (cats.find(c => c.id === activeCat.value) || cats[0])?.items || []
})

function formatEur(v) {
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR' }).format(v || 0)
}

function formatDay(ts) {
  return ts ? new Date(ts).toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
}

function visitQty(v) {
  return (v.items || []).reduce((s, i) => s + (i.qty || 0), 0)
}

function formatTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' }) : '—'
}

// Addition déjà payée en ligne (en attente de clôture par la caisse) : plus de bouton « Payer »
const paidOnline = computed(() => !!ticket.value?.id && history.value.some(v => v.ticketId === ticket.value.id && v.paid))
const canPay = computed(() => !!ticket.value?.open && ticket.value.items.length > 0 && ticket.value.totalTtc > 0 && !paidOnline.value)
const onlineProviders = computed(() => (ticket.value?.id && !payUnavailable.value ? PROVIDERS : []))

function rememberVisit(b) {
  if (!recordGuestVisit(b, params.value)) return
  // Retour du paiement en ligne : l'addition affichée est celle qui vient d'être payée
  if (paymentReturn.value === 'paid') markVisitPaid({ ticketId: b.ticket?.id, ...params.value })
  history.value = readGuestHistory()
}

function openCall() {
  callFeedback.value = null
  sheet.value = 'call'
}

async function sendCall(code) {
  if (callBusy.value) return
  callBusy.value = true
  try {
    const res = await callWaiter(params.value.table, code)
    if (res.ok) callSent[code] = true
    callFeedback.value = res.ok
      ? { ok: true, text: t('waiterCall.sent') }
      : { ok: false, text: t(`waiterCall.errors.${res.reason}`) }
    if (res.ok) {
      try { navigator.vibrate?.(50) } catch { /* non supporté */ }
    }
    return res
  } finally {
    callBusy.value = false
  }
}

function openPay() {
  payError.value = ''
  callFeedback.value = null
  sheet.value = 'pay'
}

async function payOnline(provider) {
  if (payBusy.value || !ticket.value) return
  payBusy.value = true
  payError.value = ''
  try {
    const res = await startGuestPayment({
      ticketId: ticket.value.id,
      token: params.value.token,
      table: params.value.table,
      establishmentId: params.value.establishmentId,
      provider,
      amount: ticket.value.totalTtc,
    })
    if (res.ok) {
      window.location.assign(res.url)
      return
    }
    // Pas de paiement en ligne ici : reste le paiement à table
    if (res.reason === 'unavailable') payUnavailable.value = true
    payError.value = t(`guest.pay.errors.${res.reason}`)
  } finally {
    payBusy.value = false
  }
}

async function payAtTable() {
  await sendCall('pay')
  try {
    const QRCode = (await import('qrcode')).default
    tableQr.value = await QRCode.toDataURL(tablePaymentQr(params.value), { margin: 1, width: 280, errorCorrectionLevel: 'M' })
  } catch { /* QR indisponible : l'appel serveur suffit */ }
}

async function loadBill({ silent = false } = {}) {
  if (!params.value.table) return
  if (!silent) billLoading.value = true
  try {
    const res = await fetchGuestBill(params.value)
    if (res.ok) {
      // Un relevé hors-ligne ne remplace pas une addition plus fraîche déjà affichée
      if (res.source !== 'cache' || !bill.value) {
        bill.value = res.bill
        billSource.value = res.source
        updatedAt.value = res.source === 'cache' ? res.at : Date.now()
        if (res.source !== 'cache') rememberVisit(res.bill)
      } else {
        billSource.value = 'cache'
      }
      // Addition réglée : plus rien ne bougera (pas encore de note : on attend la commande)
      if (res.bill.ticket && !res.bill.ticket.open) stopPolling()
    } else if (!bill.value) {
      billReason.value = res.reason
    }
  } finally {
    billLoading.value = false
  }
}

async function loadMenu() {
  menuLoading.value = true
  try {
    const res = await fetchPublicMenu({ establishmentId: params.value.establishmentId, lang: locale.value })
    if (res.ok) {
      menu.value = res.menu
      if (!res.menu.categories.some(c => c.id === activeCat.value)) activeCat.value = res.menu.categories[0]?.id || null
    } else if (!menu.value) {
      menuReason.value = res.reason
    }
  } finally {
    menuLoading.value = false
  }
}

/* ═══ Rafraîchissement : toutes les 15 s, app visible ═══ */
let timer = null
function startPolling() {
  stopPolling()
  timer = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') loadBill({ silent: true })
  }, GUEST_POLL_MS)
}
function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}
function onVisibility() {
  if (document.visibilityState === 'visible' && timer) loadBill({ silent: true })
}

let restoreManifest = () => {}

onMounted(async () => {
  restoreManifest = applyGuestManifest()
  document.addEventListener('visibilitychange', onVisibility)
  if (!params.value.table) {
    billLoading.value = false
    return
  }
  rememberGuestTable(params.value.table, params.value.establishmentId)
  startPolling()
  await loadBill()
  // Rien de commandé : on ouvre la carte
  if (!ticket.value?.items.length) tab.value = 'menu'
})

// Historique relu à l'ouverture de l'onglet (autre onglet / autre table)
watch(tab, (k) => { if (k === 'history') history.value = readGuestHistory() })

// Carte chargée à la première ouverture de l'onglet
watch(tab, (k) => { if (k === 'menu' && !menu.value && !menuLoading.value) loadMenu() }, { immediate: true })
watch(locale, () => { if (menu.value) loadMenu() })

onBeforeUnmount(() => {
  stopPolling()
  restoreManifest()
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
/* App client : dark glassmorphism, cohérent avec le thème cyber de l'app équipe */
.gu-shell {
  --gu-glass: rgba(255, 255, 255, 0.06);
  --gu-glass-strong: rgba(255, 255, 255, 0.1);
  --gu-stroke: rgba(255, 255, 255, 0.12);
  --gu-text: #e8e8f0;
  --gu-muted: #9a9ab0;
  --gu-green: #10b981;
  --gu-cyan: #22d3ee;
  --gu-violet: #818cf8;
  position: relative;
  display: flex; flex-direction: column;
  min-height: 100dvh;
  color: var(--gu-text);
  font-size: 17px;
  background:
    radial-gradient(60% 40% at 0% 0%, rgba(16, 185, 129, 0.22), transparent 70%),
    radial-gradient(50% 35% at 100% 15%, rgba(99, 102, 241, 0.25), transparent 70%),
    radial-gradient(60% 40% at 50% 100%, rgba(34, 211, 238, 0.12), transparent 70%),
    #07070f;
  background-attachment: fixed;
}

.gu-header {
  display: flex; align-items: center; gap: 12px;
  margin: calc(10px + env(safe-area-inset-top)) 12px 0; padding: 14px 16px;
  border-radius: 22px; border: 1px solid var(--gu-stroke);
  background: var(--gu-glass); backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%);
}
.gu-logo { width: 42px; height: 42px; border-radius: 12px; object-fit: cover; box-shadow: 0 0 18px rgba(16, 185, 129, 0.35); }
.gu-header-main { flex: 1; min-width: 0; }
.gu-kicker { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--gu-cyan); }
.gu-title { margin: 0; font-size: 23px; font-weight: 800; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gu-table {
  flex-shrink: 0; padding: 6px 12px; border-radius: 999px; font-size: 14px; font-weight: 700;
  color: #a7f3d0; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4);
}

.gu-tabs {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
  margin: 10px 12px 0; padding: 6px;
  border-radius: 999px; border: 1px solid var(--gu-stroke);
  background: rgba(10, 10, 20, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.gu-tab {
  padding: 10px 4px; border-radius: 999px; cursor: pointer; border: none;
  background: transparent; color: var(--gu-muted);
  font: inherit; font-size: 14px; font-weight: 700; white-space: nowrap;
}
.gu-tab.active {
  color: #04140e; background: linear-gradient(135deg, var(--gu-green), var(--gu-cyan));
  box-shadow: 0 0 18px rgba(16, 185, 129, 0.45);
}
.gu-tab-count { display: inline-block; min-width: 18px; margin-left: 4px; padding: 0 6px; border-radius: 10px; background: rgba(0, 0, 0, 0.35); color: #fff; font-size: 12px; }

.gu-panel { flex: 1; display: flex; flex-direction: column; gap: 14px; padding: 16px 12px 8px; }

.gu-banner {
  padding: 10px 14px; border-radius: 14px; font-size: 14px; font-weight: 600;
  color: #fcd34d; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35);
}
.gu-banner.ok { color: #6ee7b7; background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.4); }
.gu-pay-return { margin: 10px 12px 0; }

.gu-progress { display: flex; flex-wrap: wrap; gap: 8px; }
.gu-progress-chip { padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }

.gu-lines, .gu-menu, .gu-visits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.gu-lines, .gu-visit, .gu-dish, .gu-history-stat {
  border: 1px solid var(--gu-stroke); background: var(--gu-glass);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.gu-lines { border-radius: 20px; }
.gu-line { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.gu-line:last-child { border-bottom: none; }
.gu-line-qty { min-width: 30px; font-weight: 800; color: var(--gu-green); }
.gu-line-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.gu-line-name { font-weight: 700; line-height: 1.25; }
.gu-mods { display: flex; flex-wrap: wrap; gap: 4px; }
.gu-mod { padding: 1px 8px; border-radius: 8px; background: rgba(129, 140, 248, 0.15); color: #c7d2fe; font-size: 13px; }
.gu-line-price { flex-shrink: 0; font-weight: 800; }

.gu-status { align-self: flex-start; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; }
.st-en_cours { background: rgba(249, 115, 22, 0.15); color: #fdba74; }
.st-pret { background: rgba(34, 211, 238, 0.15); color: #67e8f9; }
.st-servi { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }

.gu-total { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 4px 0; font-size: 18px; font-weight: 700; }
.gu-total-amount {
  font-size: 28px; font-weight: 800;
  background: linear-gradient(135deg, var(--gu-green), var(--gu-cyan)); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gu-footnote { margin: 0; padding: 0 4px; font-size: 13px; color: var(--gu-muted); }

/* Historique */
.gu-history-totals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gu-history-stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 18px; }
.gu-history-stat span { font-size: 13px; color: var(--gu-muted); }
.gu-history-stat strong { font-size: 21px; color: #6ee7b7; }
.gu-history-stat.due strong { color: #fcd34d; }
.gu-visits { gap: 10px; }
.gu-visit { border-radius: 18px; overflow: hidden; }
.gu-visit-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; list-style: none; }
.gu-visit-head::-webkit-details-marker { display: none; }
.gu-visit-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.gu-visit-title { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gu-visit-meta { font-size: 13px; color: var(--gu-muted); }
.gu-visit-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.gu-visit-total { font-weight: 800; }
.gu-visit-badge { padding: 1px 8px; border-radius: 8px; font-size: 12px; font-weight: 700; }
.gu-visit-badge.paid { background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }
.gu-visit-badge.due { background: rgba(245, 158, 11, 0.15); color: #fcd34d; }
.gu-visit-items { list-style: none; margin: 0; padding: 4px 16px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: #cfcfe0; }
.gu-visit-items li { display: flex; justify-content: space-between; gap: 10px; }

/* Carte */
.gu-cats { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 0 12px; }
.gu-cats::-webkit-scrollbar { display: none; }
.gu-cat {
  flex-shrink: 0; padding: 8px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--gu-stroke); background: var(--gu-glass); color: var(--gu-text); font: inherit; font-size: 14px; font-weight: 600;
}
.gu-cat.active { border-color: var(--gu-green); background: rgba(16, 185, 129, 0.2); color: #a7f3d0; box-shadow: 0 0 14px rgba(16, 185, 129, 0.3); }

.gu-menu { gap: 12px; }
.gu-dish { display: flex; gap: 12px; overflow: hidden; padding: 12px; border-radius: 18px; }
.gu-dish-img { flex-shrink: 0; width: 84px; height: 84px; border-radius: 12px; object-fit: cover; background: rgba(255, 255, 255, 0.05); }
.gu-dish-body { flex: 1; min-width: 0; }
.gu-dish-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.gu-dish-name { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.25; }
.gu-dish-price { flex-shrink: 0; font-weight: 800; color: var(--gu-green); }
.gu-dish-desc { margin: 4px 0 0; font-size: 14px; line-height: 1.4; color: var(--gu-muted); }
.gu-dish-allergens { margin: 6px 0 0; font-size: 13px; color: #fdba74; }

.gu-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; text-align: center; }
.gu-state-icon { font-size: 56px; filter: drop-shadow(0 0 16px rgba(34, 211, 238, 0.35)); }
.gu-state-title { margin: 0; font-size: 21px; font-weight: 800; }
.gu-state-text { margin: 0; font-size: 16px; color: var(--gu-muted); }
.gu-btn {
  margin-top: 12px; padding: 13px 24px; border: none; border-radius: 16px; cursor: pointer;
  background: linear-gradient(135deg, var(--gu-green), var(--gu-cyan)); color: #04140e;
  font: inherit; font-size: 16px; font-weight: 800; box-shadow: 0 0 20px rgba(16, 185, 129, 0.35);
}
.gu-btn.ghost { background: var(--gu-glass); color: var(--gu-text); border: 1px solid var(--gu-stroke); box-shadow: none; }
.gu-btn:disabled { opacity: 0.5; cursor: default; }
.gu-spinner { width: 32px; height: 32px; border: 3px solid rgba(255, 255, 255, 0.12); border-top-color: var(--gu-green); border-radius: 50%; animation: gu-spin 0.7s linear infinite; }
@keyframes gu-spin { to { transform: rotate(360deg); } }

/* Barre d'actions */
.gu-footer {
  position: sticky; bottom: 0; z-index: 6;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 12px 12px calc(14px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, rgba(7, 7, 15, 0.95) 60%, transparent);
}
.gu-dock { display: flex; gap: 8px; width: 100%; }
.gu-call, .gu-pay {
  flex: 1; box-sizing: border-box; padding: 15px 10px; border-radius: 18px; text-align: center; cursor: pointer;
  font: inherit; font-size: 16px; font-weight: 800; text-decoration: none;
}
.gu-call {
  color: var(--gu-text); border: 1px solid var(--gu-stroke);
  background: var(--gu-glass-strong); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.gu-pay {
  border: none; color: #04140e;
  background: linear-gradient(135deg, var(--gu-green), var(--gu-cyan)); box-shadow: 0 0 24px rgba(16, 185, 129, 0.45);
}

/* Feuilles (appel, paiement) */
.gu-overlay {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(2, 2, 8, 0.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.gu-sheet {
  width: 100%; max-width: 520px; max-height: 92dvh; overflow-y: auto; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 10px;
  padding: 20px 16px calc(18px + env(safe-area-inset-bottom));
  border-radius: 26px 26px 0 0; border: 1px solid var(--gu-stroke); border-bottom: none;
  background: rgba(18, 18, 32, 0.82); backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%);
  color: var(--gu-text);
}
.gu-sheet .gu-btn { margin-top: 0; }
.gu-sheet-title { margin: 0; font-size: 20px; font-weight: 800; }
.gu-sheet-text { margin: 0; font-size: 15px; color: var(--gu-muted); text-align: center; }
.gu-sheet-feedback { margin: 0; padding: 10px 12px; border-radius: 12px; font-size: 14px; font-weight: 700; text-align: center; }
.gu-sheet-feedback.ok { color: #6ee7b7; background: rgba(16, 185, 129, 0.12); }
.gu-sheet-feedback.ko { color: #fca5a5; background: rgba(239, 68, 68, 0.12); }
.gu-call-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.gu-call-opt {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 8px; border-radius: 18px; cursor: pointer;
  border: 1px solid var(--gu-stroke); background: var(--gu-glass); color: var(--gu-text); font: inherit; font-size: 14px; font-weight: 700;
}
.gu-call-opt.sent { border-color: var(--gu-green); box-shadow: 0 0 14px rgba(16, 185, 129, 0.35); }
.gu-call-icon { font-size: 28px; }
.gu-pay-amount {
  text-align: center; font-size: 34px; font-weight: 800;
  background: linear-gradient(135deg, var(--gu-green), var(--gu-cyan)); -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gu-provider { width: 100%; }
.gu-pay-divider { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--gu-muted); }
.gu-pay-divider::before, .gu-pay-divider::after { content: ''; flex: 1; height: 1px; background: var(--gu-stroke); }
.gu-pay-qr { align-self: center; width: 220px; height: 220px; padding: 10px; border-radius: 18px; background: #fff; }
</style>
