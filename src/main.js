import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { isAuthenticated } from './shared/auth'
import { initTheme } from './shared/useTheme'

// Applique le thème avant le mount pour éviter le flash dark/light
initTheme()

// Fade-out splash screen puis mount Vue
const splash = document.getElementById('app-splash')
if (splash) {
  splash.classList.add('hide')
  setTimeout(() => {
    splash.remove()
  }, 450)
}

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Check auth on startup
if (isAuthenticated() && router.currentRoute?.value?.path === '/login') {
  router.push('/pilot')
}

app.mount('#app')