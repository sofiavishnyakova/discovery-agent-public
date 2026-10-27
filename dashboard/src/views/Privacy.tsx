import { useCallback, useEffect, useState } from 'react'
import type { Ctx } from '../App'
import type { Processing, SessionPrivacy } from '../types'
import { findingKeys, personaOf } from './shared'

export function Privacy({ ctx }: { ctx: Ctx }) {
  const [proc, setProc] = useState<Processing | null>(null)
  const [sessions, setSessions] = useState<SessionPrivacy[]>([])
  const ids = Object.keys(ctx.data.stats)

  const load = useCallback(() => {
    fetch(`/api/results/${encodeURIComponent(ctx.batch)}/processing`).then((r) => r.json()).then(setProc).catch(() => setProc(null))
    Promise.all(ids.map((s) => fetch(`/api/sessions/${s}/privacy`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((rows) => setSessions(rows.filter(Boolean)))
  }, [ctx.batch, ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load])

  const keys = findingKeys(ctx)
  const marks = keys.map((k) => ctx.review[k]?.status)
  const count = (s: string) => marks.filter((m) => m === s).length
  const approvals = ctx.data.processes.processes.flatMap((p) => p.approval_points.map((a) => ({ p: p.name, a: a.description })))

  return (
    <div className="stack">
      <div className="grid2">
        <section className="card">
          <h2>Where the AI ran</h2>
          {proc ? (
            <ul className="checks">
              {proc.local
                ? <li>On this computer ({proc.llm_endpoint}). Nothing was sent to an outside AI service.</li>
                : <li className="warn-item">This analysis used a cloud model ({proc.cloud_models.join(', ') || proc.llm_endpoint}). Re-run it with the local model before using it with real client data.</li>}
              <li>Model: {proc.models.join(', ') || 'unknown'}, on {proc.machine.system} {proc.machine.chip}{proc.machine.memory_gb ? `, ${proc.machine.memory_gb} GB memory` : ''}.</li>
              <li>{proc.requests} AI requests, {proc.minutes} minutes in total, cost ${proc.usd_spent}.</li>
              <li>Screenshots {proc.screenshots_sent_to_model ? 'were' : 'were not'} shown to the model.</li>
              <li>Costs: {proc.costs_computed_by}.</li>
              <li>Tool recommendations: {proc.recommendations_computed_by}.</li>
            </ul>
          ) : <p className="muted">Loading…</p>}
        </section>

        <section className="card">
          <h2>Responsible AI</h2>
          <ul className="checks">
            <li>Human review: {count('confirmed')} confirmed, {count('rejected')} rejected, {count('needs_check')} to check, {keys.length - marks.filter(Boolean).length} still AI drafts.</li>
            <li>Every claim links to the steps and screenshots it came from.</li>
            <li>Confidence on every process: high needs ≥20 occurrences from ≥3 people.</li>
            <li>No scoring of individuals, and no guessing at mood or effort. Names are {ctx.showNames ? 'shown (switch off at the top before sharing)' : 'replaced with pseudonyms'}.</li>
            <li>{approvals.length} step(s) with money or contract impact stay with a human.</li>
          </ul>
          <h3>Language check</h3>
          {ctx.data.language_check.length === 0
            ? <p className="small">No wording that judges a person was found in the AI's output.</p>
            : (
              <ul className="list small">
                {ctx.data.language_check.map((h, i) => (
                  <li key={i}><span className={`kind kind-${h.kind === 'emotion' ? 'warning' : 'error'}`}>{h.kind}</span> “{h.word}” in {h.where}: <span className="muted">{ctx.t(h.text)}</span></li>
                ))}
              </ul>
            )}
        </section>
      </div>

      <section className="card">
        <h2>Recordings: consent and deletion</h2>
        <p className="muted small">What was recorded for each participant, what was hidden, and whether the raw recording still exists. Typed values are never recorded.</p>
        <table className="table">
          <thead><tr><th>Participant</th><th>Consent</th><th>Paused</th><th>Screenshots</th><th>Sites allowed</th><th>Raw recording</th></tr></thead>
          <tbody>
            {sessions.map((s) => <SessionRow key={s.session} ctx={ctx} s={s} onDeleted={load} />)}
          </tbody>
        </table>
        <p className="muted small">
          Deleting keeps the analysis (steps, processes, costs, interview plan) and removes every event and screenshot, with a certificate for the client.
          Recordings made before consent capture existed show “not recorded”.
        </p>
      </section>

      {approvals.length > 0 && (
        <section className="card">
          <h2>Stays with a human</h2>
          <ul className="checks">{approvals.map((x, i) => <li key={i}><strong>{ctx.t(x.p)}:</strong> {ctx.t(x.a)}</li>)}</ul>
        </section>
      )}
    </div>
  )
}

function SessionRow({ ctx, s, onDeleted }: { ctx: Ctx; s: SessionPrivacy; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState('')
  // Session ids contain participants' names, so they're only asked for when names are shown.
  const word = ctx.showNames ? s.session : 'delete'
  const del = async () => {
    const r = await fetch(`/api/sessions/${s.session}/delete-raw`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: confirm === word ? s.session : confirm }),
    })
    if (r.ok) { setAsking(false); onDeleted() } else setErr((await r.json()).detail ?? 'Delete failed')
  }
  return (
    <tr>
      <td>{personaOf(ctx, s.session)}{ctx.showNames && <span className="muted small"> {s.session}</span>}</td>
      <td className="small">{s.consent?.agreed ? `agreed ${new Date(s.consent.at).toLocaleString()}` : <span className="muted">not recorded</span>}</td>
      <td className="small">{s.paused_seconds != null ? `${Math.round(s.paused_seconds)} s` : '—'}</td>
      <td className="small">
        {s.deletion ? `${s.deletion.screenshots_deleted} deleted` : `${s.screenshots} taken, ${s.screenshots_redacted} with fields hidden`}
      </td>
      <td className="small">{s.allowed_sites?.join(', ') ?? <span className="muted">not recorded</span>}</td>
      <td className="small">
        {s.deletion ? (
          <>Deleted {s.deletion.deleted_at} · <a href={`/api/sessions/${s.session}/certificate`} target="_blank" rel="noreferrer">certificate {s.deletion.certificate_id}</a></>
        ) : asking ? (
          <span className="delete-confirm">
            <input placeholder={`type ${word}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={`Type ${word} to confirm`} />
            <button className="btn danger" disabled={confirm !== word} onClick={del}>Delete</button>
            <button className="link" onClick={() => setAsking(false)}>Cancel</button>
            {err && <span className="muted">{err}</span>}
          </span>
        ) : (
          <>Kept · <button className="link" onClick={() => setAsking(true)}>Delete raw recording…</button></>
        )}
      </td>
    </tr>
  )
}
