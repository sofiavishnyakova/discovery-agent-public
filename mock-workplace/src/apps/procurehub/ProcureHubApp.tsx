// ProcureHub: purchase order lookup. Invoiced-to-date is live from LedgerPoint bills.
import { useMemo } from 'react'
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import type { Bill, PurchaseOrder } from '../../data/types'
import { aed, fmt, formatDate, round2 } from '../../lib/money'
import { useWorld } from '../../lib/store'
import { useTitle } from '../../lib/useTitle'

export function poUsage(po: PurchaseOrder, bills: Bill[]) {
  const linked = bills.filter((b) => b.poNumber === po.number)
  const invoiced = round2(linked.reduce((s, b) => s + b.net, 0))
  return { linked, invoiced, remaining: round2(po.approvedNet - invoiced) }
}

export default function ProcureHubApp() {
  return (
    <div className="app procure" data-app="procurehub">
      <header className="ph-top">
        <Link to="/procurehub" className="ph-logo">◆ ProcureHub</Link>
        <nav><Link to="/procurehub">Purchase orders</Link><span className="ph-disabled">Requisitions</span><span className="ph-disabled">Reports</span></nav>
        <div className="ph-user">AP Team · Read only</div>
      </header>
      <Routes>
        <Route path="po/:number" element={<PoDetail />} />
        <Route path="*" element={<PoList />} />
      </Routes>
    </div>
  )
}

function PoList() {
  const w = useWorld()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  useTitle('Purchase orders – ProcureHub')
  const rows = useMemo(() => {
    const needle = q.toLowerCase().trim()
    return w.pos
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => !needle || `${p.number} ${p.supplierName} ${p.description}`.toLowerCase().includes(needle))
      .sort((a, b) => b.number.localeCompare(a.number))
  }, [w.pos, q, status])

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setParams(next)
  }

  return (
    <main className="ph-main" data-screen="po-list">
      <h1>Purchase orders</h1>
      <div className="ph-filters">
        <input placeholder="Search by PO number, supplier or description" value={q} data-field="po-search" onChange={(e) => set('q', e.target.value)} />
        <select value={status} data-field="po-status-filter" onChange={(e) => set('status', e.target.value)}>
          <option value="all">All statuses</option><option value="Open">Open</option><option value="Closed">Closed</option>
        </select>
      </div>
      <table className="grid">
        <thead><tr><th>PO number</th><th>Supplier</th><th>Description</th><th>Status</th><th className="num">Approved (net)</th><th className="num">Remaining</th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const { remaining } = poUsage(p, w.bills)
            return (
              <tr key={p.number} data-po={p.number}>
                <td><Link to={`/procurehub/po/${p.number}`} data-action="open-po" data-po={p.number}>{p.number}</Link></td>
                <td>{p.supplierName}</td><td>{p.description}</td>
                <td><span className={`pill ${p.status === 'Open' ? 'green' : 'grey'}`}>{p.status}</span></td>
                <td className="num">{fmt(p.approvedNet)}</td>
                <td className={`num ${remaining < 0 ? 'neg' : ''}`}>{fmt(remaining)}</td>
              </tr>
            )
          })}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No purchase orders match “{q}”.</td></tr>}
        </tbody>
      </table>
    </main>
  )
}

function PoDetail() {
  const { number } = useParams()
  const w = useWorld()
  const po = w.pos.find((p) => p.number === number)
  useTitle(`${number} – ProcureHub`)
  if (!po) return <main className="ph-main"><p>PO {number} not found.</p><Link to="/procurehub">← Back</Link></main>
  const { linked, invoiced, remaining } = poUsage(po, w.bills)
  const pct = Math.min(100, (invoiced / po.approvedNet) * 100)
  return (
    <main className="ph-main" data-screen="po-detail" data-po={po.number}>
      <Link to="/procurehub" data-action="back-to-po-list">← Purchase orders</Link>
      <div className="ph-detail-head">
        <h1>{po.number}</h1>
        <span className={`pill ${po.status === 'Open' ? 'green' : 'grey'}`}>{po.status}</span>
      </div>
      <div className="ph-cards">
        <div className="card"><div className="label">Supplier</div><div className="value">{po.supplierName}</div></div>
        <div className="card"><div className="label">Approved (net)</div><div className="value" data-field="po-approved">{aed(po.approvedNet)}</div></div>
        <div className="card"><div className="label">Invoiced to date (net)</div><div className="value" data-field="po-invoiced">{aed(invoiced)}</div></div>
        <div className={`card ${remaining < 0 ? 'warn' : ''}`}><div className="label">Remaining (net)</div><div className="value" data-field="po-remaining">{aed(remaining)}</div></div>
      </div>
      <div className="ph-bar"><div style={{ width: `${pct}%` }} /></div>
      <dl className="ph-dl">
        <dt>Description</dt><dd>{po.description}</dd>
        <dt>Budget owner</dt><dd>{po.budgetOwner}</dd>
        <dt>Cost centre</dt><dd>{po.costCentre}</dd>
        <dt>Raised on</dt><dd>{formatDate(po.raisedOn)}</dd>
      </dl>
      <h2>Order lines</h2>
      <table className="grid">
        <thead><tr><th>Line</th><th className="num">Amount (net)</th></tr></thead>
        <tbody>{po.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td className="num">{fmt(l.amount)}</td></tr>)}</tbody>
      </table>
      <h2>Invoices booked against this PO</h2>
      <table className="grid">
        <thead><tr><th>LedgerPoint ref</th><th>Invoice no.</th><th>Status</th><th className="num">Net</th></tr></thead>
        <tbody>
          {linked.map((b) => <tr key={b.ref}><td>{b.ref}</td><td>{b.invoiceNumber}</td><td>{b.status}</td><td className="num">{fmt(b.net)}</td></tr>)}
          {linked.length === 0 && <tr><td colSpan={4} className="muted">No invoices yet.</td></tr>}
        </tbody>
      </table>
    </main>
  )
}
