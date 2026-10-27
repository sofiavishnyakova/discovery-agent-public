// Shapes of the analysis results served by GET /results/{batch}.

export interface Step {
  id: string
  session: string
  first_seq: number
  last_seq: number
  app: string
  action: string
  object: string
  source_app: string
  description: string
  entities: { invoice: string; supplier: string; bill_ref: string; po: string; email: string }
  flags: string[]
  start_s: number
  end_s: number
  duration_s: number
  event_seqs: number[]
  frames: string[]
}

export interface Observation {
  first_seq: number
  last_seq: number
  kind: string
  note: string
  step_ids: string[]
}

export interface SessionSteps {
  session: string
  steps: Step[]
  observations: Observation[]
  key_frames: { frame: string; seq: number; why: string }[]
  warnings: string[]
}

export interface Process {
  id: string
  name: string
  description: string
  canonical_steps: string[]
  instances: { session: string; work_item: string; step_ids: string[]; outcome: string }[]
  variations: string[]
  exceptions: { type: string; description: string; step_ids: string[] }[]
  approval_points: { description: string; step_ids: string[] }[]
  automation_fit: { score: 'high' | 'medium' | 'low'; reasons: string[]; judgment_calls: string[] }
}

export interface ProcessCost {
  name: string
  instances_observed: number
  instances_completed: number
  sessions: string[]
  avg_minutes_per_item: number
  rework_minutes_per_item: number
  est_monthly_volume: number
  monthly_aed: { manual: number; rework: number; checking: number; total: number }
  monthly_usd_total: number
  annual_aed_total: number
  annual_usd_total: number
  monthly_hours: number
  formulas: Record<string, string>
  automation_fit: string
  confidence?: Confidence
}

export interface Assumptions {
  monthly_volume_main_process: number
  clerk_rate_aed_per_hour: number
  manager_rate_aed_per_hour: number
  review_minutes_per_item: number
  max_gap_s?: number
}

export interface Costs {
  assumptions: Assumptions
  observed_hours: number
  currency: string
  processes: Record<string, ProcessCost>
  ranking: string[]
}

export interface SessionStats {
  session: string
  persona: string | null
  minutes: number
  events: number
  tab_switches: number
  tab_switches_per_min: number
  copy_paste: { count: number }
  bills_created: string[]
  bill_submits: number
  failed_submit_seqs: number[]
  left_chrome: number
  documents_opened: string[]
}

export interface Question {
  question: string
  hypothesis: string
  why: string
  evidence: string[]
  priority: 'high' | 'medium' | 'low'
}

export interface InterviewPlan {
  headline: string[]
  first_agent: { process_id: string; why: string; human_approval_steps: string[] }
  sections: { title: string; questions: Question[] }[]
  warnings: string[]
}

export interface Results {
  batch: string
  stats: Record<string, SessionStats>
  processes: { processes: Process[] }
  costs: Costs
  interview_plan: InterviewPlan
  steps: Record<string, SessionSteps>
  profile: Profile
  review: Record<string, ReviewMark>
  roadmap?: Roadmap
  language_check: LanguageHit[]
}

export interface Confidence {
  level: 'high' | 'medium' | 'low'
  instances: number
  people: number
  reason: string
  to_reach_high: string
  rule: string
}

export interface Profile {
  company: string
  region: string
  stack: string[]
  existing_tools: string[]
  accounting_system: string
  monthly_budget_aed: number
  data_residency: 'any' | 'in-country'
  prefer_no_code: boolean
}

export interface ToolOption {
  tool_id: string
  name: string
  vendor: string
  category: string
  note: string
  already_owned: boolean
  coverage: 'primary' | 'partial'
  score: number
  score_parts: Record<string, number>
  penalties: { reason: string; points: number }[]
  residency_ok: boolean
  monthly_fee_aed: number
  setup_aed: number
  setup_weeks: number
  monthly_saving_aed: number
  net_monthly_aed: number
  payback_months: number | null
  break_even_volume: number
}

export interface NeedLine {
  need: string
  label: string
  minutes_per_item: number
  step_ids: string[]
  measured: boolean
  monthly_hours: number
  monthly_cost_aed: number
  formula: string
  options: ToolOption[]
  in_plan: string | null
}

export interface CustomBuild {
  title: string
  why: string
  trigger: string
  steps: string[]
  human_approval: string[]
  escalate: string[]
  known_exceptions: string[]
  success_metric: string
  evidence_step_ids: string[]
  handoff: string
}

export interface PlanLine {
  tool_id: string
  name: string
  vendor: string
  category: string
  note: string
  already_owned: boolean
  monthly_saving_aed: number
  monthly_fee_aed: number
  net_monthly_aed: number
  setup_aed: number
  setup_weeks: number
  payback_months: number | null
  covers: { process_id: string; process: string; need: string; label: string }[]
  phase: string
}

export interface Roadmap {
  profile: Profile
  catalog_version: string
  scoring: Record<string, string>
  independence: string
  processes: Record<string, { name: string; needs: NeedLine[]; custom_build: CustomBuild | null; confidence: string | null }>
  plan: PlanLine[]
  total_net_monthly_aed: number
  total_setup_aed: number
  not_covered: { process_id: string; need: string; label: string; monthly_cost_aed: number }[]
}

export interface Catalog {
  version: string
  about: string
  needs: Record<string, string>
  stacks: Record<string, string>
  tools: { id: string; name: string; vendor: string; category: string }[]
}

export interface ReviewMark {
  status: 'confirmed' | 'rejected' | 'needs_check'
  note: string
  by: string
  at: string
}

export interface LanguageHit {
  where: string
  kind: 'performance' | 'emotion'
  word: string
  text: string
}

export interface Processing {
  models: string[]
  requests: number
  minutes: number
  input_tokens: number
  output_tokens: number
  usd_spent: number
  llm_endpoint: string
  local: boolean
  cloud_models: string[]
  screenshots_sent_to_model: boolean
  machine: { system: string; chip: string; memory_gb: number | null }
  costs_computed_by: string
  recommendations_computed_by: string
}

export interface SessionPrivacy {
  session: string
  consent: { agreed: boolean; at: number; notice_version: string } | null
  paused_seconds: number | null
  allowed_sites: string[] | null
  redaction: { fields: boolean; documents: boolean; screenshots: boolean } | null
  screenshots: number
  screenshots_redacted: number
  typed_values_recorded: boolean
  deletion: { certificate_id: string; deleted_at: string; files_deleted: number; screenshots_deleted: number } | null
}

interface Change { before: number; after: number; change: number; change_pct: number | null }

export interface Comparison {
  before: string
  after: string
  rows: {
    before_id: string
    after_id: string | null
    name: string
    after_name: string | null
    minutes_per_item?: Change
    rework_minutes_per_item?: Change
    monthly_aed?: Change
    confidence?: { before: string | null; after: string | null }
    formula?: string
  }[]
  measured_monthly_saving_aed: number
  same_assumptions: boolean
  unmatched_after: string[]
  promised_monthly_saving_aed?: number
  delivered_pct?: number | null
}
