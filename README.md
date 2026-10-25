# 🧾 Tipsmana Mobile PWA

Application mobile de gestion restaurant — **Vue 3 + Vite + PWA**.

Dédiée aux équipes en salle, cuisine, stock et pilotage. Interface mobile-first avec navigation par rôle, mode hors-ligne et notifications temps réel.

---

## 📦 Stack

| Couche | Technologie |
|--------|-------------|
| **Framework** | Vue 3 (`<script setup>` SFCs, Composition API) |
| **Build** | Vite 8 |
| **State** | Pinia (stores) |
| **Router** | vue-router 4 (`/mobile/` base path) |
| **PWA** | vite-plugin-pwa 2 (Workbox, SW auto-update) |
| **Styling** | Scoped CSS, dark/light theme via custom properties |
| **Tests** | Vitest 3 + @vue/test-utils + happy-dom |
| **HTTP** | `fetch()` wrapper avec JWT Bearer, auto-refresh 401, file d'attente offline |

---

## 🧭 Pages / Routes

| Route | Page | Rôle requis |
|-------|------|-------------|
| `/login` | Login | — |
| `/pilot` | Dashboard pilotage | OWNER, MANAGER |
| `/caisse` | Caisse / Tickets | OWNER, MANAGER, VENTES, SERVEUR |
| `/cuisine` | Écran cuisine (KDS) | OWNER, MANAGER, CUISINE |
| `/stock` | Scan inventaire | OWNER, MANAGER, INVENTAIRE |
| `/stock/receptions` | Réceptions | OWNER, MANAGER, ACHATS |
| `/stock/express` | Inventaire express | Tous (authed) |
| `/stock/:id` | Détail session stock | Tous (authed) |
| `/scan` | **Scan QR / code-barres** | Tous (authed) |
| `/notifications` | **Notifications** | Tous (authed) |
| `/profile` | **Profil** | Tous (authed) |
| `/validations` | Validations pilotage | Tous (authed) |

---

## ✅ Pages vérifiées

### 🔔 Notifications

