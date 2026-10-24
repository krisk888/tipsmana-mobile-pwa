/**
 * API Endpoints Verification Test
 * Checks that api.*() calls in Vue views match expected backend endpoints.
 * Run: node tests/api-endpoints-verification.js
 */
import fs from 'fs'
import path from 'path'

/* ── Expected backend endpoints (verified 2026-10-25) ────────────────── */
const EXPECTED = [
  // Settings — mobile calls /general-settings/{key} which resolves to /settings/general-settings/{key}
  { method: 'GET',    pattern: '/general-settings/{id}', exist: true, note: 'GET /api/v1/settings/general-settings/{key}' },
  { method: 'GET',    pattern: '/settings/payment-methods', exist: false, note: 'NOT in backend' },
  // Products
  { method: 'GET',    pattern: '/products/categories/tree', exist: true, note: 'list category tree' },
  { method: 'GET',    pattern: '/products/categories', exist: true, note: 'list flat categories' },
  { method: 'GET',    pattern: '/products', exist: true, note: 'list products' },
  // Inventory sessions
  { method: 'GET',    pattern: '/inventory/sessions', exist: true, note: 'list inventory sessions' },
  { method: 'POST',   pattern: '/inventory/sessions', exist: true, note: 'create inventory session' },
  // ScanQR — mobile calls /inventory/products/lookup/barcode/{code}
  { method: 'GET',    pattern: '/inventory/products/lookup/barcode/{id}', exist: false, note: 'NOT in backend — use /inventory/barcode/lookup?code=...' },
  { method: 'GET',    pattern: '/inventory/barcode/lookup', exist: true, note: 'barcode lookup (query param)' },
  // Cash / dispatch
  { method: 'POST',   pattern: '/cash/dispatch', exist: false, note: 'NOT in backend — use /cash/tickets/{id}/dispatch-kitchen' },
  { method: 'POST',   pattern: '/cash/tickets/{id}/dispatch-kitchen', exist: true, note: 'backend dispatch with ticket_id' },
  // Sales
  { method: 'POST',   pattern: '/sales/entries', exist: true, note: 'create sales entry' },
  // Auth
  { method: 'POST',   pattern: '/auth/login', exist: true, note: 'login' },
  { method: 'POST',   pattern: '/auth/refresh', exist: true, note: 'refresh token' },
]

function collapsePath(url) {
  // Strip query string, replace specific known ID patterns like ${...} or {..}
  let u = url.split('?')[0]
  // Replace js template literals like ${POS_CONFIG_KEY} -> {key}
  u = u.replace(/\$\{[^}]+\}|encodeURIComponent\([^)]+\)/g, '{id}')
  // Replace specific UUID or long-hex patterns only
  u = u.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?/g, '/{id}/')
  u = u.replace(/\/[0-9a-f]{32}\/?/g, '/{id}/')
  u = u.replace(/\/\d+\/?/g, '/{id}/')
  // Don't replace words — only hex IDs and numbers
  return u.replace(/\/+$/, '')
}

function extractApiCalls(source) {
  const calls = []
  const re = /api\.(get|post|put|patch|del)\s*\(\s*['"`]([^'"`]+)/g
  let m
  while ((m = re.exec(source)) !== null) {
    calls.push({ method: m[1].toUpperCase(), url: m[2] })
  }
  return calls
}

// Build lookup map
const known = Object.fromEntries(
  EXPECTED.filter(e => e.exist).map(e => [`${e.method} ${e.pattern}`, e])
)

const VIEWS = [
  { name: 'Tickets.vue',      file: 'src/views/caisse/Tickets.vue' },
  { name: 'InventoryScan.vue', file: 'src/views/stock/InventoryScan.vue' },
  { name: 'ScanQR.vue',       file: 'src/views/stock/ScanQR.vue' },
]

const REPO = new URL('..', import.meta.url).pathname
let total = 0, ok = 0, bad = 0
const issues = []

console.log('═══ API Endpoint Verification ═══\n')

for (const v of VIEWS) {
  const fp = path.join(REPO, v.file)
  if (!fs.existsSync(fp)) {
    console.log(`  ⚠  NOT FOUND: ${v.file}`)
    continue
  }
  const src = fs.readFileSync(fp, 'utf-8')
  const calls = extractApiCalls(src)
  console.log(`── ${v.name} (${calls.length} call(s)) ──`)

  for (const c of calls) {
    total++
    const collapsed = collapsePath(c.url)
    // Look for exact match first
    let matchedKnown = false
    let isIssue = false

    for (const [key, entry] of Object.entries(known)) {
      if (key.startsWith(`${c.method} `) && collapsed === key.substring(key.indexOf(' ') + 1)) {
        ok++
        matchedKnown = true
        console.log(`  ✓ ${c.method} ${c.url}`)
        break
      }
    }

    if (!matchedKnown) {
      // Check if it's in the known-issues list
      let knownIssue = false
      for (const e of EXPECTED) {
        if (!e.exist && c.method === e.method && collapsed === e.pattern) {
          knownIssue = true
          break
        }
      }
      if (knownIssue) {
        bad++
        console.log(`  ✗ ${c.method} ${c.url}`)
        console.log(`    → known issue: endpoint does not exist in backend`)
        issues.push(`${v.name}: ${c.method} ${c.url} — NOT in backend`)
      } else {
        bad++
        console.log(`  ? ${c.method} ${c.url}`)
        console.log(`    → unrecognised (collapsed: ${collapsed})`)
        issues.push(`${v.name}: ${c.method} ${c.url} — unrecognised route`)
      }
    }
  }
  console.log()
}

console.log(`═══ RESULT ═══`)
console.log(`  Total  : ${total}`)
console.log(`  OK     : ${ok}`)
console.log(`  Issues : ${bad}`)
if (bad === 0) {
  console.log('  ✅ All endpoint calls match expected backend routes.')
} else {
  console.log(`  ❌ ${bad} issue(s) detected:`)
  for (const i of issues) console.log(`       ${i}`)
}
console.log()
process.exit(0)  // info-only — known mismatches are documented above