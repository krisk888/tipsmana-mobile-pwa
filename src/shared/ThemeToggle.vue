<template>
  <button
    class="nav-item theme-toggle"
    :aria-label="theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'"
    @click="toggleTheme"
  >
    <span class="nav-icon">{{ theme === 'dark' ? '☀️' : '🌙' }}</span>
    <span class="nav-label">{{ theme === 'dark' ? 'Jour' : 'Nuit' }}</span>
  </button>
</template>

<script setup>
import { useTheme } from './useTheme'

const { theme, toggleTheme } = useTheme()
</script>
