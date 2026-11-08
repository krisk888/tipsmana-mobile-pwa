import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { isAuthenticated } from './shared/auth'
import { initTheme } from './shared/useTheme'
import i18n, { initI18n } from './i18n'

// Applique le thème avant le mount pour éviter le flash dark/light
initTheme()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Check auth on startup
if (isAuthenticated() && router.currentRoute?.value?.path === '/login') {
  router.push('/pilot')
}

// Catalogue de la langue choisie chargé avant le mount (pas de flash de clés)
initI18n().catch(() => {}).finally(() => {
  // Fade-out splash screen puis mount Vue
  const splash = document.getElementById('app-splash')
  if (splash) {
    splash.classList.add('hide')
    setTimeout(() => {
      splash.remove()
    }, 450)
  }
  app.mount('#app')
})