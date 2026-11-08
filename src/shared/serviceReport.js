/**
 * Rapport de fin de service
 *
 * Endpoint : GET /mobile/service-report?date=YYYY-MM-DD (contrat demandé au
 * mobile, PAS ENCORE dans le backend au 2026-11-08). La réponse est normalisée
 * en acceptant les variantes de noms de champs courantes du backend.
 */
import api from './api'
import { toNumber, round2, unwrap } from './serviceOrders'
import { createPdf } from './pdf'

export const PAYMENT_METHODS = [
  { key: 'cash',         labelKey: 'service.report.payments.cash',        aliases: ['cash', 'especes', 'espèces', 'liquide'] },
  { key: 'card',         labelKey: 'service.report.payments.card',        aliases: ['card', 'cb', 'carte', 'credit_card', 'bank_card', 'carte_bancaire'] },
  { key: 'meal_voucher', labelKey: 'service.report.payments.mealVoucher', aliases: ['meal_voucher', 'ticket_resto', 'ticket_restaurant', 'titre_restaurant', 'tr'] },
  { key: 'amex',         labelKey: 'service.report.payments.amex',        aliases: ['amex', 'american_express'] },
]
const OTHER = { key: 'other', labelKey: 'service.report.payments.other' }

const TOP_LIMIT = 5

/** Date locale du jour au format YYYY-MM-DD (pas toISOString : UTC). */
export function localIsoDate(d = new Date()) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function pick(obj, keys) {
  for (const k of keys) if (obj?.[k] != null) return obj[k]
  return undefined
}

function methodKey(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  return PAYMENT_METHODS.find(m => m.aliases.includes(s))?.key || 'other'
}

/** { cash: 120 } ou [{ method: 'cb', amount: 80 }] → montants par moyen de paiement */
export function normalizePayments(raw) {
  const totals = Object.fromEntries([...PAYMENT_METHODS, OTHER].map(m => [m.key, 0]))
  const entries = Array.isArray(raw)
    ? raw.map(p => [pick(p, ['method', 'payment_method', 'type', 'code', 'key']), pick(p, ['amount', 'total', 'value'])])
    : Object.entries(raw || {})
  for (const [method, amount] of entries) {
    const v = typeof amount === 'object' && amount ? pick(amount, ['amount', 'total']) : amount
    totals[methodKey(method)] = round2(totals[methodKey(method)] + toNumber(v))
  }
  return totals
}

