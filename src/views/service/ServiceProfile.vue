<template>
  <div class="sp-shell">
    <!-- ═══ HEADER ═══ -->
    <header class="sp-header">
      <router-link to="/service" class="sp-icon-btn" :title="t('serviceProfile.backToTables')">←</router-link>
      <h1 class="sp-title">{{ t('common.titles.serviceProfile') }}</h1>
      <button class="sp-icon-btn" :disabled="loading" :title="t('common.refresh')" @click="load()">
        <span :class="{ spinning: loading }">⟳</span>
      </button>
    </header>

    <!-- ═══ IDENTITÉ ═══ -->
    <section class="sp-card sp-identity">
      <div class="sp-avatar">{{ initials }}</div>
      <div class="sp-identity-info">
        <h2 class="sp-name">{{ fullName || t('common.roles.SERVEUR') }}</h2>
        <p class="sp-email">{{ user?.email || '—' }}</p>
        <span class="sp-role">{{ authStore.roleLabel }}</span>
      </div>
    </section>
    <p v-if="establishmentName" class="sp-est">📍 {{ establishmentName }}</p>

    <!-- ═══ STATISTIQUES ═══ -->
    <section class="sp-card">
      <h3 class="sp-section-title">{{ t('serviceProfile.today') }}</h3>
      <div class="sp-stats">
        <div class="sp-stat">
          <span class="sp-stat-value">{{ stats.ordersToday }}</span>
          <span class="sp-stat-label">{{ t('serviceProfile.stats.orders') }}</span>
        </div>
        <div class="sp-stat">
          <span class="sp-stat-value">{{ stats.tablesToday.length }}</span>
          <span class="sp-stat-label">{{ t('serviceProfile.stats.tablesHandled') }}</span>
        </div>
        <div class="sp-stat">
          <span class="sp-stat-value">{{ openTables == null ? '—' : openTables.length }}</span>
          <span class="sp-stat-label">{{ t('serviceProfile.stats.openTables') }}</span>
        </div>
      </div>
      <p v-if="stats.tablesToday.length" class="sp-tables">
        {{ t('serviceProfile.tablesList') }} <span v-for="n in stats.tablesToday" :key="n" class="sp-table-chip">{{ n }}</span>
      </p>
      <p class="sp-hint">{{ t('serviceProfile.itemsSent', { count: stats.itemsToday }) }}</p>
      <p v-if="openError" class="sp-warning">⚠️ {{ t('serviceProfile.openTablesError') }}</p>
    </section>

    <!-- ═══ NOTIFICATIONS ═══ -->
    <section class="sp-card sp-row">
      <div>
        <h3 class="sp-section-title">{{ t('common.titles.notifications') }}</h3>
        <p class="sp-hint">{{ notifLabel }}</p>
      </div>
      <button v-if="notifPermission === 'default'" class="btn-ghost" @click="enableNotifications">{{ t('serviceProfile.notif.enable') }}</button>
    </section>

    <!-- ═══ LANGUE ═══ -->
    <section class="sp-card">
      <h3 class="sp-section-title">🌐 {{ t('common.language') }}</h3>
      <LanguageSwitcher />
    </section>

    <!-- ═══ DÉCONNEXION ═══ -->
    <button class="sp-logout" @click="logout">🚪 {{ t('common.logout') }}</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/authStore'
import { fetchOpenTickets, getServiceStats, currentEstablishmentId } from '../../shared/serviceOrders'
import { ensureNotificationPermission } from '../../shared/orderNotifications'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../i18n'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()
const estId = currentEstablishmentId()

