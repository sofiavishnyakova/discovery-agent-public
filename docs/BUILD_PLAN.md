# Discovery Agent — Build Plan

An AI agent built for **Red Rock Technology**'s AI Agents and Neuralane clients. It analyses short screen
recordings from a client's staff, finds the repetitive work worth automating, estimates what it costs, and gives
Red Rock's consultants a **costed hypothesis and a targeted interview plan** before the discovery session.

> **One-liner:** *We find what people do, so your consultants can ask why.*

---

## 1. Why this fits Red Rock

- Every Red Rock engagement starts with a free 2–3 hour **discovery session** (Neuralane: a 45-minute assessment)
  to map high-impact processes and estimate return. Today that is done by hand, from what people *say* they do.
- Our agent prepares that session from **observed behaviour**, not guesses, and expresses cost in Red Rock's own
  three buckets: **manual work, rework, and time spent checking the work**.
- It flags every step with economic impact that must stay under **human approval**, matching Red Rock's rule that
  there are no autonomous financial decisions.
- Their current deployments (data intake, portal form-filling, document processing, case monitoring, communications)
  are exactly the processes our demo surfaces.
- Positioning: the agent **helps** Red Rock's consultants, it does not replace them. Discovery is how they win clients.

### Risks to address in the pitch

| Risk | Our answer |
|---|---|
| "It analyses work, it doesn't *do* work" | Show it running on its own (it finds patterns and builds hypotheses), and the stretch goal generates the spec for agent #1 |
| "Savings numbers look made up" | Every number is computed in code from observed steps, the formula is shown, and the assumptions can be edited |
| "Looks like a chatbot with a report" | Visible agent work: step timeline, pattern finding, evidence screenshots behind every claim |
| Privacy / screen recording | Opt-in, field values never logged, processed on Red Rock's own infrastructure, raw recordings deleted after analysis |
| A few recordings ≠ full picture | Recordings produce *hypotheses*, and the interview *confirms* them. That is why the interview plan exists |

---

## 2. Architecture

```
1. WORKPLACE        2. RECORDER          3. AGENT PIPELINE                          4. DASHBOARD
mock AP job   →   Chrome extension  →   clean → steps → stats → processes →    →   React app for the
(4 web apps)      screenshots+events     costs → interview plan                    Red Rock consultant
                  → FastAPI /ingest      (Claude + Python)
```

**Stack:** React + Vite + TypeScript (workplace, dashboard) · Chrome extension MV3 (recorder) ·
Python + FastAPI (server and pipeline) · Claude API via the official `anthropic` Python SDK.

### Repo layout

```
mock-workplace/   ✅ DONE: fake company with Mail, LedgerPoint, ProcureHub, AP Tracker, launcher
recorder/         ✅ Chrome extension (manifest, content.js, background.js, popup)
server/           FastAPI: ✅ /ingest + checking page; next: /analyze, /results + pipeline/{clean,steps,stats,processes,costs,interview}.py
dashboard/        React app for the consultant
contracts/        Example JSON for each data contract (shared by everyone)
data/             sessions/, results/ (not committed)
docs/             This plan
```

---

## 3. Component 1: Mock workplace ✅ (done)

