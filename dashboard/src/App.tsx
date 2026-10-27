import { NewAnalysis } from './views/NewAnalysis'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Assumptions, Costs, Profile, Results, ReviewMark, Roadmap, Step } from './types'
import { Overview } from './views/Overview'
import { Processes } from './views/Processes'
import { RoadmapView } from './views/Roadmap'
import { Timeline } from './views/Timeline'
import { Interview } from './views/Interview'
import { Compare } from './views/Compare'
import { Privacy } from './views/Privacy'
import { EvidencePanel } from './views/Evidence'

const TABS = ['New analysis', 'Overview', 'Processes', 'Roadmap', 'Recordings', 'Interview plan', 'Before / after', 'Privacy & AI'] as const
type Tab = (typeof TABS)[number]

export interface Ctx {
  data: Results
  costs: Costs
  roadmap: Roadmap | null
  batch: string
  batches: string[]
  steps: Map<string, Step>
  processOf: Map<string, string> // step id -> process id
  showEvidence: (stepIds: string[], title?: string) => void
  recompute: (a: Assumptions) => Promise<void>
  updateProfile: (p: Profile) => Promise<void>
  review: Record<string, ReviewMark>
  setReview: (key: string, status: ReviewMark['status'] | null, note?: string) => Promise<void>
  showNames: boolean
  setShowNames: (v: boolean) => void
  /** Model text with participants' names replaced by pseudonyms unless names are shown. */
  t: (text: string) => string
}

/** Participants are "Person A", "Person B"… by default: reports describe processes, not people. */
function pseudonyms(data: Results): Map<string, string> {
  const people = [...new Set(Object.values(data.stats).map((s) => s.persona).filter(Boolean) as string[])].sort()
  return new Map(people.map((p, i) => [p.toLowerCase(), `Person ${String.fromCharCode(65 + i)}`]))
}

export default function App() {
  const [batches, setBatches] = useState<{ batch: string; usd_spent: number }[]>([])
  const [batch, setBatch] = useState<string>('')
  const [data, setData] = useState<Results | null>(null)
  const [costs, setCosts] = useState<Costs | null>(null)
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null)
  const [review, setReviewState] = useState<Record<string, ReviewMark>>({})
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>(() => {
    try { return (localStorage.getItem('tab') as Tab) || 'Overview' } catch { return 'Overview' }
  })
  const [showNames, setShowNames] = useState(false)
  const [evidence, setEvidence] = useState<{ ids: string[]; title?: string } | null>(null)

  useEffect(() => {
    fetch('/api/results')
      .then((r) => r.json())
      .then((list) => {
        setBatches(list)
        if (list.length) setBatch(list[list.length - 1].batch)
        else setError('No analysis results yet. Run the pipeline first (server/pipeline/run.py).')
      })
      .catch(() => setError('Cannot reach the analysis server on localhost:8000. Start it, then reload.'))
  }, [])

  useEffect(() => {
    if (!batch) return
    fetch(`/api/results/${encodeURIComponent(batch)}`)
      .then((r) => r.json())
      .then((d: Results) => {
        setData(d)
        setCosts(d.costs)
        setRoadmap(d.roadmap ?? null)
        setReviewState(d.review ?? {})
      })
      .catch(() => setError(`Could not load results for ${batch}.`))
  }, [batch])

  useEffect(() => {
    try { localStorage.setItem('tab', tab) } catch { /* storage blocked */ }
  }, [tab])

  const postRoadmap = useCallback(async (body: { profile?: Profile; assumptions?: Assumptions }) => {
    const r = await fetch(`/api/results/${encodeURIComponent(batch)}/roadmap`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (r.ok) setRoadmap(await r.json())
  }, [batch])

  const ctx = useMemo<Ctx | null>(() => {
    if (!data || !costs) return null
    const steps = new Map<string, Step>()
    Object.values(data.steps).forEach((s) => s.steps.forEach((st) => steps.set(st.id, st)))
    const processOf = new Map<string, string>()
    data.processes.processes.forEach((p) => p.instances.forEach((i) => i.step_ids.forEach((id) => processOf.set(id, p.id))))
    const names = pseudonyms(data)
    const nameRe = names.size ? new RegExp(`\\b(${[...names.keys()].join('|')})('s)?\\b`, 'gi') : null
    return {
      data, costs, roadmap, batch, steps, processOf, review, showNames, setShowNames,
      batches: batches.map((b) => b.batch),
      showEvidence: (ids, title) => setEvidence({ ids, title }),
      recompute: async (a) => {
        const r = await fetch(`/api/results/${encodeURIComponent(batch)}/costs`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a),
        })
        if (r.ok) setCosts(await r.json())
        await postRoadmap({ profile: roadmap?.profile, assumptions: a })
      },
      updateProfile: (p) => postRoadmap({ profile: p, assumptions: costs.assumptions }),
      setReview: async (key, status, note = '') => {
        const r = await fetch(`/api/results/${encodeURIComponent(batch)}/review`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, status, note }),
        })
        if (r.ok) setReviewState(await r.json())
      },
      t: (text) => (showNames || !nameRe ? text : text.replace(nameRe, (_, n: string, s?: string) => names.get(n.toLowerCase())! + (s ?? ''))),
    }
  }, [data, costs, roadmap, batch, batches, review, showNames, postRoadmap])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo">◆</div>
          <div>
            <div className="product">Discovery Agent</div>
            <div className="sub">Independent back-office check-up · Client: {roadmap?.profile.company ?? 'Meridian Advisory LLC'} · Accounts Payable</div>
          </div>
        </div>
        <div className="top-right">
          <label className="toggle small" title="Reports describe processes, not people. Names are hidden by default.">
            <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Show participant names
          </label>
          {batches.length > 1 && (
            <select value={batch} onChange={(e) => setBatch(e.target.value)} aria-label="Analysis run">
              {batches.map((b) => <option key={b.batch} value={b.batch}>{b.batch}</option>)}
            </select>
          )}
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      <main>
        {error && <div className="notice">{error}</div>}
        {!ctx && !error && <div className="notice">Loading analysis…</div>}
        {ctx && tab === 'New analysis' && <NewAnalysis ctx={ctx} onOpenResults={(b) => { setBatch(b); setTab('Overview') }} />}
        {ctx && tab === 'Overview' && <Overview ctx={ctx} goTo={(t) => setTab(t as Tab)} />}
        {ctx && tab === 'Processes' && <Processes ctx={ctx} />}
        {ctx && tab === 'Roadmap' && <RoadmapView ctx={ctx} />}
        {ctx && tab === 'Recordings' && <Timeline ctx={ctx} />}
        {ctx && tab === 'Interview plan' && <Interview ctx={ctx} />}
        {ctx && tab === 'Before / after' && <Compare ctx={ctx} />}
        {ctx && tab === 'Privacy & AI' && <Privacy ctx={ctx} />}
      </main>
      <footer className="foot small muted">
        Independent: we sell no automation and take no fees from any tool we recommend. AI findings are drafts until a person confirms them.
      </footer>
      {ctx && evidence && <EvidencePanel ctx={ctx} ids={evidence.ids} title={evidence.title} onClose={() => setEvidence(null)} />}
    </div>
  )
}
