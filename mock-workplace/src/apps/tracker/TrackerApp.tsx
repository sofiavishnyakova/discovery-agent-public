// AP Tracker: the team's shared spreadsheet of processed invoices.
import type { TrackerRow } from '../../data/types'
import { newId, update, useWorld } from '../../lib/store'
import { useTitle } from '../../lib/useTitle'

const COLS: { key: keyof TrackerRow; label: string; width: number }[] = [
  { key: 'date', label: 'Date', width: 100 },
  { key: 'supplier', label: 'Supplier', width: 240 },
  { key: 'invoiceNumber', label: 'Invoice no.', width: 140 },
  { key: 'amount', label: 'Amount (AED)', width: 120 },
  { key: 'ledgerRef', label: 'LedgerPoint ref', width: 140 },
  { key: 'status', label: 'Status', width: 150 },
  { key: 'notes', label: 'Notes', width: 260 },
]

const STATUSES = ['', 'Scheduled', 'Pending approval', 'Approved', 'On hold', 'Rejected', 'Query answered', 'Supplier onboarding']

const today = () => new Date().toLocaleDateString('en-GB')

export default function TrackerApp() {
  const w = useWorld()
  useTitle('AP Tracker – October 2026')

  const setCell = (id: string, key: keyof TrackerRow, value: string) =>
    update((d) => {
      const r = d.tracker.find((x) => x.id === id)
      if (r) r[key] = value
    })
  const addRow = () =>
    update((d) => {
      d.tracker.unshift({ id: newId('t'), date: today(), supplier: '', invoiceNumber: '', amount: '', ledgerRef: '', status: '', notes: '' })
    })
  const deleteRow = (id: string) => update((d) => { d.tracker = d.tracker.filter((r) => r.id !== id) })

  return (
    <div className="app tracker" data-app="tracker">
      <header className="tr-top">
        <div className="tr-logo">▦</div>
        <div>
          <div className="tr-title">AP Tracker – October 2026</div>
          <div className="tr-menu"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span>Data</span></div>
        </div>
        <div className="tr-share">Shared with Finance team</div>
      </header>
      <div className="tr-toolbar">
        <button className="btn" data-action="add-row" onClick={addRow}>+ Add row</button>
        <span className="muted">{w.tracker.length} rows · saved automatically</span>
      </div>
      <div className="tr-sheet" data-screen="tracker-sheet">
        <table>
          <thead>
            <tr>
              <th className="rownum" />
              {COLS.map((c, i) => <th key={c.key} style={{ width: c.width }}><span className="col-letter">{String.fromCharCode(65 + i)}</span>{c.label}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {w.tracker.map((r, i) => (
              <tr key={r.id} data-row-id={r.id}>
                <td className="rownum">{i + 1}</td>
                {COLS.map((c) => (
                  <td key={c.key}>
                    {c.key === 'status' ? (
                      <select value={r.status} data-field={`tracker-${c.key}`} data-row-id={r.id} onChange={(e) => setCell(r.id, c.key, e.target.value)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input value={r[c.key]} data-field={`tracker-${c.key}`} data-row-id={r.id} onChange={(e) => setCell(r.id, c.key, e.target.value)} />
                    )}
                  </td>
                ))}
                <td><button className="link" title="Delete row" data-action="delete-row" data-row-id={r.id} onClick={() => deleteRow(r.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
