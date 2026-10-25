<template>
  <div class="notifications-view">
    <header class="page-header">
      <div class="header-top">
        <h2>🔔 Notifications</h2>
        <button
          v-if="notifications.length && unreadCount > 0"
          class="mark-all-btn"
          :disabled="busy"
          @click="markAllRead"
        >
          Tout lu
        </button>
        <button
          v-if="unreadCount > 0 && newNotifIndicator"
          class="new-notif-btn"
          @click="refreshNow"
        >
          ⬇️ Nouvelles notifications
        </button>
      </div>
      <p class="subtitle">
        {{ unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Aucune notification non lue' }}
      </p>
    </header>

    <div class="filter-bar">
        <div class="priority-filters">
          <button
            v-for="p in priorityOptions"
            :key="p.value"
            class="filter-chip"
            :class="{ active: filterPriority === p.value }"
            @click="setFilter(p.value)"
          >
            <span class="chip-dot" :class="p.value || 'all'"></span>
            {{ p.label }}
          </button>
        </div>
        <button class="sort-btn" @click="toggleSort">
          <span v-if="sortAscending">↑</span>
          <span v-else>↓</span>
          Date
        </button>
      </div>

    <!-- Pull-to-refresh indicator -->
    <div v-if="pulling" class="pull-indicator">
      <span>{{ pullState }}</span>
    </div>

    <!-- Skeleton de chargement -->
    <div v-if="loading && !notifications.length" class="skeleton-list">
      <div v-for="n in 5" :key="n" class="skeleton-item">
        <div class="skeleton-bar w-60"></div>
        <div class="skeleton-bar w-90"></div>
        <div class="skeleton-bar w-30 short"></div>
      </div>
    </div>

    <!-- Liste vide -->
    <div v-else-if="!notifications.length && !loading" class="empty-state">
      <span class="empty-icon">🔔</span>
      <p>Aucune notification pour le moment</p>
    </div>

    <!-- Liste des notifications -->
    <div v-else ref="listRef" class="notification-list" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <div
        v-for="n in filteredNotifications"
        :key="n.id"
        class="notification-item"
        :class="{ unread: !n.is_read, [n.priority || 'medium']: true }"
        @click="markRead(n)"
      >
        <div class="notif-left">
          <span class="priority-dot" :class="n.priority || 'medium'"></span>
        </div>
        <div class="notif-body">
          <div class="notif-header">
            <span class="notif-title">{{ n.title }}</span>
            <span class="notif-time">{{ timeAgo(n.created_at) }}</span>
          </div>
          <p class="notif-message">{{ n.message }}</p>
          <div v-if="n.module_code" class="notif-meta">
            <span class="notif-badge">{{ n.module_code }}</span>
          </div>
        </div>
        <div v-if="!n.is_read" class="unread-dot"></div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="hasMore" class="load-more">
      <button class="btn-more" :disabled="loading" @click="loadMore">
        {{ loading ? 'Chargement...' : 'Voir plus' }}
      </button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../shared/api'

const notifications = ref([])
const loading = ref(false)
const busy = ref(false)
const error = ref(null)
const page = ref(1)
const total = ref(0)
const unreadCount = ref(0)
const polling = ref(true)
const newNotifIndicator = ref(false)
let pollTimer = null

// Filtres et tri
const filterPriority = ref('')
const sortAscending = ref(false)
const priorityOptions = [
  { value: '', label: 'Toutes' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Basse' },
]

// Pull-to-refresh
const pulling = ref(false)
const pullState = ref('')
const touchStartY = ref(0)
const listRef = ref(null)

const hasMore = computed(() => notifications.value.length < total.value)

const filteredNotifications = computed(() => {
  let items = notifications.value
  if (filterPriority.value) {
    items = items.filter(n => (n.priority || 'medium') === filterPriority.value)
  }
  return [...items].sort((a, b) => {
    const da = new Date(a.created_at).getTime()
    const db = new Date(b.created_at).getTime()
    return sortAscending.value ? da - db : db - da
  })
})

async function fetchNotifications(append = false) {
  loading.value = true
  error.value = null
  try {
    let url = `/notifications?page=${page.value}&per_page=20`
    if (filterPriority.value) url += `&priority=${filterPriority.value}`
    const res = await api.get(url)
    const data = res.data || {}
    const items = data.notifications || []
    total.value = data.total || 0
    unreadCount.value = data.unread_count || 0

    if (append) {
      notifications.value.push(...items)
    } else {
      notifications.value = items
    }
  } catch (e) {
    error.value = e.message || 'Erreur de chargement'
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (hasMore.value && !loading.value) {
    page.value++
    await fetchNotifications(true)
  }
}

function setFilter(priority) {
  filterPriority.value = priority
  page.value = 1
  fetchNotifications(false)
}

function toggleSort() {
  sortAscending.value = !sortAscending.value
  page.value = 1
  fetchNotifications(false)
}

async function markRead(n) {
  if (n.is_read) return
  busy.value = true
  try {
    await api.put(`/notifications/${n.id}/read`)
    n.is_read = true
    n.read_at = new Date().toISOString()
    if (unreadCount.value > 0) unreadCount.value--
  } catch {
    // Silently fail
  } finally {
    busy.value = false
  }
}

async function markAllRead() {
  busy.value = true
  try {
    await api.put('/notifications/mark-all-read')
    notifications.value.forEach(n => { n.is_read = true })
    unreadCount.value = 0
  } catch {
    // Silently fail
  } finally {
    busy.value = false
  }
}

// Pull-to-refresh
function onTouchStart(e) {
  if (listRef.value && listRef.value.scrollTop <= 0) {
    touchStartY.value = e.touches[0].clientY
  }
}

function onTouchMove(e) {
  if (touchStartY.value === 0) return
  const diff = e.touches[0].clientY - touchStartY.value
  if (diff > 60) {
    pulling.value = true
    pullState.value = '🔄 Relâchez pour actualiser'
  } else if (diff > 20) {
    pulling.value = true
    pullState.value = '⬇️ Tirer pour actualiser'
  } else {
    pulling.value = false
    pullState.value = ''
  }
}

async function onTouchEnd() {
  if (pulling.value && pullState.value.includes('Relâchez')) {
    pulling.value = true
    pullState.value = '🔄 Actualisation...'
    page.value = 1
    await fetchNotifications(false)
  }
  pulling.value = false
  pullState.value = ''
  touchStartY.value = 0
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `il y a ${d}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Real-time polling
async function refreshNow() {
  newNotifIndicator.value = false
  page.value = 1
  await fetchNotifications(false)
}

async function pollNotifications() {
  if (!polling.value) return
  // Lightweight count check before full fetch
  try {
    const oldUnread = unreadCount.value
    const res = await api.get('/notifications?page=1&per_page=1')
    const data = res.data || {}
    const latestUnread = data.unread_count || 0
    if (latestUnread > oldUnread) {
      // New notifications detected — show indicator
      newNotifIndicator.value = true
    }
    // Sync unread count
    unreadCount.value = latestUnread
  } catch {
    // Silently fail during polling
  }
}

onMounted(() => {
  fetchNotifications(false)
  // Start 30s polling for real-time notifications
  pollTimer = setInterval(pollNotifications, 30000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style scoped>
.notifications-view { padding: 16px; padding-bottom: 80px; }
.page-header { margin-bottom: 16px; }
.header-top { display: flex; justify-content: space-between; align-items: center; }
.header-top h2 { font-size: 22px; color: #fff; margin: 0; }
.subtitle { font-size: 13px; color: #888; margin-top: 4px; }
.mark-all-btn {
  font-size: 13px; color: #6c5ce7; background: none; border: 1px solid #6c5ce7;
  border-radius: 8px; padding: 6px 14px; cursor: pointer; font-weight: 500;
}
.mark-all-btn:disabled { opacity: 0.5; }
.new-notif-btn {
  font-size: 13px; color: #f7b731; background: rgba(247,183,49,0.15);
  border: 1px solid #f7b731; border-radius: 8px;
  padding: 6px 14px; cursor: pointer; font-weight: 500;
  animation: pulse-notif 2s ease-in-out infinite;
}
@keyframes pulse-notif {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.pull-indicator {
  text-align: center; padding: 8px; color: #888; font-size: 13px;
}

/* Squelette */
.skeleton-list { display: flex; flex-direction: column; gap: 12px; }
.skeleton-item {
  background: #1e1e32; border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.skeleton-bar {
  height: 12px; border-radius: 6px;
  background: linear-gradient(90deg, #2a2a40 25%, #3a3a52 50%, #2a2a40 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s ease-in-out infinite;
}
.skeleton-bar.short { width: 25%; }
.skeleton-bar.w-30 { width: 30%; }
.skeleton-bar.w-60 { width: 60%; }
.skeleton-bar.w-90 { width: 90%; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Vide */
.empty-state { text-align: center; padding: 48px 16px; }
.empty-icon { font-size: 48px; }
.empty-state p { color: #888; margin-top: 12px; font-size: 14px; }

/* Liste */
.notification-list { display: flex; flex-direction: column; gap: 8px; }
.notification-item {
  display: flex; gap: 12px; align-items: flex-start;
  background: #1e1e32; border-radius: 12px; padding: 14px;
  cursor: pointer; transition: background 0.2s; position: relative;
}
.notification-item:active { background: #2a2a40; }
.notification-item.unread { border-left: 3px solid #6c5ce7; }
.notification-item.urgent { border-left-color: #ff6b6b; }
.notification-item.high { border-left-color: #ffa502; }
.notif-left { flex-shrink: 0; padding-top: 2px; }
.priority-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
}
.priority-dot.urgent { background: #ff6b6b; }
.priority-dot.high { background: #ffa502; }
.priority-dot.medium { background: #6c5ce7; }
.priority-dot.low { background: #888; }
.notif-body { flex: 1; min-width: 0; }
.notif-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.notif-title { font-size: 14px; font-weight: 600; color: #fff; }
.notif-time { font-size: 11px; color: #666; white-space: nowrap; flex-shrink: 0; }
.notif-message { font-size: 13px; color: #aaa; margin-top: 4px; line-height: 1.4; }
.notif-meta { margin-top: 6px; }
.notif-badge {
  font-size: 10px; background: #2a2a40; color: #888;
  padding: 2px 8px; border-radius: 6px; text-transform: uppercase;
}
.unread-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #6c5ce7;
  flex-shrink: 0; margin-top: 6px;
}
.load-more { text-align: center; margin-top: 16px; }
.btn-more {
  padding: 10px 24px; background: #2a2a40; border: none; border-radius: 10px;
  color: #fff; font-size: 14px; cursor: pointer;
}
.btn-more:disabled { opacity: 0.5; }
.error-msg { color: #ff6b6b; text-align: center; margin-top: 12px; font-size: 13px; }

/* Filtre et tri */
.filter-bar {
  display: flex; gap: 8px; margin: 8px 0 12px; align-items: center;
  overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.priority-filters { display: flex; gap: 6px; flex-shrink: 0; }
.filter-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; background: #1e1e32; color: #aaa;
  border: 1px solid transparent; border-radius: 14px;
  padding: 4px 10px; cursor: pointer; white-space: nowrap;
  transition: all 0.15s;
}
.filter-chip.active {
  background: #2a2a40; border-color: #6c5ce7; color: #fff;
  font-weight: 500;
}
.chip-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
}
.chip-dot.urgent { background: #ff6b6b; }
.chip-dot.high { background: #ffa502; }
.chip-dot.medium { background: #6c5ce7; }
.chip-dot.low { background: #888; }
.chip-dot.all { background: #aaa; opacity: 0.5; }
.chip-dot.all + .chip-dot { display: none; }
.sort-btn {
  font-size: 12px; background: #1e1e32; color: #aaa;
  border: 1px solid #2a2a40; border-radius: 14px;
  padding: 4px 10px; cursor: pointer; white-space: nowrap;
  transition: all 0.15s; display: inline-flex; align-items: center; gap: 2px;
}
.sort-btn:hover { background: #2a2a40; color: #fff; }
</style>
