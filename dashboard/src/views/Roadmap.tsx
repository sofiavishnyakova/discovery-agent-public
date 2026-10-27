import { useEffect, useState } from 'react'
import type { Ctx } from '../App'
import type { Catalog, CustomBuild, NeedLine, Profile } from '../types'
import { EvidenceChips, ReviewControl, aed } from './shared'

const REGIONS: Record<string, string> = { uae: 'UAE', ksa: 'Saudi Arabia', uk: 'United Kingdom', eu: 'European Union', global: 'Elsewhere' }

export function RoadmapView({ ctx }: { ctx: Ctx }) {
  const rm = ctx.roadmap
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then(setCatalog).catch(() => setCatalog(null))
  }, [])
  if (!rm) return <div className="notice">The roadmap needs finished processes and costs. Run the pipeline first.</div>
  const phases = [...new Set(rm.plan.map((t) => t.phase))]

  return (
    <div className="stack">
      <section className="card accent">
        <div className="row-between">
          <div>
            <div className="eyebrow">Automation roadmap · existing tools</div>
            <h2>Net saving {aed(rm.total_net_monthly_aed)}/month · {aed(rm.total_net_monthly_aed * 12)}/year</h2>
            <p className="muted small">One-off setup {aed(rm.total_setup_aed)} · at {ctx.costs.assumptions.monthly_volume_main_process.toLocaleString()} invoices/month (change it on the Processes tab)</p>
          </div>
          <button className="btn no-print" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        {rm.plan.length === 0 && (
          <p>No tool pays back within two years at this volume. See each need below for the volume at which it would.</p>
        )}
        {phases.map((ph) => (
          <div key={ph}>
            <h3>{ph}</h3>
            <table className="table">
              <thead><tr><th>Tool</th><th>What it takes over</th><th>Saves</th><th>Costs</th><th>Net</th><th>Setup</th><th>Payback</th><th /></tr></thead>
              <tbody>
                {rm.plan.filter((t) => t.phase === ph).map((t) => (
                  <tr key={t.tool_id}>
                    <td><strong>{t.name}</strong>{t.already_owned && <span className="pill owned">you already pay for it</span>}<div className="muted small">{t.category} · {t.note}</div></td>
                    <td className="small">{[...new Set(t.covers.map((c) => c.label))].map((l) => <div key={l}>{l}</div>)}</td>
                    <td className="mono">{aed(t.monthly_saving_aed)}/mo</td>
                    <td className="mono">{t.monthly_fee_aed ? `${aed(t.monthly_fee_aed)}/mo` : 'nothing extra'}</td>
                    <td className="mono"><strong>{aed(t.net_monthly_aed)}/mo</strong></td>
                    <td className="mono">{aed(t.setup_aed)}<div className="muted small">{t.setup_weeks} wk</div></td>
                    <td className="mono">{t.payback_months != null ? `${t.payback_months} mo` : '—'}</td>
                    <td><ReviewControl ctx={ctx} k={`plan:${t.tool_id}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <details className="formulas">
          <summary>How tools are chosen and scored (our published method)</summary>
          <ul>{Object.entries(rm.scoring).map(([k, v]) => <li key={k}><strong>{k}:</strong> {v}</li>)}</ul>
          <p className="small">{rm.independence}</p>
        </details>
      </section>

      {catalog && <ProfileEditor ctx={ctx} profile={rm.profile} catalog={catalog} />}

      {Object.entries(rm.processes).map(([pid, p]) => (
        <section key={pid} className="card">
          <h2>{ctx.t(p.name)}</h2>
          {p.confidence && p.confidence !== 'high' && (
            <p className="muted small">Based on {p.confidence}-confidence numbers: confirm volumes and times before buying anything.</p>
          )}
          <table className="table">
            <thead><tr><th>Work today</th><th>Time per item</th><th>Cost/month</th><th>Best options (score out of 100)</th></tr></thead>
            <tbody>{p.needs.map((n) => <NeedRow key={n.need} ctx={ctx} n={n} />)}</tbody>
          </table>
          {p.custom_build && <CustomSpec ctx={ctx} spec={p.custom_build} />}
        </section>
      ))}
    </div>
  )
}

function NeedRow({ ctx, n }: { ctx: Ctx; n: NeedLine }) {
  const [open, setOpen] = useState(false)
  return (
    <tr>
      <td>
        {n.label}
        <div className="small">
          {n.measured ? <EvidenceChips ctx={ctx} ids={n.step_ids.slice(0, 3)} title={n.label} /> : <span className="muted">assumption, confirm in interview</span>}
        </div>
      </td>
      <td className="mono">{n.minutes_per_item} min{n.measured ? '' : '*'}</td>
      <td className="mono">{aed(n.monthly_cost_aed)}</td>
      <td>
        {n.options.map((o) => (
          <div key={o.tool_id} className={`option ${n.in_plan === o.tool_id ? 'chosen' : ''}`}>
            <span className="score">{o.score}</span>
            <span>
              <strong>{o.name}</strong>
              {n.in_plan === o.tool_id && <span className="pill owned">in the plan</span>}
              {o.already_owned && <span className="pill owned">owned</span>}
              <span className="muted small">
                {' '}· saves {aed(o.monthly_saving_aed)}/mo
                {o.monthly_fee_aed > 0 && ` for ${aed(o.monthly_fee_aed)}/mo`}
                {o.net_monthly_aed <= 0 && o.break_even_volume > 0 && ` · pays for itself above ~${o.break_even_volume.toLocaleString()} items/month`}
              </span>
            </span>
          </div>
        ))}
        <button className="link small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} score breakdown</button>
        {open && (
          <div className="breakdown small">
            {n.options.map((o) => (
              <div key={o.tool_id}>
                <strong>{o.name}</strong>: {Object.entries(o.score_parts).map(([k, v]) => `${k} ${v}`).join(' · ')}
                {o.penalties.map((p) => ` · ${p.reason} ${p.points}`).join('')}
                {!o.residency_ok && ' · does not meet your data-residency rule'}
              </div>
            ))}
            <div className="muted">{n.formula}</div>
          </div>
        )}
      </td>
    </tr>
  )
}

function CustomSpec({ ctx, spec }: { ctx: Ctx; spec: CustomBuild }) {
  const [copied, setCopied] = useState(false)
  const md = [
    `# ${spec.title}`, '', spec.why, '', `**Trigger:** ${spec.trigger}`, '', '## Steps', ...spec.steps.map((s, i) => `${i + 1}. ${s}`),
    '', '## Must stay with a human', ...spec.human_approval.map((s) => `- ${s}`),
    '', '## Escalate to a person', ...spec.escalate.map((s) => `- ${s}`),
    '', '## Exceptions seen in the recordings', ...spec.known_exceptions.map((s) => `- ${s}`),
    '', `**Success metric:** ${spec.success_metric}`, '', spec.handoff,
  ].map(ctx.t).join('\n')
  return (
    <div className="spec">
      <div className="row-between">
        <div>
          <div className="eyebrow">Custom build needed · spec for your builder</div>
          <h3 className="spec-title">{ctx.t(spec.title)}</h3>
        </div>
        <button className="btn no-print" onClick={async () => {
          try { await navigator.clipboard.writeText(md); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
        }}>{copied ? 'Copied' : 'Copy spec'}</button>
      </div>
      <p>{ctx.t(spec.why)}</p>
      <div className="grid2">
        <div>
          <h3>Steps</h3><ol className="flow">{spec.steps.map((s) => <li key={s}>{ctx.t(s)}</li>)}</ol>
        </div>
        <div>
          <h3>Must stay with a human</h3><ul className="checks">{spec.human_approval.map((s) => <li key={s}>{ctx.t(s)}</li>)}</ul>
          <h3>Escalate to a person</h3><ul className="list">{spec.escalate.map((s) => <li key={s}>{ctx.t(s)}</li>)}</ul>
          <h3>Success metric</h3><p className="small">{spec.success_metric}</p>
        </div>
      </div>
      <p className="muted small">{spec.handoff} <EvidenceChips ctx={ctx} ids={spec.evidence_step_ids.slice(0, 4)} title={spec.title} /></p>
    </div>
  )
}

function ProfileEditor({ ctx, profile, catalog }: { ctx: Ctx; profile: Profile; catalog: Catalog }) {
  const [p, setP] = useState<Profile>(profile)
  const [busy, setBusy] = useState(false)
  useEffect(() => setP(profile), [profile])
  const toggle = (k: 'stack' | 'existing_tools', id: string) =>
    setP({ ...p, [k]: p[k].includes(id) ? p[k].filter((x) => x !== id) : [...p[k], id] })
  return (
    <details className="card assumptions profile">
      <summary>Personalise: about this client</summary>
      <p className="muted small">Recommendations are filtered by what the client already pays for, their systems, region, budget and data rules.
        Now: {profile.region.toUpperCase()} · {profile.stack.length} system(s) · budget AED {profile.monthly_budget_aed.toLocaleString()}/month · data {profile.data_residency === 'any' ? 'anywhere' : 'in-country'}.</p>
      <div className="assume-grid">
        <label><span>Company</span><input value={p.company} onChange={(e) => setP({ ...p, company: e.target.value })} /></label>
        <label><span>Region</span>
          <select value={p.region} onChange={(e) => setP({ ...p, region: e.target.value })}>
            {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span>Accounting system</span><input value={p.accounting_system} onChange={(e) => setP({ ...p, accounting_system: e.target.value })} /></label>
        <label><span>Monthly budget (AED)</span><input type="number" min={0} step={500} value={p.monthly_budget_aed} onChange={(e) => setP({ ...p, monthly_budget_aed: Number(e.target.value) })} /></label>
        <label><span>Data must stay</span>
          <select value={p.data_residency} onChange={(e) => setP({ ...p, data_residency: e.target.value as Profile['data_residency'] })}>
            <option value="any">Anywhere (normal cloud is fine)</option>
            <option value="in-country">In the country or on-premises</option>
          </select>
        </label>
        <label className="inline"><input type="checkbox" checked={p.prefer_no_code} onChange={(e) => setP({ ...p, prefer_no_code: e.target.checked })} /> Prefers no-code tools</label>
      </div>
      <h3>Systems they use</h3>
      <div className="checkgrid">
        {Object.entries(catalog.stacks).map(([id, label]) => (
          <label key={id}><input type="checkbox" checked={p.stack.includes(id)} onChange={() => toggle('stack', id)} /> {label}</label>
        ))}
      </div>
      <h3>Already paying for</h3>
      <div className="checkgrid">
        {Object.entries(catalog.stacks).map(([id, label]) => (
          <label key={`s-${id}`}><input type="checkbox" checked={p.existing_tools.includes(id)} onChange={() => toggle('existing_tools', id)} /> {label}</label>
        ))}
        {catalog.tools.map((t) => (
          <label key={t.id}><input type="checkbox" checked={p.existing_tools.includes(t.id)} onChange={() => toggle('existing_tools', t.id)} /> {t.name}</label>
        ))}
      </div>
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await ctx.updateProfile(p); setBusy(false) }}>
        {busy ? 'Updating…' : 'Update roadmap'}
      </button>
    </details>
  )
}
