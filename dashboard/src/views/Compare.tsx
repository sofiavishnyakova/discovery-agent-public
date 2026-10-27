import { useEffect, useState } from 'react'
import type { Ctx } from '../App'
import type { Comparison } from '../types'
import { aed } from './shared'

const pct = (n: number | null | undefined) => (n == null ? '' : `${n > 0 ? '+' : ''}${n}%`)

export function Compare({ ctx }: { ctx: Ctx }) {
  const [before, setBefore] = useState(ctx.batch)
  const [after, setAfter] = useState(ctx.batches.find((b) => b !== ctx.batch) ?? '')
  const [cmp, setCmp] = useState<Comparison | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!before || !after || before === after) { setCmp(null); return }
    setError('')
    fetch(`/api/compare?before=${encodeURIComponent(before)}&after=${encodeURIComponent(after)}`)
      .then(async (r) => (r.ok ? setCmp(await r.json()) : setError((await r.json()).detail ?? 'Comparison failed')))
      .catch(() => setError('Comparison failed'))
  }, [before, after])

  return (
    <div className="stack">
      <section className="card">
        <h2>Did it work? Re-measure after the change</h2>
        <p className="muted small">
          Record the same team again a few weeks after a tool goes live, run the analysis, and compare it here with the baseline.
          Both are recalculated with the baseline's assumptions, so only the measured work differs. We can audit any vendor's promise this way,
          because we have no stake in which tool was chosen.
        </p>
        <div className="assume-grid">
          <label><span>Baseline (before)</span>
            <select value={before} onChange={(e) => setBefore(e.target.value)}>{ctx.batches.map((b) => <option key={b}>{b}</option>)}</select>
          </label>
          <label><span>Re-scan (after)</span>
            <select value={after} onChange={(e) => setAfter(e.target.value)}>
              <option value="">Choose…</option>
              {ctx.batches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
        </div>
        {ctx.batches.length < 2 && <div className="notice small">Only one analysis exists so far. Record an "after" session and run the pipeline to compare.</div>}
        {before === after && after && <div className="notice small">Pick two different analyses.</div>}
        {error && <div className="notice small">{error}</div>}
      </section>

      {cmp && (
        <>
          <section className="kpis">
            <div className="kpi accent">
              <div className="kpi-label">Measured saving</div>
              <div className="kpi-value">{aed(cmp.measured_monthly_saving_aed)}/mo</div>
              <div className="kpi-sub">from re-recorded work</div>
            </div>
            {cmp.promised_monthly_saving_aed != null && (
              <div className="kpi">
                <div className="kpi-label">Roadmap promised</div>
                <div className="kpi-value">{aed(cmp.promised_monthly_saving_aed)}/mo</div>
                <div className="kpi-sub">{cmp.delivered_pct != null ? `${cmp.delivered_pct}% delivered` : ''}</div>
              </div>
            )}
          </section>
          <section className="card">
            <table className="table">
              <thead><tr><th>Process</th><th>Minutes per item</th><th>Rework per item</th><th>Cost per month</th><th>Confidence</th></tr></thead>
              <tbody>
                {cmp.rows.map((r) => (
                  <tr key={r.before_id}>
                    <td>{ctx.t(r.name)}{r.after_name && r.after_name !== r.name && <div className="muted small">matched to “{ctx.t(r.after_name)}”</div>}</td>
                    {r.monthly_aed ? (
                      <>
                        <td className="mono">{r.minutes_per_item!.before} → {r.minutes_per_item!.after} <span className="muted">{pct(r.minutes_per_item!.change_pct)}</span></td>
                        <td className="mono">{r.rework_minutes_per_item!.before} → {r.rework_minutes_per_item!.after}</td>
                        <td className="mono">{aed(r.monthly_aed.before)} → {aed(r.monthly_aed.after)} <span className="muted">{pct(r.monthly_aed.change_pct)}</span></td>
                        <td className="small">{r.confidence?.before} → {r.confidence?.after}</td>
                      </>
                    ) : <td colSpan={4} className="muted">Not seen in the re-scan</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!cmp.same_assumptions && <p className="muted small">Assumptions differ between the two runs; the re-scan was recalculated with the baseline's.</p>}
          </section>
        </>
      )}
    </div>
  )
}