Fictional **Meridian Advisory LLC**, a 120-person consulting firm in Dubai (professional services is one of Red
Rock's sectors). Role recorded: **Accounts Payable clerk**. See `mock-workplace/README.md`.

- **4 apps, each in its own tab:** Meridian Mail (inbox, document viewer, downloads, compose), LedgerPoint
  (bills, approvals, suppliers), ProcureHub (POs with live remaining balance), AP Tracker (spreadsheet).
- **Three processes mixed together:** invoice entry, supplier payment queries, new-supplier onboarding.
- **25 inbox emails:** 9 clean invoices, 7 with planted problems, 4 payment queries, 1 onboarding request, noise.
- **10 planted problems** (answer key on the launcher): wrong VAT, duplicate, over AED 25k approval limit, over PO
  balance, missing PO, unregistered supplier, wrong company name, bill stuck in approval, "lost" invoice, new supplier.
- **Auto-replies** from the Finance Manager (approval codes only by LP reference) and suppliers (corrected invoices,
  company documents), which create realistic waiting and rework.
- **3 personas** for variation: Sara (fast), Omar (careful), Lina (new, makes mistakes).
- **Recorder hooks:** `data-app`, `data-screen`, `data-field`, `data-action`, entity ids, descriptive page titles.

---

## 4. Data contracts (agree before writing more code)

Fake examples of each live in `contracts/`. Both people build against these until real data exists.

### 4.1 `events.jsonl` (recorder → server), one JSON object per line

```json
{"t": 1729412534.21, "session": "lina-01", "seq": 142, "type": "click",
 "app": "ledgerpoint", "screen": "new-bill", "url": "/ledgerpoint/bills/new", "title": "New bill – LedgerPoint",
 "target": {"action": "submit-bill", "field": null, "text": "Submit bill", "entity": {}, "box": [812, 640, 90, 32]},
 "frame": "f_0142.jpg"}
```

| `type` | Extra fields | Notes |
|---|---|---|
| `click` | `target`, `frame_after` | from nearest element with `data-action`/`data-field`; `frame_after` = screenshot ~300 ms later |
| `input` | `target.field`, `value_length`, `value_kind` (`number`/`text`/`date`/`empty`) | **never the value** |
| `change` | `target`, `value_kind` | selects, checkboxes, date pickers |
| `copy` / `paste` | `target`, `text_length` | copy source = current `app` + `screen` + field |
| `keyburst` | `target`, `count` | ≥3 Backspace/Delete in a row → rework signal |
| `navigate` | `url`, `title` | SPA route changes |
| `tab_switch` | `from_app`, `to_app` | from `chrome.tabs.onActivated` / window focus (`outside` = left Chrome) |
| `idle` | `seconds` | ≥20 s with no events |
| `session_start` / `session_end` | `persona` | from popup |

### 4.2 `steps.json` (pipeline stage 4b output)

```json
{"id": "lina-01:s037", "session": "lina-01", "start": 1729412530.0, "end": 1729412536.5,
 "app": "ledgerpoint", "action": "enter_field", "object": "VAT amount",
 "source_app": "mail", "description": "Typed VAT amount from invoice SFM-INV-55117 into New Bill form",
 "entities": {"invoice": "SFM-INV-55117", "supplier": "Skyline Facilities Management LLC"},
 "flags": ["rework"], "event_seqs": [140, 141, 142], "frames": ["f_0141.jpg", "f_0142.jpg"]}
```

Flags: `rework`, `wait`, `approval_seeking`, `exception`, `lookup`, `copy_paste`, `app_switch`.

### 4.3 `processes.json`

```json
{"processes": [{
  "id": "p1", "name": "Supplier invoice entry",
  "canonical_steps": ["Open invoice email", "Download PDF", "Look up PO", "Enter bill", "Attach PDF", "Submit", "Log in tracker"],
  "instances": [{"session": "lina-01", "step_ids": ["lina-01:s012", "..."], "outcome": "completed"}],
  "variations": ["Omar always checks the PO balance in ProcureHub first"],
  "exceptions": [{"type": "vat_mismatch", "step_ids": ["..."], "description": "..."}],
  "approval_points": [{"description": "Bills > AED 25,000 need Finance Manager code", "step_ids": ["..."]}],
  "automation_fit": {"score": "high", "reasons": ["structured PDF input", "same 7 steps every time"], "judgment_calls": ["VAT mismatch handling"]}
}]}
```

### 4.4 `costs.json` (computed in Python, never by the model)

```json
{"p1": {"instances_observed": 9, "observed_minutes": 31.5, "avg_minutes": 3.5,
  "monthly": {"manual": 4620.0, "rework": 610.0, "checking": 900.0, "total": 6130.0},
  "formulas": {"manual": "9 per 8 min observed → est. 380/month × 3.5 min × AED 60/h ÷ 60"},
  "assumptions": {"hourly_rate": 60, "monthly_volume": 380, "checking_minutes_per_item": 2.5}}}
```

### 4.5 `interview_plan.json`

```json
{"sections": [{"title": "Confirm volume", "questions": [{
  "question": "Lina processed 9 invoices in 8 minutes. Is that a typical pace, and what happens at month-end?",
  "hypothesis": "Invoice entry is ~380/month and peaks at month-end",
  "why": "Volume drives 70% of the estimated saving",
  "evidence": ["lina-01:s012", "lina-01:s044"]}]}]}
```

Sections: *Confirm volume* · *Explain exceptions* · *Find what we didn't see* · *Approval & risk*.

---

## 5. Component 2: Recorder (Chrome extension, MV3) + ingest server

See `recorder/README.md` for setup and the full event reference.

- **content.js** (injected only into `http://localhost:5173/*`):
  - Capture-phase listeners for `click`, `input` (one event per field after a 600 ms pause), `change`,
    `copy`, `paste`, and Backspace/Delete bursts (`keyburst`, ≥3 in a row).
  - Resolves the target via `closest('[data-action],[data-field]')`, then reads `data-app`, `data-screen`,
    entity attributes, visible text (≤80 chars, never for inputs) and the bounding box.
  - **Never records typed values**, only length and kind (`number` / `text` / `date` / `empty`).
- **background.js** (service worker):
  - Assigns `seq` + `session`, detects `navigate` (`webNavigation.onHistoryStateUpdated`), `tab_switch`
    (`tabs.onActivated`, window focus) and `idle` (≥20 s gap).
  - Screenshots with `chrome.tabs.captureVisibleTab` (JPEG): every 2 s and ~300 ms after each click, ≤2/s,
    only when the active tab is the workplace. Events carry `frame` (latest screenshot) and clicks also `frame_after`.
  - Batches to `POST http://localhost:8000/ingest/{session}` every 2 s, keeps and retries batches if the server is down.
- **popup**: persona, session id (`lina-01`), Start/Stop, live counters, server status.
- **server/** (FastAPI): `/ingest/{session}`, `/sessions/{session}/end`, `/sessions`, and a **checking page** at
  `/sessions/{session}/view` (event timeline with screenshots).

**Done when:** a 2-minute session produces a readable `events.jsonl` + frames, with every click mapped to a `data-action`.

---

## 6. Component 3: The agent pipeline (the core)

> **Minimal demo mode (what we build).** This is a demo for judges, so we keep API spend to ~$5–10 in total:
> the agent works mainly from the **event log as text** (the workplace's `data-*` labels make events
> self-explanatory), plus a **handful of key screenshots** (e.g. the invoice when checking VAT). All screenshots
> are still recorded and shown in the dashboard as evidence; they just aren't all sent to the model.
> Pitch line: *"In this prototype the agent works from interaction logs and key screenshots; on real client
> software without labels it would lean more on reading the screens."*

```
events (+ a few frames) → 4a clean → 4b steps (Claude, text + few images) → 4c stats (Python)
                        → 4d processes (Claude, text) → 4e costs (Python) → 4f interview plan (Claude)
```

### 4a. Clean (no AI)
- Merge consecutive `input` events on the same field, drop noise (clicks with no label on empty space).
- Cut each session into **segments** at `navigate`, `tab_switch`, `submit-*` clicks, and `idle`.
- Pick **key frames** only where the model needs to see content: document views (`data-screen="mail-document"`),
  validation errors/warnings, and the screen right after a submit. Target ≤10 images per session.

### 4b. Step extraction (Claude, events as text + key frames)
- Few calls per session (batch several segments per call), structured outputs:

```python
from pydantic import BaseModel
import anthropic

class Step(BaseModel):
    first_event_seq: int
    last_event_seq: int
    app: str
    action: str
    object: str
    source_app: str | None
    description: str
    entities: dict[str, str]
    flags: list[str]

class SessionSteps(BaseModel):
    steps: list[Step]

client = anthropic.AsyncAnthropic()

resp = await client.messages.parse(
    model="claude-opus-5-5",
    max_tokens=16000,
    system=STEP_SYSTEM_PROMPT,            # fixed text → cacheable
    messages=[{"role": "user", "content": [
        *[{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}}
          for b64 in key_frames],          # ≤10 per session
        {"type": "text", "text": f"Key frames (in order): {frame_names}\n\nEvents:\n{events_text}"},
    ]}],
    output_format=SessionSteps,
)
steps = resp.parsed_output.steps
```

- Python assigns step ids and start/end times **from the event seqs**, so the model never invents timestamps.
- **Cache 4b output to disk**; later stages are tuned against the cached steps.

### 4c. Stats (Python only)
- Per step: duration. Per session: app switches/hour, copy→paste pairs across apps, idle time.
- **Rework:** `keyburst`s, the same field edited ≥2×, validation errors followed by edits, "Go back and fix".
- **Waits:** idle periods, especially after sending an email to the manager.

### 4d. Process finding (Claude, text only, one call)
- Input: all steps from all sessions (no images) + stats.
- Output: `processes.json` (structured outputs).
- **Validate in code:** every step id exists, instances don't overlap, every step appears in ≤1 instance.
  If validation fails, send the errors back once ("fix these") and re-parse.

### 4e. Costs (Python only)
- `manual = monthly_volume × avg_minutes × hourly_rate / 60`
- `rework = monthly_volume × rework_minutes_per_instance × hourly_rate / 60`
- `checking = monthly_volume × checking_minutes × manager_rate / 60` (an assumption to confirm in the interview)
- Monthly volume is extrapolated from the observed rate and clearly labelled as an assumption.
- Store the formula strings next to every number. Defaults (editable in the dashboard): AED 60/h clerk, AED 150/h manager.

### 4f. Interview plan (Claude, one call)
- Input: processes, costs, anomalies, stats.
- Output: `interview_plan.json`. Every question needs a hypothesis, a reason, and ≥1 evidence step id.
- Validate the evidence ids in code.

### 4g. Stretch: agent spec for automation #1
- For the top-ranked process: inputs, step-by-step automation, systems touched, which steps the agent does
  alone, **which require human approval**, exception handling, and the expected monthly saving.

### API
- `POST /analyze/{batch}` runs everything and caches the output to `data/results/{batch}/`.
- `GET /results/{batch}` returns all JSON. `GET /frames/{session}/{frame}` serves screenshots.
- **The demo always runs from a cached "golden" result.**

### Model & cost (minimal demo mode)
- `claude-opus-5-5` for all stages, with adaptive thinking for 4d and 4f. `claude-sonnet-5-5` (half the price) is
  the fallback if needed.
- Recordings: **2–3 sessions of ~5 minutes**.
- One full run ≈ **$0.20–0.50** (mostly text, ≤10 images per session).
- All testing until it works ≈ **$5**. Load **$10** of API credit. Develop on one short session first; tune later
  stages against cached 4b output.
- The live demo uses the saved golden run, so **no API key is needed on stage**.

### Quality rules
- **Claude names and interprets. Python counts and computes.**
- Every claim in the outputs links to evidence step ids, which link to frames.

---

## 7. Component 4: Dashboard

React + Vite. Three views:

1. **Recordings:** one timeline row per session, steps as blocks coloured by process, red outline = rework,
   yellow = wait.
2. **Processes:** a Mermaid process map + the ranked "automate first" table
   (*Invoice entry · 3/3 people · 9/8 min · AED 6,130/mo · fit: high*). Clicking a $ figure shows the formula
   and editable assumptions.
3. **Interview plan:** a printable consultant brief with Export to PDF. Each question links to its evidence.

**Evidence side panel** (available everywhere): click any step or claim to see its screenshots with the click
point highlighted (from the event `box`).

---

## 8. Team split (2 people)

| | Person 1: "Capture + Show" | Person 2: "Brain" |
|---|---|---|
| Owns | Mock workplace ✅, recorder, dashboard, pitch | FastAPI server, whole pipeline, prompts |
| Stack | React / TS / Chrome extension | Python / Claude API |

---

## 9. Timeline

Most of the product must exist **before** the hackathon.

### Before the hackathon

| Phase | Person 1 | Person 2 |
|---|---|---|
| **0. Contracts** (together, ~2 h) | Write `contracts/*.json` examples, agree the formats | same |
| **1** | Recorder extension + popup | FastAPI `/ingest`, 4a clean, 4b steps on hand-made data |
| **2** | Test recorder on the workplace; fix event mapping | 4c stats, 4d processes + validation |
| **3** (together) | **Record 2–3 sessions:** Sara, Omar, Lina (~5 min each, normal reply speed) | Check the data immediately |
| **4** | Dashboard on fake data: timeline, process list, interview view | 4e costs, 4f interview plan on real data |
| **5** | Connect dashboard to API, evidence panel, Mermaid map | Prompt tuning until outputs are specific |
| **6** | Pitch slides v1 | Save a golden run |

**Checkpoints**
- After phase 1: 4b produces sensible steps from real screenshots. If not, Person 2 drops everything to fix it.
- After phase 3: recordings are complete and readable. Fallback: screenshots every 3 s + a manual event log.
- After phase 5: a full run produces processes, costs and an interview plan end-to-end. From then on, polish only.

### At the hackathon
- Polish, the stretch goal (agent spec for #1), record a backup demo video, rehearse the 3-minute demo 3+ times.

---

## 10. The 3-minute demo

1. **Problem (20 s):** "Red Rock's discovery sessions start from a blank whiteboard, and people can't accurately
   describe their own work."
2. **Recordings (30 s):** three AP clerks at Meridian Advisory, shown on a timeline.
3. **What the agent found (60 s):** process map + "Invoice entry: 3/3 people, AED X/month". Click a claim to show
   the screenshot evidence. Show that it caught the VAT error, the duplicate, and the PO overrun.
4. **Interview plan (45 s):** "Here's what the consultant asks tomorrow, and why." Highlight the approval question.
5. **Close (25 s):** *"We find what people do, so your consultants can ask why."* (+ agent spec if built)

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Step extraction is vague | Rich events (data-action, field names) in the prompt, test by end of phase 1 |
| `captureVisibleTab` throttling | Click-triggered + 2–3 s interval, ≤2/s |
| Model invents numbers | All maths in Python, model output validated against step ids |
| Live demo fails | Always present from the cached golden run, keep a backup video |
| API cost while tuning | Minimal mode (text-first), cache 4b output, re-run only the changed stages, ~$10 total |
| Privacy questions | Opt-in, field values never logged, deletion after analysis, Red Rock-hosted |
