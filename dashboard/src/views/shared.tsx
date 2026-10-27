import { useState } from 'react'
import type { Ctx } from '../App'
import type { Confidence, ReviewMark } from '../types'

export const PROCESS_COLORS = ['#c2410c', '#0f766e', '#7c3aed', '#b45309', '#2563eb']

export function processColor(ctx: Ctx, pid: string | undefined) {
  if (!pid) return 'var(--muted-block)'
  const i = ctx.data.processes.processes.findIndex((p) => p.id === pid)
  return PROCESS_COLORS[i % PROCESS_COLORS.length]
}

export const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`
export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export function mmss(s: number) {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export function personaOf(ctx: Ctx, session: string) {
  const p = ctx.data.stats[session]?.persona
  return p ? ctx.t(p[0].toUpperCase() + p.slice(1)) : session
}

/** Clickable chips that open the evidence panel for step ids. */
export function EvidenceChips({ ctx, ids, title }: { ctx: Ctx; ids: string[]; title?: string }) {
  if (!ids.length) return null
  return (
    <span className="chips">
      {ids.map((id) => {
        const s = ctx.steps.get(id)
        return (
          <button key={id} className="chip" onClick={() => ctx.showEvidence([id], title)} title={s?.description}>
            {s ? `${personaOf(ctx, s.session)} ${mmss(s.start_s)}` : id}
          </button>
        )
      })}
      {ids.length > 1 && (
        <button className="chip all" onClick={() => ctx.showEvidence(ids, title)}>view all {ids.length}</button>
      )}
    </span>
  )
}

export function FitPill({ score }: { score: string }) {
  return <span className={`pill fit-${score}`}>{score} automation fit</span>
}

export function ConfidencePill({ c }: { c?: Confidence }) {
  if (!c) return null
  return (
    <span className={`pill conf-${c.level}`} title={`${c.reason} ${c.to_reach_high} Rule: ${c.rule}`}>
      {c.level} confidence · seen {c.instances}×, {c.people} {c.people === 1 ? 'person' : 'people'}
    </span>
  )
}

const REVIEW_LABEL: Record<ReviewMark['status'], string> = { confirmed: '✓ Confirmed', rejected: '✕ Rejected', needs_check: '? Check in interview' }

/** Every AI finding is a draft until a person confirms or rejects it. */
export function ReviewControl({ ctx, k }: { ctx: Ctx; k: string }) {
  const mark = ctx.review[k]
  const [open, setOpen] = useState(false)
  if (mark && !open) {
    return (
      <span className={`review r-${mark.status}`}>
        <button className="review-chip" onClick={() => setOpen(true)} title={`${mark.by}, ${mark.at}${mark.note ? ` · ${mark.note}` : ''}`}>
          {REVIEW_LABEL[mark.status]}
        </button>
      </span>
    )
  }
  return (
    <span className="review no-print">
      {!mark && <span className="draft">AI draft</span>}
      {(['confirmed', 'rejected', 'needs_check'] as const).map((st) => (
        <button key={st} className={`review-btn ${mark?.status === st ? 'on' : ''}`} onClick={async () => { await ctx.setReview(k, st); setOpen(false) }}
          title={REVIEW_LABEL[st]}>{REVIEW_LABEL[st].split(' ')[0]}</button>
      ))}
      {mark && <button className="review-btn" onClick={async () => { await ctx.setReview(k, null); setOpen(false) }} title="Clear">↺</button>}
    </span>
  )
}

/** Keys of every reviewable finding, so progress can be counted. */
export function findingKeys(ctx: Ctx): string[] {
  const keys: string[] = []
  ctx.data.interview_plan.headline.forEach((_, i) => keys.push(`headline:${i}`))
  ctx.data.processes.processes.forEach((p) => {
    keys.push(`process:${p.id}`)
    p.exceptions.forEach((_, i) => keys.push(`exception:${p.id}:${i}`))
  })
  Object.values(ctx.data.steps).forEach((s) => s.observations.forEach((_, i) => keys.push(`observation:${s.session}:${i}`)))
  ctx.roadmap?.plan.forEach((t) => keys.push(`plan:${t.tool_id}`))
  return keys
}