- **Chargement** : squelettes animés pendant le fetch
- **Liste paginée** : 20 par page, bouton « Voir plus »
- **Read/Unread** : barre gauche violette + pastille de non-lue
- **Marquage individuel** : `PUT /notifications/{id}/read` au clic
- **Marquage tout lu** : `PUT /notifications/mark-all-read`
- **Polling 30s** : vérification légère du compteur de non-lues
- **Pull-to-refresh** : tactile (touchstart/touchmove/touchend)
- **Compteur en temps réel** : badge rouge dans la nav bottom
- **Priorité** : pastille colorée (urgent/high/medium/low)
- **TimeAgo** : affichage relatif (à l'instant, X min, Xh, Xj…)

### 👤 Profil

- **Carte identité** : avatar + nom/email + badge rôle
- **Édition prénom/nom/téléphone** : `PUT /auth/profile`
- **Changement mot de passe** : `POST /auth/password/change`
- **Préférences notifications** : toggles push/email, auto-save via `PUT /notifications/preferences`
- **Infos établissement** : nom, rôle, type (lecture seule)
- **Déconnexion** : nettoie le store + localStorage

### 📷 Scan QR

- **Bouton caméra** : `input[type=file][capture=environment]` → détection via `BarcodeDetector` (navigateur)
- **Saisie manuelle** : champ numérique + bouton OK
- **Lookup backend** : `GET /inventory/barcode/lookup?code=...`
- **Détection QR table** : pattern `table:N` → redirige vers `/caisse?table=N` (zéro API)
- **Gestion d'erreurs** :
  - 404 → message « Aucun produit pour le code X »
  - Échec réseau → message générique
  - Code-barres non détecté → invite à saisir manuellement
- **Résultat** : affiche code, nom produit, stock théorique

---

## 🔌 API Endpoints utilisés

### Auth
| Méthode | Path | Usage |
|---------|------|-------|
| POST | `/auth/login` | Connexion |
| POST | `/auth/refresh` | Refresh JWT |
| GET | `/auth/me` | Charger le profil |
| PUT | `/auth/profile` | Modifier le profil |
| POST | `/auth/password/change` | Changer mot de passe |

### Notifications
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/notifications?page=&per_page=` | Liste paginée |
| GET | `/notifications/unread-count` | Compteur nav |
| PUT | `/notifications/{id}/read` | Marquer lue |
| PUT | `/notifications/mark-all-read` | Tout marquer lu |
| GET | `/notifications/preferences` | Préférences |
| PUT | `/notifications/preferences` | Sauvegarder préférences |

### Scan / Inventaire
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/inventory/barcode/lookup?code=` | Lookup code-barres |
| GET | `/inventory/products/lookup/barcode/{code}` | ❌ N'existe pas dans le backend (utiliser le query-param ci-dessus) |

### Génériques
| Méthode | Path | Usage |
|---------|------|-------|
| GET | `/settings/general-settings/{key}` | Settings |
| GET | `/settings/payment-methods` | Méthodes de paiement |
| GET | `/products/categories/tree` | Arborescence catégories |
| GET | `/products` | Liste produits |
| POST | `/inventory/sessions` | Créer session inventaire |
| GET | `/inventory/sessions` | Lister sessions |
| POST | `/cash/dispatch` | Dispatch sans ticket |
| POST | `/sales/entries` | Créer entrée vente |

> L'API est préfixée par `/api/v1` en production (configurable via `VITE_API_URL`).

---

## 🏗️ Architecture

```
── src/
   ├── App.vue              # Layout, bottom-nav, polling notif
   ├── main.js              # Entry point, Pinia + router init
   ├── router.js            # Routes + guard auth/rôle
   ├── style.css            # Global styles
   ├── components/          # Composants réutilisables
   │   ├── TipsIcon.vue     # Icônes SVG dynamiques
   │   └── HelloWorld.vue   # (demo)
   ├── shared/              # Couches partagées
   │   ├── api.js           # ApiClient (JWT, refresh, offline queue)
   │   ├── auth.js          # Auth reactive + localStorage
   │   ├── offlineStore.js  # File d'attente offline (inventaire)
   │   ├── useTheme.js      # Thème dark/light
   │   └── ThemeToggle.vue
   ├── stores/
   │   └── authStore.js     # Pinia store auth
   └── views/
       ├── Login.vue        # Connexion + quick-login rôles
       ├── Notifications.vue
       ├── Profile.vue
       ├── Cuisine.vue
       ├── caisse/          # Tickets, CaisseCart
       ├── cuisine/         # Orders
       ├── pilot/           # Dashboard, Validations
       └── stock/           # ScanQR, InventoryScan, ExpressScan,
                            # Receptions, StockDetail
```

### Flux de données

```
Browser / PWA
  │
  ├── api.js (fetch + JWT) ── HTTPS ──▶ Backend FastAPI (:8000)
  │                                      ( /api/v1/* )
  │
  ├── localStorage
  │   ├── tipsmana_token        # JWT + refresh
  │   └── tipsmana_offline_*    # Queue offline
  │
  └── PWA Service Worker (Workbox)
      ├── Cache API (NetworkFirst)
      ├── Manifest (standalone, portrait)
      └── Offline fallback
```

### Dépendances principales

| Package | Rôle |
|---------|------|
| `vue@^3.5` | Framework |
| `vue-router@^4.6` | Routing |
| `pinia@^4.1` | State management |
| `vite-plugin-pwa@^2` | Manifest + Service Worker |
| `vitest@^3 + @vue/test-utils` | Tests unitaires |

---

## 🚧 Développement

```bash
# Installer les dépendances
npm install

# Serveur de dev (Vite, hot-reload)
npm run dev
# → http://localhost:5199/mobile/
# L'API est proxifiée vers http://127.0.0.1:8000

# Tests unitaires
npm run test:unit          # Vitest (23 tests, 2 suites)
npm run test               # Vérification endpoints API

# Preview production
npm run build && npm run preview
```

---

## 📦 Build & Déploiement

```bash
npm run build
```

Généré dans `dist/` :
```
dist/
├── assets/                 # JS/CSS chunkés
├── icons/                  # PWA icons
├── favicon.png
├── manifest.webmanifest
├── sw.js                   # Service Worker (Workbox)
├── workbox-*.js
└── index.html
```

Le build copie aussi `public/registerSW.js` dans `dist/registerSW.js`.

### Déploiement nginx

La PWA est servie sous le chemin `/mobile/` :

```nginx
location /mobile/ {
    alias /chemin/vers/tipsmana-mobile-pwa/dist/;
    try_files $uri $uri/ /mobile/index.html;
    expires 1y;
    add_header Cache-Control "public, immutable";

    # API proxy (optionnel — le backend peut être ailleurs)
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
    }
}
```

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `VITE_API_URL` | `/api/v1` | Base URL de l'API backend |

---

## 🧪 Tests

```bash
# Tests unitaires Vue (Vitest)
npm run test:unit
# → 2 suites, 23 tests

# Vérification endpoints API (statique)
npm run test
# → Scanne les appels api.*() dans les vues et les confronte
#   à la liste des endpoints backend connus
```

Les tests unitaires couvrent :
- **Notifications.vue** (14 tests) : rendu, skeleton, liste, marquage lu/tout lu, pagination, timeAgo, erreur
- **ScanQR.vue** (9 tests) : rendu, lookup manuel, détection QR table, gestion d'erreurs 404/réseau

---

## 🗺️ Documentation complémentaire

- `ARCHITECTURE-POS-MOBILE.md` — Architecture POS mobile, paiement NFC, Capacitor, SumUp, KDS WebSocket, impression WiFi Epson.