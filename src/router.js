import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from './shared/auth'

const routes = [
  { path: '/login', name: 'Login', component: () => import('./views/Login.vue'), meta: { guest: true } },
  { path: '/', redirect: '/pilot' },
  {
    path: '/pilot',
    name: 'Pilot',
    component: () => import('./views/pilot/Dashboard.vue'),
    meta: { title: 'Pilote', icon: '📊', auth: true }
  },
  {
    path: '/stock',
    name: 'Stock',
    component: () => import('./views/stock/InventoryScan.vue'),
    meta: { title: 'Stock', icon: '📦', auth: true }
  },
  {
    path: '/caisse',
    name: 'Caisse',
    component: () => import('./views/caisse/Tickets.vue'),
    meta: { title: 'Caisse', icon: '💳', auth: true }
  },
  {
    path: '/caisse/new',
    name: 'NewTicket',
    component: () => import('./views/caisse/NewTicket.vue'),
    meta: { title: 'Nouveau ticket', auth: true }
  },
  {
    path: '/caisse/:id',
    name: 'TicketDetail',
    component: () => import('./views/caisse/TicketDetail.vue'),
    meta: { title: 'Détail ticket', auth: true }
  },
  {
    path: '/cuisine',
    name: 'Cuisine',
    component: () => import('./views/cuisine/Orders.vue'),
    meta: { title: 'Cuisine', icon: '🍳', auth: true }
  },
  { path: '/validations', name: 'Validations', component: () => import('./views/pilot/Validations.vue'), meta: { auth: true } },
  { path: '/scan', name: 'ScanQR', component: () => import('./views/stock/ScanQR.vue'), meta: { auth: true } },
  { path: '/stock/receptions', name: 'Receptions', component: () => import('./views/stock/Receptions.vue'), meta: { title: 'Réceptions', auth: true } },
  { path: '/stock/:id', name: 'StockDetail', component: () => import('./views/stock/StockDetail.vue'), meta: { title: 'Session stock', auth: true } },
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
  next()
})

export default router