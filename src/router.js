import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from './shared/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('./views/Login.vue'), meta: { guest: true } },
  { path: '/', redirect: '/pilot' },
  {
    path: '/pilot',
    name: 'Pilot',
    component: () => import('./views/pilot/Dashboard.vue'),
    meta: { title: 'Pilote', icon: '📊', auth: true, roles: ['OWNER', 'MANAGER'] }
  },
  {
    path: '/stock',
    name: 'Stock',
    component: () => import('./views/stock/InventoryScan.vue'),
    meta: { title: 'Stock', icon: '📦', auth: true, roles: ['OWNER', 'MANAGER', 'INVENTAIRE'] }
  },
  
  { path: '/validations', name: 'Validations', component: () => import('./views/pilot/Validations.vue'), meta: { auth: true } },
  { path: '/scan', name: 'ScanQR', component: () => import('./views/stock/ScanQR.vue'), meta: { auth: true } },
  { path: '/stock/receptions', name: 'Receptions', component: () => import('./views/stock/Receptions.vue'), meta: { title: 'Réceptions', auth: true, roles: ['OWNER', 'MANAGER', 'ACHATS'] } },
  { path: '/stock/express', name: 'ExpressScan', component: () => import('./views/stock/ExpressScan.vue'), meta: { title: 'Inventaire express', auth: true } },
  { path: '/stock/:id', name: 'StockDetail', component: () => import('./views/stock/StockDetail.vue'), meta: { title: 'Session stock', auth: true } },
  {
    path: '/caisse',
    name: 'Caisse',
    component: () => import('./views/caisse/Tickets.vue'),
    meta: { title: 'Caisse', icon: 'caisse', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    path: '/cuisine',
    name: 'Cuisine',
    component: () => import('./views/cuisine/Orders.vue'),
    meta: { title: 'Cuisine', icon: 'cuisine', auth: true, roles: ['OWNER', 'MANAGER', 'CUISINE'] }
  },
]

const router = createRouter({
  history: createWebHistory('/mobile/'),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.beforeEach((to, from, next) => {
  if (to.meta.auth && !isAuthenticated()) {
    return next('/login')
  }
  if (to.meta.guest && isAuthenticated()) {
    return next('/pilot')
  }
  // Vérification rôles — si la route restreint et que le store est chargé
  if (to.meta.roles && isAuthenticated()) {
    try {
      const store = window.__PINIA__?.state?._auth
      const roleCode = store?.roleCode
      if (roleCode && !to.meta.roles.includes(roleCode)) {
        const homeMap = { OWNER:'/pilot', MANAGER:'/pilot', CUISINE:'/cuisine',
                          INVENTAIRE:'/stock', VENTES:'/caisse', ACHATS:'/stock/receptions', SERVEUR:'/caisse' }
        return next(homeMap[roleCode] || '/pilot')
      }
    } catch (e) { /* store pas prêt, on laisse passer */ }
  }
  next()
})

export default router