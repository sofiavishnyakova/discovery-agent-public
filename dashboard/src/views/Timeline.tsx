import type { Ctx } from '../App'
import { mmss, personaOf, processColor } from './shared'

export function Timeline({ ctx }: { ctx: Ctx }) {
  const { data } = ctx
  const sessions = Object.values(data.steps)
  const longest = Math.max(...sessions.map((s) => (s.steps.length ? s.steps[s.steps.length - 1].end_s : 0)), 60)
  const ticks = Array.from({ length: Math.floor(longest / 60) + 1 }, (_, i) => i * 60)

  return (
    <div className="stack">
      <section className="card">
        <h2>Recorded work, step by step</h2>
        <p className="muted small">Each block is one step the agent identified. Colour = process. Click a block to see the screenshots.</p>
        <div className="legend small">
          {data.processes.processes.map((p) => (
            <span key={p.id}><i style={{ background: processColor(ctx, p.id) }} /> {p.name}</span>
          ))}
          <span><i style={{ background: 'var(--muted-block)' }} /> Other / setup</span>
          <span><i className="flag-rework" /> Rework or error</span>
          <span>⚠ missed check</span>
        </div>
        <div className="timeline">
          <div className="axis">
            {ticks.map((t) => <span key={t} style={{ left: `${(t / longest) * 100}%` }}>{mmss(t)}</span>)}
          </div>
          {sessions.map((s) => {
            const st = data.stats[s.session]
            return (
              <div key={s.session} className="lane">
                <div className="lane-label">
                  <strong>{personaOf(ctx, s.session)}</strong>
                  <span className="muted small">{st?.minutes} min · {st?.tab_switches} switches</span>
                </div>
                <div className="lane-track">
                  {s.steps.map((step) => {
                    const pid = ctx.processOf.get(step.id)
                    const bad = step.flags.some((f) => ['rework', 'error_shown', 'exception'].includes(f))
                    const missed = step.flags.includes('missed_check')
                    const left = (step.start_s / longest) * 100
                    const width = Math.max((Math.max(step.end_s - step.start_s, 2) / longest) * 100, 0.6)
                    return (
                      <button
                        key={step.id}
                        className={`block ${bad ? 'bad' : ''}`}
                        style={{ left: `${left}%`, width: `${width}%`, background: processColor(ctx, pid) }}
                        title={`${mmss(step.start_s)} · ${ctx.t(step.description)}`}
                        onClick={() => ctx.showEvidence([step.id])}
                      >
                        {missed && <span className="missed">⚠</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {sessions.map((s) => (
        <section key={s.session} className="card">
          <h2>{personaOf(ctx, s.session)}: every step</h2>
          <table className="table steps">
            <thead><tr><th>Time</th><th>App</th><th>Step</th><th>Flags</th></tr></thead>
            <tbody>
              {s.steps.map((step) => (
                <tr key={step.id} onClick={() => ctx.showEvidence([step.id])} className="clickable">
                  <td className="mono">{mmss(step.start_s)}</td>
                  <td><span className="app-tag">{step.app}</span></td>
                  <td>
                    <span className="dot" style={{ background: processColor(ctx, ctx.processOf.get(step.id)) }} />
                    {ctx.t(step.description)}
                  </td>
                  <td>{step.flags.map((f) => <span key={f} className={`flag f-${f}`}>{f.replace('_', ' ')}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
