// LedgerPoint: the accounting system (bills, approvals, suppliers).
import { useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { APPROVAL_LIMIT, CATEGORIES } from '../../data/company'
import type { Bill, Category } from '../../data/types'
import { aed, fmt, formatDate, parseAmount, round2 } from '../../lib/money'
import { approvalCodeFor } from '../../lib/replies'
import { getWorld, update, useWorld } from '../../lib/store'
import { useTitle } from '../../lib/useTitle'

export default function LedgerPointApp() {
  return (
    <div className="app ledger" data-app="ledgerpoint">
      <aside className="lp-side">
        <div className="lp-logo">LedgerPoint</div>
        <div className="lp-org">Meridian Advisory LLC</div>
        <NavLink to="/ledgerpoint/bills/new" className="lp-new" data-action="nav-new-bill">+ New bill</NavLink>
        <NavLink to="/ledgerpoint/bills" end data-action="nav-bills">Bills</NavLink>
        <NavLink to="/ledgerpoint/suppliers" end data-action="nav-suppliers">Suppliers</NavLink>
        <NavLink to="/ledgerpoint/suppliers/new" data-action="nav-new-supplier">New supplier request</NavLink>
        <div className="lp-side-foot">Signed in as AP Team</div>
      </aside>
      <main className="lp-main">
        <Routes>
          <Route path="bills/new" element={<NewBill />} />
          <Route path="bills/:ref" element={<BillDetail />} />
          <Route path="suppliers/new" element={<NewSupplier />} />
          <Route path="suppliers/:id" element={<SupplierDetail />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="*" element={<Bills />} />
        </Routes>
      </main>
    </div>
  )
}

const statusClass = (s: string) =>
  ({ Paid: 'green', Scheduled: 'blue', Approved: 'blue', 'Pending approval': 'amber', 'On hold': 'red', Active: 'green', 'Pending verification': 'amber' } as Record<string, string>)[s] ?? 'grey'

function Bills() {
  const w = useWorld()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  useTitle('Bills – LedgerPoint')
  const supName = (id: string) => w.suppliers.find((s) => s.id === id)?.name ?? id
  const rows = useMemo(() => {
    const n = q.toLowerCase().trim()
    return [...w.bills]
      .filter((b) => status === 'all' || b.status === status)
      .filter((b) => !n || `${b.ref} ${b.invoiceNumber} ${supName(b.supplierId)} ${b.poNumber}`.toLowerCase().includes(n))
      .sort((a, b) => b.ref.localeCompare(a.ref))
  }, [w.bills, w.suppliers, q, status])
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v && v !== 'all') next.set(k, v)
    else next.delete(k)
    setParams(next)
  }
  return (
    <div data-screen="bills-list">
      <h1>Bills</h1>
      <div className="lp-filters">
        <input placeholder="Search LP ref, invoice number, supplier or PO" value={q} data-field="bill-search" onChange={(e) => set('q', e.target.value)} />
        <select value={status} data-field="bill-status-filter" onChange={(e) => set('status', e.target.value)}>
          {['all', 'Pending approval', 'Approved', 'Scheduled', 'Paid', 'On hold'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
      </div>
      <table className="grid">
        <thead><tr><th>Reference</th><th>Supplier</th><th>Invoice no.</th><th>Invoice date</th><th className="num">Total (AED)</th><th>Status</th><th>Payment date</th></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.ref} data-bill-ref={b.ref}>
              <td><Link to={`/ledgerpoint/bills/${b.ref}`} data-action="open-bill" data-bill-ref={b.ref}>{b.ref}</Link></td>
              <td>{supName(b.supplierId)}</td><td>{b.invoiceNumber}</td><td>{formatDate(b.invoiceDate)}</td>
              <td className="num">{fmt(b.total)}</td>
              <td><span className={`pill ${statusClass(b.status)}`}>{b.status}</span></td>
              <td>{b.paymentDate ? formatDate(b.paymentDate) : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No bills match “{q}”.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

type Form = {
  supplierId: string; invoiceNumber: string; invoiceDate: string; dueDate: string; poNumber: string
  net: string; vat: string; category: string; attachment: string; notes: string
}
const EMPTY: Form = { supplierId: '', invoiceNumber: '', invoiceDate: '', dueDate: '', poNumber: '', net: '', vat: '', category: '', attachment: '', notes: '' }

function NewBill() {
  const w = useWorld()
  const navigate = useNavigate()
  const [f, setF] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [banner, setBanner] = useState('')
  const [vatConfirm, setVatConfirm] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  useTitle('New bill – LedgerPoint')

  const active = w.suppliers.filter((s) => s.status === 'Active')
  const net = parseAmount(f.net)
  const vat = parseAmount(f.vat)
  const total = !isNaN(net) && !isNaN(vat) ? round2(net + vat) : NaN

  const set = (k: keyof Form, v: string) => {
    setF((prev) => {
      const next = { ...prev, [k]: v }
      if (k === 'supplierId' && !prev.category) next.category = w.suppliers.find((s) => s.id === v)?.defaultCategory ?? ''
      return next
    })
    setErrors((e) => ({ ...e, [k]: undefined }))
    setBanner('')
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {}
    if (!f.supplierId) e.supplierId = 'Select a supplier'
    if (!f.invoiceNumber.trim()) e.invoiceNumber = 'Required'
    if (!f.invoiceDate) e.invoiceDate = 'Required'
    if (!f.dueDate) e.dueDate = 'Required'
    else if (f.invoiceDate && f.dueDate < f.invoiceDate) e.dueDate = 'Due date is before the invoice date'
    const po = w.pos.find((p) => p.number === f.poNumber.trim().toUpperCase())
    if (!f.poNumber.trim()) e.poNumber = 'PO number is required for all bills'
    else if (!po) e.poNumber = `${f.poNumber.trim()} was not found in ProcureHub`
    else if (po.status === 'Closed') e.poNumber = `${po.number} is closed`
    else {
      const sup = w.suppliers.find((s) => s.id === f.supplierId)
      if (sup && po.supplierName !== sup.name) e.poNumber = `${po.number} belongs to ${po.supplierName}`
    }
    if (isNaN(net) || net <= 0) e.net = 'Enter a valid amount, e.g. 12400.00'
    if (isNaN(vat) || vat < 0) e.vat = 'Enter a valid amount, e.g. 620.00'
    if (!f.category) e.category = 'Select a category'
    if (!f.attachment) e.attachment = 'Attach the invoice'
    setErrors(e)
    if (Object.keys(e).length) return false
    const dup = w.bills.find((b) => b.supplierId === f.supplierId && b.invoiceNumber.toUpperCase() === f.invoiceNumber.trim().toUpperCase())
    if (dup) {
      setBanner(`Duplicate invoice: ${f.invoiceNumber.trim()} from this supplier is already recorded as ${dup.ref} (${dup.status}${dup.paymentDate ? `, payment ${formatDate(dup.paymentDate)}` : ''}).`)
      return false
    }
    return true
  }

  const submit = (skipVat = false) => {
    if (!validate()) return
    const expected = round2(net * 0.05)
    if (!skipVat && Math.abs(expected - vat) > 0.5) {
      setVatConfirm(`VAT entered (${fmt(vat)}) is not 5% of the net amount. Expected ${fmt(expected)}.`)
      return
    }
    setVatConfirm(null)
    let ref = ''
    update((d) => {
      const seq = d.nextBillSeq++
      ref = `LP-2026-0${seq}`
      const needsApproval = total > APPROVAL_LIMIT
      const bill: Bill = {
        ref, supplierId: f.supplierId, invoiceNumber: f.invoiceNumber.trim(), invoiceDate: f.invoiceDate, dueDate: f.dueDate,
        poNumber: f.poNumber.trim().toUpperCase(), net: round2(net), vat: round2(vat), total, category: f.category as Category,
        status: needsApproval ? 'Pending approval' : 'Scheduled', paymentDate: needsApproval ? undefined : f.dueDate,
        attachment: f.attachment, notes: f.notes || undefined, createdAt: new Date().toISOString().slice(0, 10), createdBy: 'AP Team',
        approvalCode: needsApproval ? approvalCodeFor(seq) : undefined,
      }
      d.bills.push(bill)
    })
    navigate(`/ledgerpoint/bills/${ref}?created=1`)
  }

  const err = (k: keyof Form) => errors[k] && <div className="field-error">{errors[k]}</div>
  return (
    <div data-screen="new-bill">
      <h1>New bill</h1>
      {banner && <div className="banner error" data-field="duplicate-error">{banner}</div>}
      <div className="lp-form">
        <label className="span2">Supplier
          <select value={f.supplierId} data-field="supplier" onChange={(e) => set('supplierId', e.target.value)}>
            <option value="">— Select supplier —</option>
            {active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="hint">Can't find the supplier? Submit a <Link to="/ledgerpoint/suppliers/new">new supplier request</Link>.</div>
          {err('supplierId')}
        </label>
        <label>Invoice number<input value={f.invoiceNumber} data-field="invoice-number" onChange={(e) => set('invoiceNumber', e.target.value)} />{err('invoiceNumber')}</label>
        <label>PO number<input value={f.poNumber} data-field="po-number" placeholder="PO-2026-0000" onChange={(e) => set('poNumber', e.target.value)} />{err('poNumber')}</label>
        <label>Invoice date<input type="date" value={f.invoiceDate} data-field="invoice-date" onChange={(e) => set('invoiceDate', e.target.value)} />{err('invoiceDate')}</label>
        <label>Due date<input type="date" value={f.dueDate} data-field="due-date" onChange={(e) => set('dueDate', e.target.value)} />{err('dueDate')}</label>
        <label>Amount excl. VAT (AED)<input value={f.net} data-field="net" inputMode="decimal" onChange={(e) => set('net', e.target.value)} />{err('net')}</label>
        <label>VAT (AED)<input value={f.vat} data-field="vat" inputMode="decimal" onChange={(e) => set('vat', e.target.value)} />{err('vat')}</label>
        <label>Total (AED)<input value={isNaN(total) ? '' : fmt(total)} readOnly className="readonly" data-field="total" /></label>
        <label>Cost category
          <select value={f.category} data-field="category" onChange={(e) => set('category', e.target.value)}>
            <option value="">— Select —</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>{err('category')}
        </label>
        <div className="span2 attach-row">
          <div className="label-text">Invoice attachment</div>
          {f.attachment
            ? <div className="attached">📄 {f.attachment} <button className="link" data-action="remove-attachment" onClick={() => set('attachment', '')}>remove</button></div>
            : <button className="btn" data-action="open-attach-dialog" onClick={() => setPicker(true)}>Attach file…</button>}
          {err('attachment')}
        </div>
        <label className="span2">Notes (optional)<textarea rows={2} value={f.notes} data-field="notes" onChange={(e) => set('notes', e.target.value)} /></label>
      </div>
      {!isNaN(total) && total > APPROVAL_LIMIT && <div className="banner info">Total is over AED {fmt(APPROVAL_LIMIT)} — this bill will need Finance Manager approval.</div>}
      <div className="lp-actions">
        <button className="btn primary" data-action="submit-bill" onClick={() => submit()}>Submit bill</button>
        <button className="btn" data-action="clear-bill" onClick={() => { setF(EMPTY); setErrors({}); setBanner('') }}>Clear</button>
      </div>

      {picker && <FilePicker onPick={(name) => { set('attachment', name); setPicker(false) }} onClose={() => setPicker(false)} />}
      {vatConfirm && (
        <div className="modal-back">
          <div className="modal" data-screen="vat-warning">
            <h3>⚠ VAT check</h3>
            <p>{vatConfirm}</p>
            <div className="lp-actions">
              <button className="btn primary" data-action="vat-go-back" onClick={() => setVatConfirm(null)}>Go back and fix</button>
              <button className="btn" data-action="vat-submit-anyway" onClick={() => submit(true)}>Submit anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilePicker({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const w = getWorld()
  const files = w.downloads.map((id) => w.docs.find((d) => d.id === id)).filter(Boolean)
  return (
    <div className="modal-back">
      <div className="modal filepicker" data-screen="file-picker">
        <h3>Choose a file — Downloads</h3>
        {files.length === 0 && <p className="muted">Your Downloads folder is empty. Download the invoice from Meridian Mail first.</p>}
        <ul>
          {files.map((d) => (
            <li key={d!.id}><button className="file" data-action="pick-file" data-doc-id={d!.id} onClick={() => onPick(d!.filename)}>📄 {d!.filename}</button></li>
          ))}
        </ul>
        <div className="lp-actions"><button className="btn" data-action="close-attach-dialog" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}

function BillDetail() {
  const { ref } = useParams()
  const [params] = useSearchParams()
  const w = useWorld()
  const navigate = useNavigate()
  const bill = w.bills.find((b) => b.ref === ref)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [holdNote, setHoldNote] = useState('')
  useTitle(`${ref} – LedgerPoint`)
  if (!bill) return <div><p>Bill {ref} not found.</p><Link to="/ledgerpoint/bills">← Bills</Link></div>
  const sup = w.suppliers.find((s) => s.id === bill.supplierId)

  const approve = () => {
    if (code.trim().toUpperCase() !== bill.approvalCode) return setCodeError('Approval code is not valid for this bill.')
    update((d) => {
      const b = d.bills.find((x) => x.ref === bill.ref)!
      b.status = 'Scheduled'
      b.paymentDate = b.dueDate
    })
    setCode('')
    setCodeError('')
  }
  const hold = () =>
    update((d) => {
      const b = d.bills.find((x) => x.ref === bill.ref)!
      b.status = 'On hold'
      b.paymentDate = undefined
      b.notes = [b.notes, holdNote].filter(Boolean).join(' · ')
    })

  return (
    <div data-screen="bill-detail" data-bill-ref={bill.ref}>
      {params.get('created') && (
        <div className="banner success" data-field="bill-created">
          Bill <strong>{bill.ref}</strong> created · status <strong>{bill.status}</strong>
          <button className="btn" data-action="create-another" onClick={() => navigate('/ledgerpoint/bills/new')}>Create another</button>
        </div>
      )}
      <Link to="/ledgerpoint/bills">← Bills</Link>
      <div className="lp-detail-head">
        <h1 data-field="bill-ref">{bill.ref}</h1>
        <span className={`pill ${statusClass(bill.status)}`} data-field="bill-status">{bill.status}</span>
      </div>
      <dl className="lp-dl">
        <dt>Supplier</dt><dd>{sup?.name}</dd>
        <dt>Invoice number</dt><dd>{bill.invoiceNumber}</dd>
        <dt>Invoice date</dt><dd>{formatDate(bill.invoiceDate)}</dd>
        <dt>Due date</dt><dd>{formatDate(bill.dueDate)}</dd>
        <dt>PO number</dt><dd>{bill.poNumber}</dd>
        <dt>Category</dt><dd>{bill.category}</dd>
        <dt>Net</dt><dd>{aed(bill.net)}</dd>
        <dt>VAT</dt><dd>{aed(bill.vat)}</dd>
        <dt>Total</dt><dd><strong>{aed(bill.total)}</strong></dd>
        <dt>Payment date</dt><dd>{bill.paymentDate ? formatDate(bill.paymentDate) : '—'}</dd>
        <dt>Attachment</dt><dd>{bill.attachment ?? '—'}</dd>
        <dt>Notes</dt><dd>{bill.notes ?? '—'}</dd>
        <dt>Created</dt><dd>{formatDate(bill.createdAt)} by {bill.createdBy}</dd>
      </dl>
      {bill.status === 'Pending approval' && (
        <div className="lp-box" data-screen="approval-box">
          <h3>Finance Manager approval required</h3>
          <p className="muted">Ask Rania Haddad for the approval code for {bill.ref}, then enter it here.</p>
          <div className="row">
            <input placeholder="APR-0000" value={code} data-field="approval-code" onChange={(e) => { setCode(e.target.value); setCodeError('') }} onKeyDown={(e) => e.key === 'Enter' && approve()} />
            <button className="btn primary" data-action="submit-approval-code" onClick={approve}>Approve</button>
          </div>
          {codeError && <div className="field-error">{codeError}</div>}
        </div>
      )}
      {bill.status !== 'Paid' && bill.status !== 'On hold' && (
        <div className="lp-box">
          <h3>Put on hold</h3>
          <div className="row">
            <input placeholder="Reason" value={holdNote} data-field="hold-reason" onChange={(e) => setHoldNote(e.target.value)} />
            <button className="btn" data-action="put-on-hold" onClick={hold}>Put on hold</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Suppliers() {
  const w = useWorld()
  const [q, setQ] = useState('')
  useTitle('Suppliers – LedgerPoint')
  const rows = w.suppliers.filter((s) => `${s.name} ${s.trn} ${s.email}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div data-screen="suppliers-list">
      <h1>Suppliers</h1>
      <div className="lp-filters">
        <input placeholder="Search supplier name, TRN or email" value={q} data-field="supplier-search" onChange={(e) => setQ(e.target.value)} />
        <Link className="btn" to="/ledgerpoint/suppliers/new" data-action="new-supplier-request">New supplier request</Link>
      </div>
      <table className="grid">
        <thead><tr><th>ID</th><th>Name</th><th>TRN</th><th>Terms</th><th>Default category</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td><Link to={`/ledgerpoint/suppliers/${s.id}`} data-action="open-supplier" data-supplier-id={s.id}>{s.id}</Link></td>
              <td>{s.name}</td><td>{s.trn}</td><td>{s.paymentTermsDays} days</td><td>{s.defaultCategory}</td>
              <td><span className={`pill ${statusClass(s.status)}`}>{s.status}</span></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No suppliers match “{q}”. Submit a new supplier request if they need to be set up.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function SupplierDetail() {
  const { id } = useParams()
  const w = useWorld()
  const s = w.suppliers.find((x) => x.id === id)
  useTitle(`${s?.name ?? id} – LedgerPoint`)
  if (!s) return <div><p>Supplier not found.</p><Link to="/ledgerpoint/suppliers">← Suppliers</Link></div>
  const bills = w.bills.filter((b) => b.supplierId === s.id)
  return (
    <div data-screen="supplier-detail" data-supplier-id={s.id}>
      <Link to="/ledgerpoint/suppliers">← Suppliers</Link>
      <div className="lp-detail-head"><h1>{s.name}</h1><span className={`pill ${statusClass(s.status)}`}>{s.status}</span></div>
      <dl className="lp-dl">
        <dt>Supplier ID</dt><dd>{s.id}</dd><dt>TRN</dt><dd>{s.trn}</dd><dt>Email</dt><dd>{s.email}</dd>
        <dt>Address</dt><dd>{s.address}</dd><dt>IBAN</dt><dd>{s.iban}</dd>
        <dt>Payment terms</dt><dd>{s.paymentTermsDays} days</dd><dt>Default category</dt><dd>{s.defaultCategory}</dd>
        {s.tradeLicense && <><dt>Trade licence</dt><dd>{s.tradeLicense}</dd></>}
      </dl>
      <h2>Bills</h2>
      <table className="grid">
        <thead><tr><th>Ref</th><th>Invoice no.</th><th className="num">Total</th><th>Status</th></tr></thead>
        <tbody>
          {bills.map((b) => <tr key={b.ref}><td><Link to={`/ledgerpoint/bills/${b.ref}`}>{b.ref}</Link></td><td>{b.invoiceNumber}</td><td className="num">{fmt(b.total)}</td><td>{b.status}</td></tr>)}
          {bills.length === 0 && <tr><td colSpan={4} className="muted">No bills yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function NewSupplier() {
  const w = useWorld()
  const navigate = useNavigate()
  const [f, setF] = useState({ name: '', tradeLicense: '', trn: '', address: '', email: '', contactName: '', iban: '', category: '' })
  const [docs, setDocs] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  useTitle('New supplier request – LedgerPoint')
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setErrors({ ...errors, [k]: '' }) }
  const downloaded = w.downloads.map((id) => w.docs.find((d) => d.id === id)).filter((d) => d && d.kind !== 'invoice')

  const submit = () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Required'
    if (!f.tradeLicense.trim()) e.tradeLicense = 'Required'
    if (!/^\d{15}$/.test(f.trn.replace(/\s/g, ''))) e.trn = 'TRN must be 15 digits'
    if (!f.address.trim()) e.address = 'Required'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = 'Enter a valid email'
    if (!/^AE\d{21}$/.test(f.iban.replace(/\s/g, '').toUpperCase())) e.iban = 'UAE IBAN must be AE + 21 digits'
    if (!f.category) e.category = 'Select a category'
    if (docs.length < 3) e.docs = 'Attach the trade licence, VAT certificate and bank letter'
    if (w.suppliers.some((s) => s.name.toLowerCase() === f.name.trim().toLowerCase())) e.name = 'A supplier with this name already exists'
    setErrors(e)
    if (Object.values(e).some(Boolean)) return
    let id = ''
    update((d) => {
      id = `SUP-${String(d.suppliers.length + 1).padStart(3, '0')}`
      d.suppliers.push({
        id, name: f.name.trim(), email: f.email.trim(), trn: f.trn.replace(/\s/g, ''), address: f.address.trim(),
        paymentTermsDays: 30, defaultCategory: f.category as Category, iban: f.iban.toUpperCase(),
        status: 'Pending verification', tradeLicense: f.tradeLicense.trim(), contactName: f.contactName.trim() || undefined,
      })
    })
    navigate(`/ledgerpoint/suppliers/${id}`)
  }
  const err = (k: string) => errors[k] && <div className="field-error">{errors[k]}</div>
  return (
    <div data-screen="new-supplier">
      <h1>New supplier request</h1>
      <p className="muted">Requests are verified by Finance before the supplier can be used on bills (1–2 working days).</p>
      <div className="lp-form">
        <label className="span2">Legal name (as on trade licence)<input value={f.name} data-field="supplier-name" onChange={(e) => set('name', e.target.value)} />{err('name')}</label>
        <label>Trade licence number<input value={f.tradeLicense} data-field="trade-license" onChange={(e) => set('tradeLicense', e.target.value)} />{err('tradeLicense')}</label>
        <label>TRN (15 digits)<input value={f.trn} data-field="trn" onChange={(e) => set('trn', e.target.value)} />{err('trn')}</label>
        <label className="span2">Registered address<input value={f.address} data-field="address" onChange={(e) => set('address', e.target.value)} />{err('address')}</label>
        <label>Contact name<input value={f.contactName} data-field="contact-name" onChange={(e) => set('contactName', e.target.value)} /></label>
        <label>Billing email<input value={f.email} data-field="supplier-email" onChange={(e) => set('email', e.target.value)} />{err('email')}</label>
        <label>IBAN<input value={f.iban} data-field="iban" placeholder="AE00 0000 0000 0000 0000 000" onChange={(e) => set('iban', e.target.value)} />{err('iban')}</label>
        <label>Default cost category
          <select value={f.category} data-field="supplier-category" onChange={(e) => set('category', e.target.value)}>
            <option value="">— Select —</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>{err('category')}
        </label>
        <div className="span2">
          <div className="label-text">Supporting documents (from Downloads)</div>
          {downloaded.length === 0 && <div className="muted">No company documents downloaded yet.</div>}
          {downloaded.map((d) => (
            <label key={d!.id} className="check">
              <input type="checkbox" checked={docs.includes(d!.id)} data-field="supplier-doc" data-doc-id={d!.id}
                onChange={(e) => setDocs(e.target.checked ? [...docs, d!.id] : docs.filter((x) => x !== d!.id))} />
              {d!.filename}
            </label>
          ))}
          {err('docs')}
        </div>
      </div>
      <div className="lp-actions"><button className="btn primary" data-action="submit-supplier-request" onClick={submit}>Submit request</button></div>
    </div>
  )
}
