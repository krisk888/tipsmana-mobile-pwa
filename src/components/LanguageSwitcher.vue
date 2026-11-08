<template>
  <div class="lang-switch" role="radiogroup" :aria-label="t('common.language')">
    <button
      v-for="l in LOCALES"
      :key="l.code"
      type="button"
      role="radio"
      class="lang-btn"
      :class="{ active: locale === l.code }"
      :aria-checked="locale === l.code"
      :disabled="busy"
      @click="choose(l.code)"
    >
      <span class="lang-flag">{{ l.flag }}</span>
      <span class="lang-label">{{ l.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { LOCALES, useI18n } from '../i18n'

const { t, locale, setLocale } = useI18n()
const busy = ref(false)

async function choose(code) {
  if (code === locale.value || busy.value) return
  busy.value = true
  try {
    await setLocale(code)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.lang-switch { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.lang-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 4px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--card-border, #2a2a40); background: var(--bg, #0d0d14);
  color: var(--text, #fff); font-family: inherit;
}
.lang-btn.active { border-color: var(--primary, #10b981); box-shadow: 0 0 0 1px var(--primary, #10b981) inset; }
.lang-btn:disabled { opacity: 0.6; }
.lang-flag { font-size: 20px; line-height: 1; }
.lang-label { font-size: 12px; font-weight: 700; }
</style>
