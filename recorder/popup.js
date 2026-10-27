const SERVER = 'http://localhost:8000'
const $ = (id) => document.getElementById(id)
let sessions = []
let consentAt = null // when the checkbox was ticked; asked again for every new session
let wasRecording = false

const ask = (msg) => chrome.runtime.sendMessage(msg)

async function checkServer() {
  try {
    const res = await fetch(`${SERVER}/sessions`)
    sessions = await res.json()
    $('server').innerHTML = '<span class="ok">● Server running</span> (localhost:8000)'
    return true
  } catch {
    $('server').innerHTML = '<span class="bad">● Server not running.</span> Start it: <code>cd server && .venv/bin/uvicorn main:app --port 8000</code>'
    return false
  }
}

function suggestSessionId() {
  const p = $('persona').value
  const used = new Set(sessions.map((s) => s.session))
  let n = 1
  while (used.has(`${p}-${String(n).padStart(2, '0')}`)) n++
  $('session').value = `${p}-${String(n).padStart(2, '0')}`
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function render(state) {
  const on = state.recording
  const paused = on && state.paused
  $('dot').classList.toggle('on', on)
  $('dot').classList.toggle('paused', paused)
  $('heading').textContent = paused ? 'Paused' : on ? 'Recording…' : 'Discovery Recorder'
  $('setup').classList.toggle('hidden', on)
  $('running').classList.toggle('hidden', !on)
  // Privacy settings can't change mid-session: the participant agreed to these.
  for (const id of ['sites', 'screenshots', 'redactFields', 'redactDocuments', 'saveSettings']) $(id).disabled = on
  if (on) $('settingsMsg').textContent = 'Locked while recording.'
  else if (wasRecording) $('settingsMsg').textContent = ''
  if (wasRecording && !on) resetConsent()
  wasRecording = on
  if (on) {
    $('runSession').textContent = state.session
    $('runLabel').textContent = paused ? `Paused (${fmt(state.pausedTotal || 0)} so far)` : 'Recording'
    $('pause').textContent = paused ? '▶ Resume' : 'II Pause'
    $('events').textContent = state.eventCount
    $('frames').textContent = state.frameCount
    $('pending').textContent = state.pendingEvents + state.pendingFrames
    $('time').textContent = fmt(Math.floor((Date.now() - state.startedAt) / 1000))
    $('viewLink').href = `${SERVER}/sessions/${state.session}/view`
  }
  $('error').textContent = state.lastError || ''
}

async function refresh() {
  const r = await ask({ kind: 'status' })
  if (r && r.state) render(r.state)
}

$('persona').addEventListener('change', suggestSessionId)

// ---------- consent ----------

function resetConsent() {
  consentAt = null
  $('consent').checked = false
  $('noticeBox').open = true
  $('noticeSummary').textContent = 'Before we start: please read'
  $('start').disabled = true
}

$('consent').addEventListener('change', () => {
  const agreed = $('consent').checked
  consentAt = agreed ? Date.now() : null
  $('start').disabled = !agreed
  $('noticeBox').open = !agreed
  $('noticeSummary').textContent = agreed ? 'Participant notice ✓ agreed' : 'Before we start: please read'
})

// ---------- privacy settings ----------

function showSettings(s) {
  $('sites').value = s.sites.join('\n')
  $('screenshots').checked = s.screenshots
  $('redactFields').checked = s.redactFields
  $('redactDocuments').checked = s.redactDocuments
}

async function loadSettings() {
  const r = await ask({ kind: 'getSettings' })
  if (r && r.settings) showSettings(r.settings)
}

$('saveSettings').addEventListener('click', async () => {
  const r = await ask({
    kind: 'saveSettings',
    settings: {
      sites: $('sites').value.split('\n'),
      screenshots: $('screenshots').checked,
      redactFields: $('redactFields').checked,
      redactDocuments: $('redactDocuments').checked,
    },
  })
  if (!r || !r.ok) {
    $('settingsMsg').textContent = (r && r.error) || 'Could not save.'
    return
  }
  showSettings(r.settings)
  $('settingsMsg').textContent = r.invalid.length
    ? `Saved. Ignored (not a valid site pattern): ${r.invalid.join(', ')}`
    : r.settings.sites.length ? 'Saved.' : 'Saved. No sites listed, so nothing will be recorded.'
})

$('pause').addEventListener('click', async () => {
  const r = await ask({ kind: $('pause').textContent.includes('Resume') ? 'resume' : 'pause' })
  if (r && r.state) render(r.state)
})

$('start').addEventListener('click', async () => {
  const session = $('session').value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(session)) {
    $('error').textContent = 'Session ID: lowercase letters, digits and dashes only, e.g. lina-01'
    return
  }
  if (sessions.some((s) => s.session === session)) {
    $('error').textContent = `${session} already exists. Pick another ID so recordings don't mix.`
    return
  }
  if (!consentAt || !$('consent').checked) {
    $('error').textContent = 'Please read the notice and tick the box first.'
    return
  }
  if (!(await checkServer())) {
    $('error').textContent = 'Start the server first, otherwise nothing gets saved.'
    return
  }
  const r = await ask({ kind: 'start', session, persona: $('persona').value, consent: { agreed: true, at: consentAt } })
  if (r && r.error) $('error').textContent = r.error
  if (r && r.state) render(r.state)
})

$('stop').addEventListener('click', async () => {
  $('stop').textContent = 'Saving…'
  $('stop').disabled = true
  const r = await ask({ kind: 'stop' })
  $('stop').textContent = '■ Stop & save'
  $('stop').disabled = false
  await checkServer()
  suggestSessionId()
  if (r && r.state) {
    render(r.state)
    $('viewLink').href = `${SERVER}/sessions/${r.state.session}/view`
    $('viewLink').textContent = `Check recording ${r.state.session} →`
  }
})

;(async () => {
  await checkServer()
  suggestSessionId()
  await loadSettings()
  await refresh()
  setInterval(refresh, 1000)
})()
