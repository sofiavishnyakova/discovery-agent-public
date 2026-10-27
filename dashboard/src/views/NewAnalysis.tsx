// DEMO ONLY: the "New analysis" screen a consultant would use to start an analysis.
// It shows the privacy choice per recording and how that routes each stage to the local or cloud model,
// then replays a saved analysis. The real run (with live routing) is built after the hackathon submission.
import { useEffect, useMemo, useState } from 'react'
import type { Ctx } from '../App'
import { personaOf } from './shared'

const DEMO_BATCH = 'sara-02+lina-01' // the saved analysis this demo replays (produced in cloud mode)
const DEMO_SESSIONS = ['sara-02', 'lina-01']
const SAVED_RESULT_MODE: Mode = 'cloud'

type Mode = 'local' | 'cloud' | 'code'
interface SessionRow { session: string; persona: string | null; events: number; frames: number; duration_s: number }
interface Stage { label: string; detail: string; mode: Mode }

const MODE_LABEL: Record<Mode, string> = {
  local: '🔒 Local model: Qwen3.5 9B on this machine',
  cloud: '☁️ Cloud model: Claude',
  code: '⚙️ Plain code, no AI',
}

export function NewAnalysis({ ctx, onOpenResults }: { ctx: Ctx; onOpenResults: (batch: string) => void }) {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sensitive, setSensitive] = useState<Record<string, boolean>>(() => Object.fromEntries(DEMO_SESSIONS.map((s) => [s, true])))
  const [running, setRunning] = useState(-1) // index of the stage in progress; -1 = not started
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((list: SessionRow[]) => setSessions(list.filter((s) => DEMO_SESSIONS.includes(s.session))))
      .catch(() => setSessions([]))
  }, [])

  const anySensitive = DEMO_SESSIONS.some((s) => sensitive[s])
  const stages = useMemo<Stage[]>(() => [
    ...DEMO_SESSIONS.map((s) => ({
      label: `Describe the work steps: ${personaOf(ctx, s)}`,
      detail: sensitive[s] ? 'Marked sensitive, so it stays on this machine' : 'Not sensitive: event log only, no screenshots or typed values',
      mode: (sensitive[s] ? 'local' : 'cloud') as Mode,
    })),
    { label: 'Find repeated processes (combines all recordings)', detail: anySensitive ? 'At least one recording is sensitive, so the combined analysis stays local' : 'No sensitive recordings', mode: anySensitive ? 'local' : 'cloud' },
    { label: 'Cost each process (manual work, rework, checking)', detail: 'Measured timings × your assumptions', mode: 'code' },
    { label: 'Match existing tools from the catalog → roadmap', detail: 'Published scoring method, no referral fees', mode: 'code' },
    { label: 'Write the interview plan (combines all recordings)', detail: anySensitive ? 'Stays local because a sensitive recording is included' : 'No sensitive recordings', mode: anySensitive ? 'local' : 'cloud' },
  ], [ctx, sensitive, anySensitive])

  const usesLocal = stages.some((s) => s.mode === 'local')

  const run = () => {
    setDone(false)
    let i = 0
    setRunning(0)
    const tick = () => {
      i += 1
      if (i >= stages.length) {
        setRunning(stages.length)
        setDone(true)
        return
      }
      setRunning(i)
      setTimeout(tick, 900 + Math.random() * 900)
    }
    setTimeout(tick, 1200)
  }

  const mins = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`

  return (
    <div className="stack">
      <section className="card">
        <div className="eyebrow">New analysis</div>
        <h2>Meridian Advisory LLC · Accounts Payable</h2>
        <p className="muted small">Choose the recordings to analyse and how sensitive each one is. Sensitive recordings never leave this machine.</p>

        <table className="table na-table">
          <thead><tr><th>Recording</th><th>Length</th><th>Events</th><th>Privacy</th></tr></thead>
          <tbody>
            {DEMO_SESSIONS.map((s) => {
              const row = sessions.find((x) => x.session === s)
              return (
                <tr key={s}>
                  <td><strong>{personaOf(ctx, s)}</strong>{ctx.showNames && <span className="muted small"> ({s})</span>}</td>
                  <td>{row ? mins(row.duration_s) : '—'}</td>
                  <td>{row ? row.events : '—'}</td>
                  <td>
                    <div className="na-toggle" role="radiogroup" aria-label={`Privacy for ${personaOf(ctx, s)}`}>
                      <button className={sensitive[s] ? 'on' : ''} disabled={running >= 0 && !done} onClick={() => setSensitive({ ...sensitive, [s]: true })}>🔒 Sensitive</button>
                      <button className={!sensitive[s] ? 'on' : ''} disabled={running >= 0 && !done} onClick={() => setSensitive({ ...sensitive, [s]: false })}>☁️ Not sensitive</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Where each step will run</h2>
        <ol className="na-stages">
          {stages.map((st, i) => {
            const state = running < 0 ? 'todo' : i < running || done ? 'done' : i === running ? 'doing' : 'todo'
            return (
              <li key={st.label} className={`na-stage ${state}`}>
                <span className="na-icon">{state === 'done' ? '✓' : state === 'doing' ? <span className="na-spin" /> : i + 1}</span>
                <span className="na-text"><strong>{st.label}</strong><span className="muted small">{st.detail}</span></span>
                <span className={`na-mode ${st.mode}`}>{MODE_LABEL[st.mode]}</span>
              </li>
            )
          })}
        </ol>
        <p className="muted small">Typed values, passwords and document text are never recorded. Screenshots are never sent to a cloud model.</p>

        <div className="row-between">
          <button className="btn" disabled={running >= 0 && !done} onClick={run}>{done ? 'Run again' : 'Run analysis'}</button>
          {done && <button className="btn" onClick={() => onOpenResults(DEMO_BATCH)}>Open results →</button>}
        </div>
        <p className="na-demo-note small">
          Demo: this screen replays the saved analysis of these two recordings, made in {SAVED_RESULT_MODE === 'cloud' ? 'cloud' : 'local'} mode.
          {usesLocal && ' A live local run takes about 20–40 minutes on this laptop.'}
        </p>
      </section>
    </div>
  )
}
