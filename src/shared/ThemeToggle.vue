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

const { preference, toggleTheme } = useTheme()

const STATE = {
  dark: { icon: '☀️', label: 'Jour' },
  light: { icon: '🌙', label: 'Nuit' },
  auto: { icon: '🌗', label: 'Auto' },
}

const icon = computed(() => STATE[preference.value].icon)
const label = computed(() => STATE[preference.value].label)
const ariaLabel = computed(
  () =>
    ({
      dark: 'Mode sombre — cliquer pour passer en mode clair',
      light: 'Mode clair — cliquer pour passer en mode auto',
      auto: 'Mode auto (sombre de 20h à 7h) — cliquer pour passer en mode sombre',
    })[preference.value]
)
</script>