import type { Ctx } from '../App'
import { EvidenceChips } from './shared'

export function Interview({ ctx }: { ctx: Ctx }) {
  const plan = ctx.data.interview_plan
  const total = plan.sections.reduce((s, x) => s + x.questions.length, 0)
  return (
    <div className="stack interview">
      <section className="card">
        <div className="row-between">
          <div>
            <h2>Discovery interview plan</h2>
            <p className="muted small">{total} questions, each tied to what was observed. Start with the high-priority ones.</p>
          </div>
          <button className="btn no-print" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        <ol className="headline">{plan.headline.map((h) => <li key={h}>{ctx.t(h)}</li>)}</ol>
      </section>
      {plan.sections.map((sec, si) => (
        <section key={sec.title} className="card">
          <h2>{si + 1}. {sec.title}</h2>
          <ol className="questions">
            {sec.questions.map((q, qi) => (
              <li key={qi} className="question">
                <div className="q-head">
                  <span className={`prio ${q.priority}`}>{q.priority}</span>
                  <span className="q-text">{ctx.t(q.question)}</span>
                </div>
                <dl>
                  <dt>Testing</dt><dd>{ctx.t(q.hypothesis)}</dd>
                  <dt>Why it matters</dt><dd>{ctx.t(q.why)}</dd>
                </dl>
                <div className="no-print"><EvidenceChips ctx={ctx} ids={q.evidence} title={q.question} /></div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
