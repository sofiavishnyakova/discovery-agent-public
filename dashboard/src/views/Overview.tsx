import type { Ctx } from '../App'
import { EvidenceChips, FitPill, ReviewControl, aed, findingKeys, personaOf, usd } from './shared'

export function Overview({ ctx, goTo }: { ctx: Ctx; goTo: (tab: string) => void }) {
  const { data, costs } = ctx
  const stats = Object.values(data.stats)
  const minutes = stats.reduce((s, x) => s + x.minutes, 0)
  const switches = stats.reduce((s, x) => s + x.tab_switches, 0)
  const copies = stats.reduce((s, x) => s + x.copy_paste.count, 0)
  const rejected = stats.reduce((s, x) => s + x.failed_submit_seqs.length, 0)
  const items = data.processes.processes.reduce((s, p) => s + p.instances.length, 0)
  const top = costs.processes[costs.ranking[0]]
  const fa = data.interview_plan.first_agent
  const faProcess = data.processes.processes.find((p) => p.id === fa.process_id)
  const observations = Object.values(data.steps).flatMap((s) => s.observations.map((o, i) => ({ ...o, key: `observation:${s.session}:${i}` })))
  const keys = findingKeys(ctx)
  const reviewed = keys.filter((k) => ctx.review[k]).length

  return (
    <div className="stack">
      <section className="kpis">
        <Kpi label="Observed" value={`${minutes.toFixed(0)} min`} sub={`${stats.length} people: ${stats.map((s) => personaOf(ctx, s.session)).join(', ')}`} />
        <Kpi label="Work items seen" value={String(items)} sub={`${data.processes.processes.length} processes found`} />
        <Kpi label="App switches" value={`${(switches / minutes).toFixed(1)}/min`} sub={`${switches} total · ${copies} copy→paste`} />
        <Kpi label="Rejected submits" value={String(rejected)} sub="re-done by hand" tone="warn" />
        <Kpi label="Human-reviewed" value={`${reviewed}/${keys.length}`} sub={reviewed === keys.length ? 'every finding checked' : 'findings still AI drafts'} tone={reviewed < keys.length ? 'warn' : undefined} />
        {top && <Kpi label="Top process cost" value={`${aed(top.monthly_aed.total)}/mo`} sub={`≈ ${usd(top.monthly_usd_total)}/mo · ${aed(top.annual_aed_total)}/year`} tone="accent" />}
      </section>

      {data.language_check?.length > 0 && (
        <div className="notice">
          <strong>Language check:</strong> {data.language_check.length} place(s) where the AI's wording judges a person instead of describing the work. Rewrite before sharing. <button className="link" onClick={() => goTo('Privacy & AI')}>See them →</button>
        </div>
      )}
      <section className="card">
        <h2>What we found</h2>
        <ol className="headline">
          {data.interview_plan.headline.map((h, i) => <li key={h}>{ctx.t(h)} <ReviewControl ctx={ctx} k={`headline:${i}`} /></li>)}
        </ol>
      </section>

      <div className="grid2">
        <section className="card accent">
          <div className="eyebrow">Recommended first agent</div>
          <h2>{faProcess?.name ?? fa.process_id}</h2>
          {faProcess && <FitPill score={faProcess.automation_fit.score} />}
          <p>{ctx.t(fa.why)}</p>
          <h3>Stays with a human</h3>
          <ul className="checks">{fa.human_approval_steps.map((s) => <li key={s}>{ctx.t(s)}</li>)}</ul>
          <button className="link" onClick={() => goTo('Processes')}>See costs and evidence →</button>
        </section>

        <section className="card">
          <h2>Problems seen on screen</h2>
          <ul className="obs">
            {observations.map((o) => (
              <li key={o.key}>
                <span className={`kind kind-${o.kind}`}>{o.kind.replace('_', ' ')}</span>
                <span>{ctx.t(o.note)}</span>
                <EvidenceChips ctx={ctx} ids={o.step_ids} title={o.note} />
                <ReviewControl ctx={ctx} k={o.key} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'warn' | 'accent' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}
