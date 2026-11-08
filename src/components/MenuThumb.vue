<template>
  <span class="menu-thumb" :class="{ empty: !showImage }" :style="sizeStyle">
    <img
      v-if="showImage"
      :src="src"
      :alt="alt"
      :width="size || undefined"
      :height="size || undefined"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <span v-else class="menu-thumb-icon" aria-hidden="true">{{ icon }}</span>
  </span>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

// size = côté en px (vignette carrée) ; 0 = remplit le parent (galerie)
const props = defineProps({
  src: { type: String, default: null },
  alt: { type: String, default: '' },
  icon: { type: String, default: '🍽' },
  size: { type: Number, default: 80 },
})

// Image absente du cache hors-ligne ou URL cassée : pictogramme du service
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })

const showImage = computed(() => !!props.src && !failed.value)
const sizeStyle = computed(() => (props.size ? { width: `${props.size}px`, height: `${props.size}px` } : null))
</script>

<style scoped>
.menu-thumb {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  overflow: hidden; border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}
.menu-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.menu-thumb-icon { font-size: 30px; opacity: 0.7; }
</style>