export function normalizeTopItems(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(i => ({
      name: pick(i, ['name', 'product_name', 'label', 'item_name']) || '—',
      quantity: toNumber(pick(i, ['quantity', 'qty', 'count', 'sold'])),
      amount: round2(pick(i, ['amount', 'revenue', 'total', 'total_ttc'])),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.amount - a.amount)
    .slice(0, TOP_LIMIT)
}

export function normalizeReport(raw, date) {
  const d = raw || {}
  const revenue = round2(pick(d, ['total_revenue', 'revenue', 'ca', 'total_ttc', 'total']))
  const covers = toNumber(pick(d, ['covers', 'nb_covers', 'covers_count', 'couverts']))
  const tickets = toNumber(pick(d, ['tickets_count', 'nb_tickets', 'ticket_count', 'tickets']))
  const tables = toNumber(pick(d, ['tables_count', 'nb_tables', 'table_count', 'tables']))
  return {
    date: d.date || date,
    revenue,
    covers,
    tickets,
    tables,
    averageTicket: tickets ? round2(revenue / tickets) : 0,
    averageCover: covers ? round2(revenue / covers) : 0,
    payments: normalizePayments(pick(d, ['payments', 'payment_breakdown', 'payment_methods', 'by_payment_method'])),
    topItems: normalizeTopItems(pick(d, ['top_items', 'top_products', 'best_sellers'])),
  }
}

export async function fetchServiceReport(date = localIsoDate()) {
  const res = await api.get(`/mobile/service-report?date=${encodeURIComponent(date)}`)
  return normalizeReport(unwrap(res), date)
}

/**
 * Lignes de répartition des paiements avec part du total encaissé.
 * « Autre » n'apparaît que s'il est non nul.
 */
export function paymentRows(report) {
  const methods = report.payments.other ? [...PAYMENT_METHODS, OTHER] : PAYMENT_METHODS
  const total = methods.reduce((s, m) => s + report.payments[m.key], 0)
  return methods.map(m => ({
    key: m.key,
    labelKey: m.labelKey,
    amount: report.payments[m.key],
    share: total ? report.payments[m.key] / total : 0,
  }))
}

/** Texte brut du rapport (partage, presse-papiers). fmt(n) formate un montant. */
export function reportText(report, { t, fmt, dateLabel = report.date, establishment = '' }) {
  const lines = [
    t('service.report.shareTitle', { date: dateLabel }) + (establishment ? ` — ${establishment}` : ''),
    '',
    `${t('service.report.kpi.revenue')} : ${fmt(report.revenue)}`,
    `${t('service.report.kpi.covers')} : ${report.covers}`,
    `${t('service.report.kpi.tickets')} : ${report.tickets}`,
    `${t('service.report.kpi.tables')} : ${report.tables}`,
    `${t('service.report.kpi.averageTicket')} : ${fmt(report.averageTicket)}`,
    '',
    t('service.report.paymentsTitle'),
    ...paymentRows(report).map(r => `• ${t(r.labelKey)} : ${fmt(r.amount)} (${Math.round(r.share * 100)} %)`),
  ]
  if (report.topItems.length) {
    lines.push('', t('service.report.topTitle'))
    report.topItems.forEach((it, i) => lines.push(`${i + 1}. ${it.name} × ${it.quantity} — ${fmt(it.amount)}`))
  }
  return lines.join('\n')
}

export function reportFileName(date) {
  return `rapport-service-${date}.pdf`
}

export function buildReportPdf(report, { t, fmt, dateLabel = report.date, establishment = '', generatedAt = '' }) {
  const doc = createPdf()
  doc.text(t('service.report.title'), { size: 20, bold: true, gap: 4 })
  doc.text([dateLabel, establishment].filter(Boolean).join(' — '), { size: 12, gray: 0.35 })
  doc.rule()
  doc.row(t('service.report.kpi.revenue'), fmt(report.revenue), { size: 14, bold: true, gap: 10 })
  doc.row(t('service.report.kpi.covers'), String(report.covers))
  doc.row(t('service.report.kpi.tickets'), String(report.tickets))
  doc.row(t('service.report.kpi.tables'), String(report.tables))
  doc.row(t('service.report.kpi.averageTicket'), fmt(report.averageTicket))
  doc.row(t('service.report.kpi.averageCover'), fmt(report.averageCover))
  doc.rule()
  doc.text(t('service.report.paymentsTitle'), { size: 14, bold: true, gap: 10 })
  for (const r of paymentRows(report)) {
    doc.row(t(r.labelKey), `${fmt(r.amount)}  (${Math.round(r.share * 100)} %)`, { gap: 4 })
    doc.bar(r.share)
  }
  doc.rule()
  doc.text(t('service.report.topTitle'), { size: 14, bold: true, gap: 10 })
  if (!report.topItems.length) doc.text(t('service.report.noSales'), { gray: 0.4 })
  report.topItems.forEach((it, i) => doc.row(`${i + 1}. ${it.name}`, `× ${it.quantity}   ${fmt(it.amount)}`))
  if (generatedAt) {
    doc.space(20)
    doc.text(t('service.report.generatedAt', { date: generatedAt }), { size: 9, gray: 0.5 })
  }
  return doc.toBlob()
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Partage le PDF (Web Share niveau 2) si possible, sinon le texte, sinon
 * télécharge le PDF. Renvoie 'shared-file' | 'shared-text' | 'downloaded' | 'cancelled'.
 */
export async function shareReport({ blob, fileName, title, text }) {
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  try {
    if (nav.share && typeof File !== 'undefined') {
      const file = new File([blob], fileName, { type: 'application/pdf' })
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title, text })
        return 'shared-file'
      }
    }
    if (nav.share) {
      await nav.share({ title, text })
      return 'shared-text'
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled'
    // Partage refusé par le navigateur : repli sur le téléchargement
  }
  download(blob, fileName)
  return 'downloaded'
}

export function downloadReport(blob, fileName) {
  download(blob, fileName)
}
