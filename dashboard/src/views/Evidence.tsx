import { useEffect, useState } from 'react'
import type { Ctx } from '../App'
import { mmss, personaOf, processColor } from './shared'

const MAX_FRAMES_PER_STEP = 4

/** Picks a few screenshots spread across a step (first, middle, last). */
function spread(frames: string[], n: number) {
  if (frames.length <= n) return frames
  return Array.from({ length: n }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (n - 1))])
}

export function EvidencePanel({ ctx, ids, title, onClose }: { ctx: Ctx; ids: string[]; title?: string; onClose: () => void }) {
  const [zoom, setZoom] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set()) // sessions whose raw screenshots were deleted
  const steps = ids.map((id) => ctx.steps.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof ctx.steps.get>>[]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (zoom ? setZoom(null) : onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, onClose])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="evidence" aria-label="Evidence">
        <div className="evidence-head">
          <div>
            <div className="eyebrow">Evidence</div>
            <h2>{title ?? steps[0]?.description ?? 'Steps'}</h2>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {steps.map((s) => {
          const pid = ctx.processOf.get(s.id)
          const pname = ctx.data.processes.processes.find((p) => p.id === pid)?.name
          const ents = Object.entries(s.entities).filter(([, v]) => v)
          return (
            <div key={s.id} className="ev-step">
              <div className="ev-meta">
                <span className="dot" style={{ background: processColor(ctx, pid) }} />
                <strong>{personaOf(ctx, s.session)}</strong> · {mmss(s.start_s)}–{mmss(s.end_s)} · <span className="app-tag">{s.app}</span>
                {pname && <span className="muted small"> · {pname}</span>}
              </div>
              <p>{ctx.t(s.description)}</p>
              {(ents.length > 0 || s.flags.length > 0) && (
                <div className="ev-tags">
                  {ents.map(([k, v]) => <span key={k} className="tag">{k.replace('_', ' ')}: {v}</span>)}
                  {s.flags.map((f) => <span key={f} className={`flag f-${f}`}>{f.replace('_', ' ')}</span>)}
                </div>
              )}
              <div className="frames">
                {spread(s.frames, MAX_FRAMES_PER_STEP).map((f) => {
                  const src = `/api/sessions/${s.session}/frames/${f}`
                  if (gone.has(s.session)) return null
                  return <img key={f} src={src} alt={`Screenshot ${f}`} loading="lazy" onClick={() => setZoom(src)}
                    onError={() => setGone((g) => new Set(g).add(s.session))} />
                })}
                {s.frames.length === 0 && <span className="muted small">No screenshots for this step.</span>}
                {gone.has(s.session) && (
                  <span className="muted small">Screenshots were deleted after analysis. <a href={`/api/sessions/${s.session}/certificate`} target="_blank" rel="noreferrer">Deletion certificate</a></span>
                )}
              </div>
            </div>
          )
        })}
      </aside>
      {zoom && (
        <div className="zoom" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Screenshot, enlarged" />
        </div>
      )}
    </>
  )
}