const loading = ref(false)
const openTables = ref(null)
const openError = ref(false)
const stats = ref({ ordersToday: 0, itemsToday: 0, tablesToday: [] })
const notifPermission = ref(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

const user = computed(() => authStore.user)
const fullName = computed(() => `${user.value?.first_name || ''} ${user.value?.last_name || ''}`.trim())
const initials = computed(() => {
  const u = user.value || {}
  const s = `${(u.first_name || '')[0] || ''}${(u.last_name || '')[0] || ''}`
  return (s || (u.email || '?')[0]).toUpperCase()
})
const establishmentName = computed(() => authStore.establishment?.name || '')

// Nom posé par le backend sur les notes (table-tickets : serveur_name)
const serveurName = computed(() => fullName.value || user.value?.email || '')

const NOTIF_STATES = ['granted', 'denied', 'default', 'unsupported']
const notifLabel = computed(() =>
  t(`serviceProfile.notif.${NOTIF_STATES.includes(notifPermission.value) ? notifPermission.value : 'default'}`)
)

async function load() {
  loading.value = true
  stats.value = getServiceStats({ estId, userId: user.value?.id })
  try {
    const tickets = await fetchOpenTickets()
    openTables.value = tickets
      .filter(t => serveurName.value && t.serveur === serveurName.value)
      .map(t => t.tableNumber)
    openError.value = false
  } catch {
    openError.value = true
  } finally {
    loading.value = false
  }
}

async function enableNotifications() {
  notifPermission.value = await ensureNotificationPermission()
}

function logout() {
  authStore.logout()
  router.push('/login')
}

onMounted(load)
</script>

<style scoped>
.sp-shell {
  display: flex; flex-direction: column; gap: 12px;
  min-height: 100dvh;
  padding: 12px 12px calc(90px + env(safe-area-inset-bottom));
  background: var(--bg, #0d0d14); color: var(--text, #fff);
}

/* ─── Header ─── */
.sp-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sp-title { font-size: 20px; font-weight: 800; margin: 0; flex: 1; }
.sp-icon-btn {
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--card-border, #2a2a40); background: var(--card-bg, #1a1a2e);
  color: var(--text, #fff); font-size: 18px; cursor: pointer; text-decoration: none;
}
.sp-icon-btn:disabled { opacity: 0.5; }
.spinning { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Cartes ─── */
.sp-card {
  padding: 16px; border-radius: 16px;
  background: var(--card-bg, #1a1a2e); border: 1px solid var(--card-border, #2a2a40);
}
.sp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sp-section-title {
  margin: 0 0 10px; font-size: 12px; font-weight: 800; letter-spacing: 0.5px;
  text-transform: uppercase; color: var(--muted, #8a8aa0);
}
.sp-row .sp-section-title { margin-bottom: 4px; }

/* ─── Identité ─── */
.sp-identity { display: flex; align-items: center; gap: 14px; }
.sp-avatar {
  width: 58px; height: 58px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary, #10b981); color: #0d0d14; font-size: 22px; font-weight: 800;
}
.sp-identity-info { min-width: 0; }
.sp-name { margin: 0; font-size: 18px; font-weight: 800; }
.sp-email { margin: 2px 0 6px; font-size: 13px; color: var(--muted, #8a8aa0); overflow: hidden; text-overflow: ellipsis; }
.sp-role {
  display: inline-block; padding: 2px 10px; border-radius: 8px; font-size: 11px; font-weight: 800;
  text-transform: uppercase; background: rgba(16, 185, 129, 0.15); color: var(--success, #10b981);
}
.sp-est { margin: -4px 4px 0; font-size: 12px; color: var(--muted, #8a8aa0); }

/* ─── Stats ─── */
.sp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sp-stat {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 4px; border-radius: 12px; background: var(--bg, #0d0d14);
}
.sp-stat-value { font-size: 26px; font-weight: 800; line-height: 1; }
.sp-stat-label { font-size: 11px; font-weight: 700; color: var(--muted, #8a8aa0); text-align: center; }
.sp-tables { margin: 10px 0 0; font-size: 12px; color: var(--muted, #8a8aa0); display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.sp-table-chip {
  padding: 2px 8px; border-radius: 8px; font-weight: 800; color: var(--text, #fff);
  border: 1px solid var(--card-border, #2a2a40);
}
.sp-hint { margin: 8px 0 0; font-size: 12px; color: var(--muted, #8a8aa0); }
.sp-row .sp-hint { margin: 0; }
.sp-warning { margin: 6px 0 0; font-size: 12px; color: var(--amber, #f59e0b); }

/* ─── Actions ─── */
.btn-ghost {
  flex-shrink: 0; padding: 10px 16px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14);
  color: var(--text, #fff); font-size: 14px; font-weight: 700;
}
.sp-logout {
  width: 100%; padding: 14px; border-radius: 12px; cursor: pointer;
  background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.35);
  color: var(--danger, #ef4444); font-size: 15px; font-weight: 800;
}
.sp-logout:active { background: rgba(239, 68, 68, 0.2); }
</style>
