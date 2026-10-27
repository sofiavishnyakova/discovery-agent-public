// Session launcher: pick a persona, reset the world, open the four apps in their own tabs.
import { useState } from 'react'
import { DEFAULT_REPLY_DELAY_MS, FAST_REPLY_DELAY_MS, WORLD_TODAY_LABEL } from '../../data/company'
import { EXISTING_BILLS } from '../../data/masterData'
import { ANSWER_KEY, AP_PROCEDURE, PERSONAS } from '../../data/personas'
import { resetWorld, useWorld } from '../../lib/store'
import { useTitle } from '../../lib/useTitle'

const APPS = [
  { path: '/mail/inbox', name: 'Meridian Mail', desc: 'AP shared inbox', cls: 'mail' },
  { path: '/ledgerpoint/bills', name: 'LedgerPoint', desc: 'Accounting: bills, approvals, suppliers', cls: 'ledger' },
  { path: '/procurehub', name: 'ProcureHub', desc: 'Purchase orders', cls: 'procure' },
  { path: '/tracker', name: 'AP Tracker', desc: 'Team spreadsheet', cls: 'tracker' },
]

export default function Launcher() {
  const w = useWorld()
  const [persona, setPersona] = useState(w.persona)
  const [fast, setFast] = useState(w.replyDelayMs === FAST_REPLY_DELAY_MS)
  const [showKey, setShowKey] = useState(false)
  const [resetAt, setResetAt] = useState<number | null>(null)
  useTitle('Session launcher – Meridian Advisory')
  const p = PERSONAS.find((x) => x.id === persona)!

  const sent = w.emails.filter((e) => e.folder === 'sent' && !e.id.startsWith('s0')).length
  const read = w.emails.filter((e) => e.folder === 'inbox' && e.read).length

  return (
    <div className="launcher" data-app="launcher">
      <header>
        <div>
          <div className="l-eyebrow">Meridian Advisory LLC · Finance · Accounts Payable</div>
          <h1>Recording session launcher</h1>
          <div className="muted">World date: {WORLD_TODAY_LABEL}. Data is identical after every reset.</div>
        </div>
      </header>

      <section className="l-grid">
        <div className="l-card">
          <h2>1. Choose who you are</h2>
          <div className="l-personas">
            {PERSONAS.map((x) => (
              <button key={x.id} className={`l-persona ${persona === x.id ? 'on' : ''}`} onClick={() => setPersona(x.id)} data-action="pick-persona" data-persona={x.id}>
                <strong>{x.name}</strong><span>{x.tagline}</span>
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} />
            Fast replies (5 s instead of ~35 s) — for testing, not for recordings
          </label>
          <button className="btn primary big" data-action="reset-world"
            onClick={() => { resetWorld(persona, fast ? FAST_REPLY_DELAY_MS : DEFAULT_REPLY_DELAY_MS); setResetAt(Date.now()) }}>
            Reset data &amp; start session as {p.name}
          </button>
          {resetAt && <div className="banner success">Reset done. Close any old app tabs and open fresh ones below.</div>}
          <div className="l-status muted">
            Current session: <strong>{PERSONAS.find((x) => x.id === w.persona)?.name}</strong> · started {new Date(w.sessionStartedAt).toLocaleTimeString('en-GB')} ·
            {' '}{read}/25 emails opened · {sent} sent · {w.bills.length - EXISTING_BILLS.length} new bills · {w.scheduled.length} replies on the way
          </div>
        </div>

        <div className="l-card">
          <h2>2. Open the apps (each in its own tab)</h2>
          <div className="l-apps">
            {APPS.map((a) => (
              <a key={a.path} className={`l-app ${a.cls}`} href={a.path} target="_blank" rel="noreferrer" data-action="open-app" data-target-app={a.cls}>
                <strong>{a.name}</strong><span>{a.desc}</span>
              </a>
            ))}
          </div>
          <p className="muted">Start the recorder before you open the first email. Stop after ~8 minutes.</p>
        </div>
      </section>

      <section className="l-grid">
        <div className="l-card">
          <h2>Your task card — {p.name}</h2>
          <p><strong>Goal:</strong> work through the AP inbox for about 8 minutes, as {p.name} would.</p>
          <ul>{p.style.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <div className="l-card">
          <h2>AP procedure (desk note)</h2>
          <ol>{AP_PROCEDURE.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      </section>

      <section className="l-card">
        <div className="l-key-head">
          <h2>Answer key (for the team, not the recorded employee)</h2>
          <button className="btn" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</button>
        </div>
        {showKey && (
          <table className="grid">
            <thead><tr><th>Email</th><th>Invoice</th><th>Planted problem</th><th>Expected handling</th></tr></thead>
            <tbody>{ANSWER_KEY.map((k) => <tr key={k.email + k.invoice}><td>{k.email}</td><td>{k.invoice}</td><td>{k.problem}</td><td>{k.expected}</td></tr>)}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}
