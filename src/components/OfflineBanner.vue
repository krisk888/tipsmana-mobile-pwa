<template>
  <div
    v-if="show"
    class="offline-banner"
    :class="{
      'offline-banner--visible': visible,
      'offline-banner--syncing': isSyncing,
      'offline-banner--online': isOnline && wasOffline,
    }"
    role="status"
    aria-live="polite"
  >
    <div class="offline-banner__content">
      <template v-if="isOnline && wasOffline">
        <span class="offline-banner__icon">✅</span>
        <span class="offline-banner__text">Connexion rétablie</span>
        <span v-if="pendingCount > 0 && !isSyncing" class="offline-banner__action" @click="$emit('flush')">
          Sync {{ pendingCount }} requête{{ pendingCount > 1 ? 's' : '' }}
        </span>
        <span v-if="isSyncing" class="offline-banner__syncing">
          <span class="offline-banner__spinner"></span>
          Synchronisation...
        </span>
        <span v-else-if="synced > 0" class="offline-banner__synced">{{ synced }} sync {{ synced > 1 ? 's' : '' }} ✓</span>
      </template>
      <template v-else-if="!isOnline">
        <span class="offline-banner__icon">📡</span>
        <span class="offline-banner__text">Hors ligne</span>
        <span v-if="pendingCount > 0" class="offline-banner__count">
          {{ pendingCount }} requête{{ pendingCount > 1 ? 's' : '' }} en attente
        </span>
        <span v-else class="offline-banner__count">Utilisation du cache</span>
      </template>
    </div>
    <button v-if="!isOnline || (isOnline && synced > 0)" class="offline-banner__dismiss" @click="dismiss" aria-label="Fermer">
      ✕
    </button>
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps({
  isOnline: { type: Boolean, default: true },
  pendingCount: { type: Number, default: 0 },
  isSyncing: { type: Boolean, default: false },
  synced: { type: Number, default: 0 },
})

defineEmits(['flush'])

const show = ref(false)
const visible = ref(false)
const wasOffline = ref(false)
const dismissTimer = ref(null)

// Quand on repasse online après avoir été offline
watch(() => props.isOnline, (online) => {
  if (online && wasOffline.value) {
    // Affiche le banner "connexion rétablie"
    show.value = true
    setTimeout(() => { visible.value = true }, 10)
    // Auto-dismiss après 4 secondes
    dismissTimer.value = setTimeout(() => {
      dismiss()
    }, 4000)
  } else if (!online) {
    wasOffline.value = true
    show.value = true
    setTimeout(() => { visible.value = true }, 10)
  }
})

function dismiss() {
  visible.value = false
  if (dismissTimer.value) {
    clearTimeout(dismissTimer.value)
    dismissTimer.value = null
  }
  setTimeout(() => {
    show.value = false
    wasOffline.value = false
  }, 300)
}

onUnmounted(() => {
  if (dismissTimer.value) clearTimeout(dismissTimer.value)
})
</script>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9998;
  transform: translateY(-100%);
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease;
  opacity: 0;
  pointer-events: none;
}

.offline-banner--visible {
  transform: translateY(0);
  opacity: 1;
  pointer-events: auto;
}

.offline-banner--online {
  background: linear-gradient(135deg, #065f46, #047857);
  border-bottom: 1px solid rgba(16, 185, 129, 0.4);
}

:not(.offline-banner--online).offline-banner--visible {
  background: linear-gradient(135deg, #1a1a2e, #2d1f3d);
  border-bottom: 1px solid rgba(245, 158, 11, 0.4);
}

.offline-banner__content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 38px 10px 14px;
  font-size: 13px;
  font-weight: 500;
  position: relative;
}

.offline-banner__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.offline-banner__text {
  color: #fff;
  white-space: nowrap;
}

.offline-banner__count {
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  white-space: nowrap;
}

.offline-banner__action {
  color: #fbbf24;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: 12px;
}

.offline-banner__syncing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #a7f3d0;
  font-size: 12px;
}

.offline-banner__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(16, 185, 129, 0.3);
  border-top-color: #10b981;
  border-radius: 50%;
  animation: offline-spin 0.6s linear infinite;
}

@keyframes offline-spin {
  to { transform: rotate(360deg); }
}

.offline-banner__synced {
  color: #6ee7b7;
  font-size: 12px;
  font-weight: 600;
}

.offline-banner__dismiss {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  transition: color 0.2s;
}

.offline-banner__dismiss:hover {
  color: rgba(255, 255, 255, 0.9);
}

/* Safe area top pour les mobiles à encoche */
@supports (padding-top: env(safe-area-inset-top)) {
  .offline-banner--visible {
    padding-top: env(safe-area-inset-top);
  }
}
</style>