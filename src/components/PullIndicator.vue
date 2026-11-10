<template>
  <!-- Indicateur du « tirer pour rafraîchir » (usePullToRefresh) -->
  <div
    v-if="distance > 0 || refreshing"
    class="ptr"
    :style="{ height: `${refreshing ? 48 : distance}px` }"
    role="status"
    aria-live="polite"
  >
    <span v-if="refreshing" class="ptr-spinner"></span>
    <span v-else class="ptr-arrow" :class="{ armed }" :style="{ opacity: Math.min(1, distance / threshold) }">↓</span>
    <span class="ptr-label">{{ label }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '../i18n'

const props = defineProps({
  distance: { type: Number, default: 0 },
  refreshing: { type: Boolean, default: false },
  threshold: { type: Number, default: 70 },
})

const { t } = useI18n()

const armed = computed(() => props.distance >= props.threshold)
const label = computed(() => {
  if (props.refreshing) return t('ui.pull.refreshing')
  return armed.value ? t('ui.pull.release') : t('ui.pull.pull')
})
</script>

<style scoped>
.ptr {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  overflow: hidden; flex-shrink: 0;
  color: var(--muted, #8a8aa0); font-size: 12px; font-weight: 700;
  transition: height 0.15s ease-out;
}
.ptr-arrow { font-size: 18px; transition: transform 0.2s; }
.ptr-arrow.armed { transform: rotate(180deg); color: var(--primary, #10b981); }
.ptr-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--card-border, #2a2a40); border-top-color: var(--primary, #10b981);
  animation: ptr-spin 0.7s linear infinite;
}
@keyframes ptr-spin { to { transform: rotate(360deg); } }
</style>
