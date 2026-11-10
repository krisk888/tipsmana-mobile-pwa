<template>
  <div class="mn-shell">
    <header class="mn-header">
      <img src="/images/logo_icon_m.jpg" alt="" class="mn-logo" />
      <div class="mn-header-main">
        <div class="mn-kicker">{{ t('menu.kicker') }}</div>
        <h1 class="mn-title">{{ menu?.establishmentName || t('menu.title') }}</h1>
      </div>
      <span v-if="params.table" class="mn-table">{{ t('common.table', { number: params.table }) }}</span>
    </header>

    <div v-if="loading && !menu" class="mn-state">
      <span class="mn-spinner"></span>
      <p class="mn-state-text">{{ t('menu.loading') }}</p>
    </div>

    <div v-else-if="!menu" class="mn-state">
      <span class="mn-state-icon">{{ reason === 'offline' ? '📴' : '🍽' }}</span>
      <p class="mn-state-title">{{ t(`menu.errors.${reason}Title`) }}</p>
      <p class="mn-state-text">{{ t(`menu.errors.${reason}Text`) }}</p>
      <button class="mn-retry" @click="load">{{ t('common.retry') }}</button>
    </div>

    <template v-else>
      <div v-if="source === 'cache'" class="mn-banner" role="status">📴 {{ t('menu.cached', { time: cachedTime }) }}</div>

      <nav class="mn-cats" :aria-label="t('menu.categories')">
        <button
          v-for="c in categories"
          :key="c.id"
          class="mn-cat-chip"
          :class="{ active: activeCat === c.id }"
          @click="scrollTo(c.id)"
        >{{ c.name }}</button>
      </nav>

      <input
        v-model="search"
        class="mn-search"
        type="search"
        :placeholder="t('menu.search')"
        :aria-label="t('menu.search')"
      />

      <p v-if="!categories.length" class="mn-empty">{{ search ? t('menu.noResult') : t('menu.empty') }}</p>

      <main class="mn-main">
        <section
          v-for="c in categories"
          :id="`cat-${c.id}`"
          :key="c.id"
          :ref="el => setSectionRef(c.id, el)"
          class="mn-section"
          :data-cat="c.id"
        >
          <div class="mn-section-hero" :class="{ plain: !c.imageUrl || brokenImages[c.imageUrl] }">
            <img
              v-if="c.imageUrl && !brokenImages[c.imageUrl]"
              :src="c.imageUrl"
              alt=""
              loading="lazy"
              decoding="async"
              @error="brokenImages[c.imageUrl] = true"
            />
            <div class="mn-section-heading">
              <h2 class="mn-section-title">{{ c.name }}</h2>
              <p v-if="c.description" class="mn-section-desc">{{ c.description }}</p>
            </div>
          </div>

          <ul class="mn-items">
            <li v-for="i in c.items" :key="i.id" class="mn-item" :class="{ 'with-image': hasImage(i) }">
              <img
                v-if="hasImage(i)"
                class="mn-item-img"
                :src="i.imageUrl"
                :alt="i.name"
                loading="lazy"
                decoding="async"
                @error="brokenImages[i.imageUrl] = true"
              />
              <div class="mn-item-body">
                <div class="mn-item-top">
                  <h3 class="mn-item-name">{{ i.name }}</h3>
                  <span v-if="i.price != null" class="mn-item-price">{{ formatPrice(i.price) }}</span>
                </div>
                <p v-if="i.description" class="mn-item-desc">{{ i.description }}</p>
                <p v-if="i.allergens.length" class="mn-item-allergens">{{ t('menu.allergens', { list: i.allergens.join(', ') }) }}</p>
              </div>
            </li>
          </ul>
        </section>
      </main>
    </template>

    <footer class="mn-footer">
      <router-link v-if="params.table" :to="`/mon-add/${params.table}`" class="mn-call">🔔 {{ t('menu.callWaiter') }}</router-link>
      <LanguageSwitcher />
      <p class="mn-footnote">{{ t('menu.pricesNote') }}</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { fetchPublicMenu, menuParamsFromRoute, searchMenu } from '../../shared/publicMenu'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../i18n'

const { t, locale, intlLocale } = useI18n()
const route = useRoute()

const params = computed(() => menuParamsFromRoute(route))
const menu = ref(null)
const source = ref(null)
const cachedAt = ref(null)
const reason = ref('unavailable')
const loading = ref(true)
const search = ref('')
const activeCat = ref(null)
const brokenImages = reactive({})

const categories = computed(() => searchMenu(menu.value?.categories || [], search.value))
const cachedTime = computed(() => (cachedAt.value
  ? new Date(cachedAt.value).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' })
  : ''))

function hasImage(item) {
  return !!item.imageUrl && !brokenImages[item.imageUrl]
}

function formatPrice(v) {
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'EUR' }).format(v)
}

async function load() {
  loading.value = true
  try {
    const res = await fetchPublicMenu({ establishmentId: params.value.establishmentId, lang: locale.value })
    if (res.ok) {
      menu.value = res.menu
      source.value = res.source
      cachedAt.value = res.at || null
      activeCat.value = res.menu.categories[0]?.id || null
    } else if (!menu.value) {
      reason.value = res.reason
    }
  } finally {
    loading.value = false
  }
}

