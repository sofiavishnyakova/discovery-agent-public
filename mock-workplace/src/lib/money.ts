import type { InvoiceDoc } from '../data/types'

export const round2 = (n: number) => Math.round(n * 100) / 100

export function invoiceTotals(doc: InvoiceDoc) {
  const net = round2(doc.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))
  const vat = doc.vatOverride ?? round2(net * 0.05)
  return { net, vat, total: round2(net + vat) }
}

export const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const aed = (n: number) => `AED ${fmt(n)}`

/** Parses user-typed amounts like "12,400.50" or "AED 12400". Returns NaN if invalid. */
export function parseAmount(s: string): number {
  const cleaned = s.replace(/aed/i, '').replace(/,/g, '').trim()
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN
  return Number(cleaned)
}

export function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
