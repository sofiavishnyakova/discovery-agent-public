import { useState } from 'react'
import type { Ctx } from '../App'
import type { Assumptions } from '../types'
import { ConfidencePill, EvidenceChips, FitPill, ReviewControl, aed, personaOf, processColor, usd } from './shared'

export function Processes({ ctx }: { ctx: Ctx }) {
  const { costs, data } = ctx
  const [open, setOpen] = useState<string | null>(costs.ranking[0] ?? null)
  const max = Math.max(...Object.values(costs.processes).map((c) => c.monthly_aed.total), 1)

  return (
    <div className="stack">
      <AssumptionsEditor ctx={ctx} />
      <p className="muted small">
        Time per item comes from the recordings; monthly volume and hourly rates are assumptions to confirm with the client.
        Costs use Red Rock's three buckets: manual work, rework, and time spent checking the work. Change an assumption to see the effect.
      </p>
      {costs.ranking.map((pid, rank) => {
        const c = costs.processes[pid]
        const p = data.processes.processes.find((x) => x.id === pid)!
        const isOpen = open === pid
        return (
          <section key={pid} className="card process">
            <button className="process-head" onClick={() => setOpen(isOpen ? null : pid)} aria-expanded={isOpen}>
              <span className="rank" style={{ background: processColor(ctx, pid) }}>{rank + 1}</span>
              <span className="process-title">
                <strong>{p.name}</strong>
                <span className="muted small">
                  {c.instances_observed} seen ({c.sessions.map((s) => personaOf(ctx, s)).join(', ')}) · {c.avg_minutes_per_item} min each · est. {c.est_monthly_volume.toLocaleString()}/month · ~{c.monthly_hours} staff hours/month
                </span>
              </span>
              <span className="pills"><FitPill score={p.automation_fit.score} /><ConfidencePill c={c.confidence} /></span>
              <span className="process-cost">
                <strong>{aed(c.monthly_aed.total)}</strong><span className="muted small">/month · ≈ {usd(c.monthly_usd_total)} · {aed(c.annual_aed_total)}/year</span>
              </span>
            </button>
            <div className="bar" role="img" aria-label={`manual ${c.monthly_aed.manual}, rework ${c.monthly_aed.rework}, checking ${c.monthly_aed.checking}`}>
              <span className="seg manual" style={{ width: `${(c.monthly_aed.manual / max) * 100}%` }} />
              <span className="seg rework" style={{ width: `${(c.monthly_aed.rework / max) * 100}%` }} />
              <span className="seg checking" style={{ width: `${(c.monthly_aed.checking / max) * 100}%` }} />
            </div>
            <div className="legend small">
              <span><i className="manual" /> Manual work {aed(c.monthly_aed.manual)}</span>
              <span><i className="rework" /> Rework {aed(c.monthly_aed.rework)}</span>
              <span><i className="checking" /> Checking {aed(c.monthly_aed.checking)}</span>
            </div>

            {isOpen && (
              <div className="process-body">
                <div className="row-between"><p>{ctx.t(p.description)}</p><ReviewControl ctx={ctx} k={`process:${p.id}`} /></div>
                {c.confidence && c.confidence.level !== 'high' && (
                  <div className="notice small">
                    <strong>How sure are we?</strong> {c.confidence.reason} {c.confidence.to_reach_high} Until then, treat these numbers as a hypothesis to confirm in the interview.
                  </div>
                )}
                <h3>How it's done today</h3>
                <ol className="flow">{p.canonical_steps.map((s) => <li key={s}>{ctx.t(s)}</li>)}</ol>

                <h3>Every time we saw it</h3>
                <table className="table">
                  <thead><tr><th>Who</th><th>Work item</th><th>Outcome</th><th>Evidence</th></tr></thead>
                  <tbody>
                    {p.instances.map((i, k) => (
                      <tr key={k}>
                        <td>{personaOf(ctx, i.session)}</td>
                        <td>{i.work_item}</td>
                        <td><span className={`outcome ${i.outcome}`}>{i.outcome}</span></td>
                        <td><button className="chip" onClick={() => ctx.showEvidence(i.step_ids, `${i.work_item} (${personaOf(ctx, i.session)})`)}>{i.step_ids.length} steps</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid2">
                  <div>
                    <h3>What went wrong</h3>
                    <ul className="list">
                      {p.exceptions.map((e, k) => <li key={k}>{ctx.t(e.description)} <EvidenceChips ctx={ctx} ids={e.step_ids} title={e.description} /> <ReviewControl ctx={ctx} k={`exception:${p.id}:${k}`} /></li>)}
                    </ul>
                  </div>
                  <div>
                    <h3>Needs human approval</h3>
                    <ul className="list">
                      {p.approval_points.map((a, k) => <li key={k}>{ctx.t(a.description)} <EvidenceChips ctx={ctx} ids={a.step_ids} title={a.description} /></li>)}
                    </ul>
                    <h3>Why it fits automation</h3>
                    <ul className="list">{p.automation_fit.reasons.map((r) => <li key={r}>{ctx.t(r)}</li>)}</ul>
                    <h3>Agent must escalate</h3>
                    <ul className="list">{p.automation_fit.judgment_calls.map((r) => <li key={r}>{ctx.t(r)}</li>)}</ul>
                  </div>
                </div>
                {p.variations.length > 0 && (
                  <>
                    <h3>Ways of working seen</h3>
                    <ul className="list">{p.variations.map((v) => <li key={v}>{ctx.t(v)}</li>)}</ul>
                  </>
                )}
                <details className="formulas">
                  <summary>How the numbers are calculated</summary>
                  <ul>{Object.entries(c.formulas).map(([k, v]) => <li key={k}><strong>{k}:</strong> {v}</li>)}</ul>
                </details>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function AssumptionsEditor({ ctx }: { ctx: Ctx }) {
  const [a, setA] = useState<Assumptions>(ctx.costs.assumptions)
  const [busy, setBusy] = useState(false)
  const field = (k: keyof Assumptions, label: string, step = 1) => (
    <label>
      <span>{label}</span>
      <input type="number" min={0} step={step} value={a[k] ?? 0} onChange={(e) => setA({ ...a, [k]: Number(e.target.value) })} />
    </label>
  )
  return (
    <section className="card assumptions">
      <h2>Assumptions to confirm in the interview</h2>
      <div className="assume-grid">
        {field('monthly_volume_main_process', 'Invoices per month (main process)', 10)}
        {field('clerk_rate_aed_per_hour', 'Clerk cost (AED/hour)')}
        {field('manager_rate_aed_per_hour', 'Manager cost (AED/hour)')}
        {field('review_minutes_per_item', 'Review minutes per item', 0.5)}
        <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await ctx.recompute(a); setBusy(false) }}>
          {busy ? 'Recalculating…' : 'Recalculate'}
        </button>
      </div>
    </section>
  )
}
