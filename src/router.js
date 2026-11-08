import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated } from './shared/auth'
import { t, i18nReady } from './i18n'

const routes = [
  { path: '/login', name: 'Login', component: () => import('./views/Login.vue'), meta: { guest: true } },
  { path: '/', redirect: '/pilot' },
  {
    path: '/pilot',
    name: 'Pilot',
    component: () => import('./views/pilot/Dashboard.vue'),
    meta: { titleKey: 'common.titles.pilot', icon: '📊', auth: true, roles: ['OWNER', 'MANAGER'] }
  },
  {
    path: '/stock',
    name: 'Stock',
    component: () => import('./views/stock/InventoryScan.vue'),
    meta: { titleKey: 'common.titles.stock', icon: '📦', auth: true, roles: ['OWNER', 'MANAGER', 'INVENTAIRE'] }
  },
  
  { path: '/validations', name: 'Validations', component: () => import('./views/pilot/Validations.vue'), meta: { auth: true } },
  { path: '/scan', name: 'ScanQR', component: () => import('./views/stock/ScanQR.vue'), meta: { auth: true } },
  { path: '/notifications', name: 'Notifications', component: () => import('./views/Notifications.vue'), meta: { titleKey: 'common.titles.notifications', auth: true } },
  { path: '/orders', name: 'Orders', component: () => import('./views/orders/OrdersList.vue'), meta: { titleKey: 'common.titles.orders', icon: 'orders', auth: true, roles: ['OWNER', 'MANAGER', 'CUISINE', 'VENTES', 'SERVEUR'] } },
  { path: '/profile', name: 'Profile', component: () => import('./views/Profile.vue'), meta: { titleKey: 'common.titles.profile', auth: true } },
  { path: '/stock/receptions', name: 'Receptions', component: () => import('./views/stock/Receptions.vue'), meta: { titleKey: 'common.titles.receptions', auth: true, roles: ['OWNER', 'MANAGER', 'ACHATS'] } },
  { path: '/stock/express', name: 'ExpressScan', component: () => import('./views/stock/ExpressScan.vue'), meta: { titleKey: 'common.titles.express', auth: true } },
  {
    // Stock produit par produit : seuils, filtre stock bas, ajustements rapides
    path: '/stock/inventory',
    name: 'InventoryItems',
    component: () => import('./views/stock/InventoryItems.vue'),
    meta: { titleKey: 'common.titles.inventoryItems', auth: true, roles: ['OWNER', 'MANAGER', 'INVENTAIRE'] }
  },
  { path: '/stock/:id', name: 'StockDetail', component: () => import('./views/stock/StockDetail.vue'), meta: { titleKey: 'common.titles.stockDetail', auth: true } },
  {
    path: '/caisse',
    name: 'Caisse',
    component: () => import('./views/caisse/Tickets.vue'),
    meta: { titleKey: 'common.titles.caisse', icon: 'caisse', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    path: '/cuisine',
    name: 'Cuisine',
    component: () => import('./views/cuisine/Orders.vue'),
    meta: { titleKey: 'common.titles.cuisine', icon: 'cuisine', auth: true, roles: ['OWNER', 'MANAGER', 'CUISINE'] }
  },
  {
    // KDS en colonnes (glisser-déposer) pour le rôle cuisine
    path: '/cuisine/board',
    name: 'KdsBoard',
    component: () => import('./views/cuisine/KdsBoard.vue'),
    meta: { titleKey: 'common.titles.kdsBoard', auth: true, roles: ['OWNER', 'MANAGER', 'CUISINE'] }
  },
  {
    path: '/service',
    name: 'Service',
    component: () => import('./views/service/TableSelect.vue'),
    meta: { titleKey: 'common.titles.service', icon: 'service', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    path: '/service/history',
    name: 'ServiceHistory',
    component: () => import('./views/service/OrderHistory.vue'),
    meta: { titleKey: 'common.titles.serviceHistory', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    path: '/service/profile',
    name: 'ServiceProfile',
    component: () => import('./views/service/ServiceProfile.vue'),
    meta: { titleKey: 'common.titles.serviceProfile', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    path: '/service/report',
    name: 'ServiceReport',
    component: () => import('./views/service/ServiceReport.vue'),
    meta: { titleKey: 'common.titles.serviceReport', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    path: '/service/table/:number(\\d+)',
    name: 'ServiceOrder',
    component: () => import('./views/service/OrderTaking.vue'),
    meta: { titleKey: 'common.titles.serviceOrder', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
  {
    // Écran client : note en lecture seule ouverte par QR code, sans connexion
    path: '/note/:ticketId',
    name: 'CustomerDisplay',
    component: () => import('./views/service/CustomerDisplay.vue'),
    meta: { titleKey: 'common.titles.customerDisplay', public: true, bare: true }
  },
  {
    // Appel serveur : page client ouverte par le QR code de la table, sans connexion
    path: '/mon-add/:table(\\d+)?',
    name: 'WaiterCall',
    component: () => import('./views/service/WaiterCall.vue'),
    meta: { titleKey: 'common.titles.waiterCall', public: true, bare: true }
  },
  {
    // Avis client : page ouverte par le QR code affiché après le solde de la table, sans connexion
    path: '/feedback',
    name: 'Feedback',
    component: () => import('./views/service/Feedback.vue'),
    meta: { titleKey: 'common.titles.feedback', public: true, bare: true }
  },
  {
    path: '/halls',
    name: 'plan-salle',
    component: () => import('./views/halls/plan-salle.vue'),
    meta: { titleKey: 'common.titles.halls', icon: 'halls', auth: true, roles: ['OWNER', 'MANAGER', 'VENTES', 'SERVEUR'] }
  },
]

const router = createRouter({
  history: createWebHistory('/mobile/'),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

// Textes des écrans : chargés en parallèle du chunk de la route (la page de
// connexion n'utilise que le catalogue de base, déjà là au mount)
router.beforeEach((to) => {
  if (!to.meta.guest) return i18nReady().then(() => {}, () => {})
})

router.beforeEach((to, from, next) => {
  if (to.meta.public) return next()
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

// Titre de l'onglet / de l'app installée dans la langue active
router.afterEach((to) => {
  if (typeof document === 'undefined') return
  document.title = to.meta.titleKey ? `${t(to.meta.titleKey)} · Tipsmana` : "Tipsmana — L'App du Boss"
})

export default router