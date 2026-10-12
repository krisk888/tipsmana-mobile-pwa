<template>
  <img
    :src="src"
    :alt="alt"
    :width="size"
    :height="size"
    class="tips-icon"
    draggable="false"
    @error="onError"
  />
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTheme } from '../shared/useTheme'

const props = defineProps({
  name: { type: String, required: true },
  // 'dark' | 'light' | null → auto-détection via useTheme quand omis
  mode: { type: String, default: null },
  size: { type: Number, default: 22 },
})

const { theme } = useTheme()

// Noms d'usage → noms officiels du dépôt d'icônes Tipsmana
const NAME_MAP = {
  pilote: 'dashboard',
  stock: 'stock_overview',
  caisse: 'sales_overview',
  cuisine: 'products_recipes',
  quitter: 'logout',
}

// Icônes absentes du dépôt → repli
const FALLBACKS = {
  logout: 'settings_overview', // pas de logout_*.png dans le dépôt
}

const usedFallback = ref(false)

const resolvedName = computed(() => NAME_MAP[props.name] || props.name)
const effectiveMode = computed(() =>
  props.mode || (theme.value === 'light' ? 'light' : 'dark')
)
const iconFile = computed(() =>
  usedFallback.value && FALLBACKS[resolvedName.value]
    ? FALLBACKS[resolvedName.value]
    : resolvedName.value
)

const src = computed(
  () =>
    `${import.meta.env.BASE_URL}icons/${effectiveMode.value}/${iconFile.value}_${effectiveMode.value}.png`
)

const alt = computed(() => `${props.name} (${effectiveMode.value})`)

function onError(e) {
  const fb = FALLBACKS[resolvedName.value]
  if (fb && !usedFallback.value) {
    usedFallback.value = true // le computed recalculera vers l'icône de repli
  } else {
    e.target.style.display = 'none'
  }
}
</script>

<style scoped>
.tips-icon {
  display: inline-block;
  vertical-align: middle;
}
</style>
