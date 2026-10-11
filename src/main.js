import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { isAuthenticated } from './shared/auth'

const app = createApp(App)
app.use(router)

// Check auth on startup
if (isAuthenticated() && router.currentRoute?.value?.path === '/login') {
  router.push('/pilot')
}

app.mount('#app')