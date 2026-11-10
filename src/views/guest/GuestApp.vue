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
      <router-link v-if="params.table" :to="`/mon-add/${params.table}`" class="gu-call">🔔 {{ t('menu.callWaiter') }}</router-link>
      <LanguageSwitcher />
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import {
  fetchGuestBill, guestParamsFromRoute, rememberGuestTable, statusCounts, applyGuestManifest, GUEST_POLL_MS,
} from '../../shared/guestTicket'
import { fetchPublicMenu } from '../../shared/publicMenu'
import { modifierChips } from '../../shared/menuModifiers'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../i18n'

const TABS = ['bill', 'menu']
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

function formatTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' }) : '—'
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
/* App client : sobre et claire, quel que soit le thème de l'app équipe */
.gu-shell {
  display: flex; flex-direction: column;
  min-height: 100dvh;
  background: #fafaf7; color: #1f2937;
  font-size: 17px;
}

.gu-header {
  display: flex; align-items: center; gap: 12px;
  padding: calc(16px + env(safe-area-inset-top)) 18px 14px;
  background: #fff;
}
.gu-logo { width: 42px; height: 42px; border-radius: 12px; object-fit: cover; }
.gu-header-main { flex: 1; min-width: 0; }
.gu-kicker { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; }
.gu-title { margin: 0; font-size: 24px; font-weight: 800; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gu-table { flex-shrink: 0; padding: 6px 12px; border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 14px; font-weight: 700; }

.gu-tabs {
  position: sticky; top: 0; z-index: 5;
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  padding: 10px 18px; background: rgba(250, 250, 247, 0.95);
  backdrop-filter: blur(8px); border-bottom: 1px solid #ece9e2;
}
.gu-tab {
  padding: 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid #e5e7eb; background: #fff; color: #374151;
  font: inherit; font-size: 15px; font-weight: 700;
}
.gu-tab.active { background: #111827; border-color: #111827; color: #fff; }
.gu-tab-count { display: inline-block; min-width: 20px; margin-left: 4px; padding: 0 6px; border-radius: 10px; background: #059669; color: #fff; font-size: 12px; }

.gu-panel { flex: 1; display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 8px; }

.gu-banner { padding: 10px 14px; border-radius: 12px; background: #fef3c7; color: #92400e; font-size: 14px; font-weight: 600; }
.gu-banner.ok { background: #ecfdf5; color: #047857; }

.gu-progress { display: flex; flex-wrap: wrap; gap: 8px; }
.gu-progress-chip { padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }

.gu-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border-radius: 18px; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.gu-line { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #f1efe9; }
.gu-line:last-child { border-bottom: none; }
.gu-line-qty { min-width: 30px; font-weight: 800; color: #047857; }
.gu-line-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.gu-line-name { font-weight: 700; line-height: 1.25; }
.gu-mods { display: flex; flex-wrap: wrap; gap: 4px; }
.gu-mod { padding: 1px 8px; border-radius: 8px; background: #f3f4f6; color: #4b5563; font-size: 13px; }
.gu-line-price { flex-shrink: 0; font-weight: 800; }

.gu-status { align-self: flex-start; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 700; }
.st-en_cours { background: #fff7ed; color: #c2410c; }
.st-pret { background: #eff6ff; color: #1d4ed8; }
.st-servi { background: #ecfdf5; color: #047857; }

.gu-total { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 4px 0; font-size: 18px; font-weight: 700; }
.gu-total-amount { font-size: 26px; font-weight: 800; }
.gu-footnote { margin: 0; padding: 0 4px; font-size: 13px; color: #9ca3af; }

.gu-cats { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 -18px; padding: 0 18px; }
.gu-cats::-webkit-scrollbar { display: none; }
.gu-cat {
  flex-shrink: 0; padding: 8px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  border: 1px solid #e5e7eb; background: #fff; color: #374151; font: inherit; font-size: 14px; font-weight: 600;
}
.gu-cat.active { background: #059669; border-color: #059669; color: #fff; }

.gu-menu { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.gu-dish { display: flex; gap: 12px; overflow: hidden; padding: 12px; border-radius: 18px; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.gu-dish-img { flex-shrink: 0; width: 84px; height: 84px; border-radius: 12px; object-fit: cover; background: #f3f4f6; }
.gu-dish-body { flex: 1; min-width: 0; }
.gu-dish-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.gu-dish-name { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.25; }
.gu-dish-price { flex-shrink: 0; font-weight: 800; color: #047857; }
.gu-dish-desc { margin: 4px 0 0; font-size: 14px; line-height: 1.4; color: #6b7280; }
.gu-dish-allergens { margin: 6px 0 0; font-size: 13px; color: #9a3412; }

.gu-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; text-align: center; }
.gu-state-icon { font-size: 56px; }
.gu-state-title { margin: 0; font-size: 21px; font-weight: 800; }
.gu-state-text { margin: 0; font-size: 16px; color: #6b7280; }
.gu-btn { margin-top: 12px; padding: 12px 24px; border: none; border-radius: 14px; background: #059669; color: #fff; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
.gu-spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #059669; border-radius: 50%; animation: gu-spin 0.7s linear infinite; }
@keyframes gu-spin { to { transform: rotate(360deg); } }

.gu-footer {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
}
.gu-call {
  width: 100%; box-sizing: border-box; padding: 16px; border-radius: 16px; text-align: center;
  background: #111827; color: #fff; font-size: 17px; font-weight: 700; text-decoration: none;
}
</style>
