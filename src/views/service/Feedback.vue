<template>
  <div class="fb-shell">
    <header class="fb-header">
      <img src="/images/logo_icon_m.jpg" alt="" class="fb-logo" />
      <div class="fb-header-main">
        <div class="fb-kicker">{{ t('feedback.kicker') }}</div>
        <div class="fb-title">{{ params.table ? t('common.table', { number: params.table }) : t('feedback.title') }}</div>
      </div>
    </header>

    <!-- Lien sans table : le QR code n'a pas été scanné -->
    <div v-if="!params.table" class="fb-state">
      <span class="fb-state-icon">📷</span>
      <p class="fb-state-title">{{ t('feedback.noTableTitle') }}</p>
      <p class="fb-state-text">{{ t('feedback.noTableText') }}</p>
    </div>

    <div v-else-if="sent" class="fb-state">
      <span class="fb-state-icon">💚</span>
      <p class="fb-state-title">{{ t('feedback.thanksTitle') }}</p>
      <p class="fb-state-text">{{ t('feedback.thanksText') }}</p>
    </div>

    <form v-else class="fb-main" @submit.prevent="send">
      <p class="fb-question">{{ t('feedback.question') }}</p>

      <div class="fb-stars" role="radiogroup" :aria-label="t('feedback.ratingLabel')">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          role="radio"
          class="fb-star"
          :class="{ on: n <= (hover || rating) }"
          :aria-checked="rating === n"
          :aria-label="t('feedback.stars', { count: n })"
          @click="rating = n"
          @mouseenter="hover = n"
          @mouseleave="hover = 0"
        >★</button>
      </div>
      <p class="fb-rating-label">{{ rating ? t(`feedback.ratings.${rating}`) : ' ' }}</p>

      <label class="fb-comment-label" for="fb-comment">{{ t('feedback.commentLabel') }}</label>
      <textarea
        id="fb-comment"
        v-model="comment"
        class="fb-comment"
        rows="4"
        :maxlength="COMMENT_MAX"
        :placeholder="t('feedback.commentPlaceholder')"
      ></textarea>

      <button class="fb-submit" type="submit" :disabled="!rating || busy">
        {{ busy ? t('feedback.sending') : t('feedback.submit') }}
      </button>

      <div v-if="error" class="fb-error" role="alert">{{ t(`feedback.errors.${error}`) }}</div>
    </form>

    <footer class="fb-footer">
      <LanguageSwitcher />
    </footer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { COMMENT_MAX, feedbackParamsFromRoute, lastFeedbackAt, submitFeedback } from '../../shared/feedback'
import LanguageSwitcher from '../../components/LanguageSwitcher.vue'
import { useI18n } from '../../i18n'

const { t } = useI18n()
const route = useRoute()

const params = computed(() => feedbackParamsFromRoute(route))
const rating = ref(0)
const hover = ref(0)
const comment = ref('')
const busy = ref(false)
const error = ref(null)
// Avis déjà laissé depuis ce téléphone : directement le remerciement
const sent = ref(!!(params.value.table && lastFeedbackAt(params.value.table, params.value.establishmentId)))

async function send() {
  if (!rating.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    const res = await submitFeedback({
      table: params.value.table,
      rating: rating.value,
      comment: comment.value,
      establishmentId: params.value.establishmentId,
    })
    if (res.ok || res.reason === 'already') sent.value = true
    else error.value = res.reason
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
/* Page client : claire et lisible quel que soit le thème de l'app */
.fb-shell {
  display: flex; flex-direction: column;
  min-height: 100dvh;
  background: #fafaf7; color: #111827;
  font-size: 18px;
}

.fb-header {
  display: flex; align-items: center; gap: 14px;
  padding: calc(18px + env(safe-area-inset-top)) 20px 18px;
  border-bottom: 1px solid #e5e7eb; background: #fff;
}
.fb-logo { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; }
.fb-kicker { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #059669; }
.fb-title { font-size: 30px; font-weight: 800; line-height: 1.1; }

.fb-main { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 24px 20px; }
.fb-question { margin: 0; font-size: 22px; font-weight: 800; text-align: center; }

.fb-stars { display: flex; justify-content: center; gap: 6px; }
.fb-star {
  width: 56px; height: 56px; border: none; background: none; cursor: pointer; padding: 0;
  font-size: 48px; line-height: 1; color: #d1d5db; transition: transform 0.1s, color 0.1s;
}
.fb-star.on { color: #f59e0b; }
.fb-star:active { transform: scale(0.9); }
.fb-rating-label { margin: 0; min-height: 22px; font-size: 16px; font-weight: 700; color: #92400e; text-align: center; }

.fb-comment-label { font-size: 15px; font-weight: 700; color: #6b7280; }
.fb-comment {
  width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 14px; resize: vertical;
  border: 1px solid #e5e7eb; background: #fff; color: #111827; font: inherit; font-size: 16px;
}

.fb-submit {
  min-height: 64px; border: none; border-radius: 18px; cursor: pointer;
  background: #059669; color: #fff; font-size: 20px; font-weight: 800;
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.3);
}
.fb-submit:disabled { background: #a7f3d0; box-shadow: none; cursor: default; }

.fb-error { padding: 14px 16px; border-radius: 14px; font-size: 16px; font-weight: 600; text-align: center; background: #fef3c7; color: #92400e; }

.fb-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 32px 24px; text-align: center; }
.fb-state-icon { font-size: 56px; }
.fb-state-title { margin: 0; font-size: 24px; font-weight: 800; }
.fb-state-text { margin: 0; font-size: 17px; color: #6b7280; }

.fb-footer { display: flex; justify-content: center; padding: 16px 20px calc(16px + env(safe-area-inset-bottom)); }
</style>
