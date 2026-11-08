<template>
  <button
    class="nav-item theme-toggle"
    :aria-label="ariaLabel"
    @click="toggleTheme"
  >
    <span class="nav-icon">{{ icon }}</span>
    <span class="nav-label">{{ label }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from './useTheme'
import { useI18n } from '../i18n'

const { t } = useI18n()

const { preference, toggleTheme } = useTheme()

const STATE = {
  dark: { icon: '☀️', label: 'ui.theme.day', aria: 'ui.theme.ariaDark' },
  light: { icon: '🌙', label: 'ui.theme.night', aria: 'ui.theme.ariaLight' },
  auto: { icon: '🌗', label: 'ui.theme.auto', aria: 'ui.theme.ariaAuto' },
}

const icon = computed(() => STATE[preference.value].icon)
const label = computed(() => t(STATE[preference.value].label))
const ariaLabel = computed(() => t(STATE[preference.value].aria))
</script>