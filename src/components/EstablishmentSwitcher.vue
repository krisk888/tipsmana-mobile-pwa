<template>
  <div v-if="establishments.length" ref="root" class="est-switcher" :class="{ open }">
    <button
      type="button"
      class="est-trigger"
      :disabled="switching || establishments.length < 2"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="t('ui.establishment.activeAria', { name: active?.name || '—' })"
      @click="toggle"
    >
      <span class="est-dot" :class="{ busy: switching }"></span>
      <span class="est-text">
        <span class="est-caption">{{ t('ui.establishment.active') }}</span>
        <span class="est-name">{{ active?.name || '—' }}</span>
      </span>
      <span v-if="establishments.length > 1" class="est-chevron" aria-hidden="true">▾</span>
    </button>

    <transition name="est-pop">
      <ul v-if="open" class="est-menu" role="listbox" :aria-activedescendant="`est-opt-${active?.id}`">
        <li
          v-for="est in establishments"
          :id="`est-opt-${est.id}`"
          :key="est.id"
          role="option"
          class="est-option"
          :class="{ selected: isActive(est) }"
          :aria-selected="isActive(est)"
          tabindex="0"
          @click="select(est)"
          @keydown.enter.prevent="select(est)"
          @keydown.space.prevent="select(est)"
        >
          <span class="est-option-name">{{ est.name || t('ui.establishment.fallbackName', { id: est.id }) }}</span>
          <span v-if="est.role_name || est.role_code" class="est-option-role">{{ est.role_name || est.role_code }}</span>
          <span v-if="isActive(est)" class="est-check" aria-hidden="true">✓</span>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useI18n } from '../i18n'

const { t } = useI18n()

const authStore = useAuthStore()
const root = ref(null)
const open = ref(false)

const establishments = computed(() => authStore.establishments)
const switching = computed(() => authStore.switchingEstablishment)
const active = computed(() =>
  establishments.value.find(e => String(e.id) === String(authStore.activeEstablishmentId)) || authStore.establishment
)

function isActive(est) {
  return String(est.id) === String(authStore.activeEstablishmentId)
}

function toggle() {
  open.value = !open.value
}

async function select(est) {
  open.value = false
  if (isActive(est)) return
  const ok = await authStore.setEstablishment(est.id)
  if (ok && window.__showToast) window.__showToast(t('ui.establishment.switched', { name: est.name || est.id }))
}

function onDocClick(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
function onKeydown(e) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.est-switcher { position: relative; z-index: 50; }

/* Glassmorphism — palette FixOps (--primary / --primary-glow) */
.est-trigger {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: var(--text, #e2e2e8);
  text-align: left;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}
.est-trigger:not(:disabled):active { transform: scale(0.98); }
.est-switcher.open .est-trigger,
.est-trigger:focus-visible {
  outline: none;
  border-color: var(--primary, #10b981);
  box-shadow: 0 0 0 2px var(--primary-glow, rgba(16, 185, 129, 0.25)), 0 4px 24px rgba(0, 0, 0, 0.25);
}
.est-trigger:disabled { cursor: default; }

.est-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--primary, #10b981);
  box-shadow: 0 0 8px var(--primary, #10b981);
}
.est-dot.busy { background: var(--amber, #f59e0b); box-shadow: 0 0 8px var(--amber, #f59e0b); animation: est-pulse 1s ease-in-out infinite; }
@keyframes est-pulse { 50% { opacity: 0.4; } }

.est-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.est-caption { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #7d7d8a); }
.est-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.est-chevron { font-size: 12px; color: var(--text-muted, #7d7d8a); transition: transform 0.2s; }
.est-switcher.open .est-chevron { transform: rotate(180deg); }

.est-menu {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0;
  list-style: none; padding: 6px; margin: 0;
  max-height: 50vh; overflow-y: auto;
  background: rgba(18, 18, 30, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  backdrop-filter: blur(18px) saturate(160%);
  -webkit-backdrop-filter: blur(18px) saturate(160%);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.est-option {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 10px;
  font-size: 14px; color: var(--text, #e2e2e8);
  cursor: pointer; transition: background 0.15s;
}
.est-option:hover, .est-option:focus-visible { outline: none; background: rgba(255, 255, 255, 0.06); }
.est-option.selected { background: rgba(16, 185, 129, 0.12); color: #34d399; }
.est-option-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.est-option-role {
  font-size: 10px; text-transform: uppercase; padding: 2px 6px; border-radius: 6px;
  background: rgba(255, 255, 255, 0.08); color: var(--text-muted, #7d7d8a);
}
.est-check { font-weight: 700; color: var(--primary, #10b981); }

.est-pop-enter-active, .est-pop-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.est-pop-enter-from, .est-pop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>

<style>
/* Thème clair (useTheme → html.theme-light) — non scopé : la classe est sur <html> */
.theme-light .est-trigger { background: rgba(255, 255, 255, 0.55); border-color: rgba(0, 0, 0, 0.08); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); }
.theme-light .est-menu { background: rgba(255, 255, 255, 0.85); border-color: rgba(0, 0, 0, 0.08); }
.theme-light .est-option:hover { background: rgba(0, 0, 0, 0.05); }
.theme-light .est-option.selected { color: #059669; }
</style>
