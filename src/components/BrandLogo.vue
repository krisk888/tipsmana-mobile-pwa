<template>
  <div class="inline-flex items-center gap-2" role="img" aria-label="Tipsmana">
    <!-- Icône M torsadé officiel -->
    <img
      :src="iconSrc"
      :width="iconSize"
      :height="iconSize"
      class="shrink-0"
      alt=""
      style="object-fit:contain"
    />

    <!-- Wordmark -->
    <span
      v-if="showText"
      class="whitespace-nowrap leading-none tracking-tight"
      :class="[horizontal ? 'ml-1' : '']"
      :style="{
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 700,
        fontSize: `${Math.max(14, Math.round(size * 0.5))}px`,
        color: dark ? '#e2e8f0' : '#1e293b'
      }"
    >Tipsmana</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  size: { type: Number, default: 40 },
  showText: { type: Boolean, default: true },
  horizontal: { type: Boolean, default: false },
  dark: { type: Boolean, default: false },
})

const iconSize = computed(() => {
  if (!props.showText) return props.size
  return props.horizontal ? Math.round(props.size * 0.8) : Math.round(props.size * 0.7)
})

const iconSrc = computed(() => {
  const base = '/images/'
  return `${base}logo_icon_m.jpg`
})
</script>

<style scoped>
/* Montserrat depuis Google Fonts chargé dans index.html */
</style>