/* ═══ Catégorie active selon le défilement ═══ */
const sectionEls = new Map()
let observer = null

function setSectionRef(id, el) {
  if (el) {
    sectionEls.set(id, el)
    observer?.observe(el)
  } else {
    sectionEls.delete(id)
  }
}

function scrollTo(id) {
  activeCat.value = id
  sectionEls.get(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver((entries) => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (top) activeCat.value = top.target.dataset.cat
    }, { rootMargin: '-120px 0px -60% 0px' })
    for (const el of sectionEls.values()) observer.observe(el)
  }
  // Langue du navigateur déjà appliquée par le routeur (meta.browserLocale)
  await load()
})

// Changement de langue : carte rechargée (noms / descriptions traduits par le backend)
watch(locale, () => { if (menu.value && source.value === 'public') load() })

onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
/* Page client : claire et lisible quel que soit le thème de l'app */
.mn-shell {
  display: flex; flex-direction: column;
  min-height: 100dvh;
  background: #fafaf7; color: #1f2937;
  font-size: 17px;
}

.mn-header {
  display: flex; align-items: center; gap: 12px;
  padding: calc(16px + env(safe-area-inset-top)) 18px 14px;
  background: #fff;
}
.mn-logo { width: 42px; height: 42px; border-radius: 12px; object-fit: cover; }
.mn-header-main { flex: 1; min-width: 0; }
.mn-kicker { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; }
.mn-title { margin: 0; font-size: 26px; font-weight: 800; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mn-table { flex-shrink: 0; padding: 6px 12px; border-radius: 999px; background: #ecfdf5; color: #047857; font-size: 14px; font-weight: 700; }

.mn-banner { margin: 10px 18px 0; padding: 10px 14px; border-radius: 12px; background: #fef3c7; color: #92400e; font-size: 14px; font-weight: 600; }

.mn-cats {
  position: sticky; top: 0; z-index: 5;
  display: flex; gap: 8px; overflow-x: auto;
  padding: 10px 18px; background: rgba(250, 250, 247, 0.95);
  backdrop-filter: blur(8px); scrollbar-width: none;
  border-bottom: 1px solid #ece9e2;
}
.mn-cats::-webkit-scrollbar { display: none; }
.mn-cat-chip {
  flex-shrink: 0; padding: 9px 16px; border-radius: 999px; cursor: pointer;
  border: 1px solid #e5e7eb; background: #fff; color: #374151;
  font-size: 15px; font-weight: 600; white-space: nowrap;
}
.mn-cat-chip.active { background: #111827; border-color: #111827; color: #fff; }

.mn-search {
  margin: 12px 18px 0; padding: 12px 16px; border-radius: 14px;
  border: 1px solid #e5e7eb; background: #fff; color: #111827; font: inherit; font-size: 16px;
}

.mn-main { display: flex; flex-direction: column; gap: 28px; padding: 16px 18px 8px; }
.mn-section { scroll-margin-top: 64px; }

.mn-section-hero {
  position: relative; overflow: hidden; border-radius: 20px;
  aspect-ratio: 16 / 9; background: #e7e5e4;
}
.mn-section-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mn-section-hero:not(.plain) .mn-section-heading {
  position: absolute; inset: auto 0 0 0; padding: 40px 18px 16px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7)); color: #fff;
}
.mn-section-hero.plain { aspect-ratio: auto; background: none; border-radius: 0; }
.mn-section-title { margin: 0; font-size: 26px; font-weight: 800; line-height: 1.15; }
.mn-section-desc { margin: 4px 0 0; font-size: 15px; opacity: 0.85; }

.mn-items { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.mn-item { overflow: hidden; border-radius: 18px; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.mn-item-img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #f3f4f6; }
.mn-item-body { padding: 14px 16px 16px; }
.mn-item-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.mn-item-name { margin: 0; font-size: 19px; font-weight: 700; line-height: 1.25; }
.mn-item-price { flex-shrink: 0; font-size: 18px; font-weight: 800; color: #047857; }
.mn-item-desc { margin: 6px 0 0; font-size: 15px; line-height: 1.45; color: #6b7280; }
.mn-item-allergens { margin: 8px 0 0; font-size: 13px; color: #9a3412; }

.mn-empty { margin: 32px 18px; text-align: center; color: #6b7280; }

.mn-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; text-align: center; }
.mn-state-icon { font-size: 56px; }
.mn-state-title { margin: 0; font-size: 22px; font-weight: 800; }
.mn-state-text { margin: 0; font-size: 16px; color: #6b7280; }
.mn-retry { margin-top: 12px; padding: 12px 24px; border: none; border-radius: 14px; background: #059669; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; }
.mn-spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #059669; border-radius: 50%; animation: mn-spin 0.7s linear infinite; }
@keyframes mn-spin { to { transform: rotate(360deg); } }

.mn-footer {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
}
.mn-call {
  width: 100%; box-sizing: border-box; padding: 16px; border-radius: 16px; text-align: center;
  background: #111827; color: #fff; font-size: 17px; font-weight: 700; text-decoration: none;
}
.mn-footnote { margin: 0; font-size: 13px; color: #9ca3af; text-align: center; }
</style>
