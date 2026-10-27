// Discovery Recorder: background service worker.
// Numbers events, takes (redacted) screenshots, detects page changes / tab switches / idle, and uploads batches.
// Only sites on the allow-list are ever recorded or screenshotted.

const WORKPLACE = 'http://localhost:5173' // the mock workplace keeps its own app naming
const SERVER = 'http://localhost:8000'
const SHOT_EVERY_MS = 2000 // timeline screenshot interval
const SHOT_AFTER_CLICK_MS = 300 // capture the result of a click
const MIN_SHOT_GAP_MS = 550 // Chrome allows ~2 captures per second
const FLUSH_EVERY_MS = 2000
const IDLE_AFTER_MS = 20000
const JPEG_QUALITY = 60
const REDACT_TIMEOUT_MS = 150 // no answer from the page in time = no screenshot
const SCRIPT_ID = 'recorder'
const NOTICE_VERSION = '1'

const DEFAULT_SETTINGS = {
  sites: [`${WORKPLACE}/*`],
  redactFields: true, // black out form fields in screenshots
  redactDocuments: false, // also black out [data-redact] (document text, e.g. the mock invoice viewer)
  screenshots: true,
}

// ---------- state (persisted so a worker restart doesn't lose the session) ----------

let state = {
  recording: false,
  paused: false,
  pausedAt: null,
  pausedSeconds: 0,
  session: null,
  persona: null,
  consent: null,
  startedAt: null,
  seq: 0,
  frameSeq: 0,
  eventCount: 0,
  frameCount: 0,
  lastActivity: null,
  lastFrame: null,
  lastApp: null,
  serverOk: null,
  lastError: null,
}
let settings = { ...DEFAULT_SETTINGS } // chrome.storage.local, survives restarts
const queue = { events: [], frames: [] } // not yet uploaded
let lastShotAt = 0
let shotTimer = null
let flushTimer = null
let flushing = false

const ready = Promise.all([chrome.storage.session.get('state'), chrome.storage.local.get('settings')]).then(([s, l]) => {
  if (s.state) state = { ...state, ...s.state }
  if (l.settings) settings = cleanSettings(l.settings).settings
  if (state.recording) startTimers()
  updateBadge()
})

function persist() {
  return chrome.storage.session.set({ state })
}

// ---------- allow-list (Chrome match patterns: scheme://host[:port]/path, "*" wildcards) ----------

const PATTERN_RE = /^(\*|https?):\/\/(\*\.[^/*:]+|[^/*:]+)(?::(\d+|\*))?(\/.*)$/

function parsePattern(p) {
  const m = PATTERN_RE.exec(p)
  if (!m) return null
  const glob = (s) => new RegExp('^' + s.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
  return { scheme: m[1], host: m[2].toLowerCase(), port: m[3] || '*', path: glob(m[4]) }
}

function matches(pattern, url) {
  const p = parsePattern(pattern)
  if (!p) return false
  let u
  try { u = new URL(url) } catch { return false }
  const scheme = u.protocol.slice(0, -1)
  if (p.scheme === '*' ? !['http', 'https'].includes(scheme) : p.scheme !== scheme) return false
  const host = u.hostname.toLowerCase()
  if (p.host.startsWith('*.')) {
    const base = p.host.slice(2)
    if (host !== base && !host.endsWith('.' + base)) return false
  } else if (p.host !== host) return false
  if (p.port !== '*' && p.port !== (u.port || (scheme === 'https' ? '443' : '80'))) return false
  return p.path.test(u.pathname + u.search)
}

const isAllowed = (url) => typeof url === 'string' && settings.sites.some((p) => matches(p, url))

// Keeps valid patterns; "record everything" patterns are refused on purpose.
function cleanSettings(raw) {
  const sites = []
  const invalid = []
  for (const s of (raw.sites || []).map((x) => String(x).trim()).filter(Boolean)) {
    if (!PATTERN_RE.test(s) || /^[^:]+:\/\/\*(?::|\/)/.test(s)) invalid.push(s)
    else if (!sites.includes(s)) sites.push(s)
  }
  const bool = (k) => (typeof raw[k] === 'boolean' ? raw[k] : DEFAULT_SETTINGS[k])
  return {
    settings: { sites, redactFields: bool('redactFields'), redactDocuments: bool('redactDocuments'), screenshots: bool('screenshots') },
    invalid,
  }
}

// ---------- content script registration (follows the allow-list) ----------

let syncing = Promise.resolve()

function syncContentScripts(injectOpenTabs) {
  syncing = syncing
    .then(async () => {
      await ready
      const def = { id: SCRIPT_ID, matches: settings.sites, js: ['content.js'], runAt: 'document_idle', allFrames: false }
      const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
      if (!settings.sites.length) {
        if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })
        return
      }
      if (existing.length) await chrome.scripting.updateContentScripts([def])
      else {
        try {
          await chrome.scripting.registerContentScripts([def])
        } catch {
          // Registered by a parallel worker start: replace it.
          await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {})
          await chrome.scripting.registerContentScripts([def])
        }
      }
      if (!injectOpenTabs) return
      // Registered scripts only run on new page loads, so also inject into tabs that are already open.
      // content.js ignores a second copy.
      for (const tab of await chrome.tabs.query({})) {
        if (isAllowed(tab.url)) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {})
      }
    })
    .catch((err) => {
      state.lastError = `content scripts: ${err.message || err}`
    })
  return syncing
}

chrome.runtime.onInstalled.addListener(() => syncContentScripts(true))
chrome.runtime.onStartup.addListener(() => syncContentScripts(false))

// ---------- helpers ----------

// Ids, uuids and emails in a path become ":id" so screens group together and no values leak.
function cleanPath(path) {
  return (
    path
      .split('/')
      .map((s) => (/^\d+$|^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{12,}$|@|^(?=.*\d)[\w-]{8,}$/i.test(s) ? ':id' : s))
      .join('/') || '/'
  )
}

function appFromUrl(url) {
  if (!isAllowed(url)) return 'outside'
  const u = new URL(url)
  if (u.origin !== WORKPLACE) return u.hostname.replace(/^www\./, '')
  const seg = u.pathname.split('/')[1]
  return seg || 'launcher'
}

// The mock workplace keeps the full path + query; real sites only get a cleaned path.
function urlForEvent(url, withSearch) {
  const u = new URL(url)
  if (u.origin === WORKPLACE) return u.pathname + (withSearch ? u.search : '')
  return cleanPath(u.pathname)
}

function addEvent(event) {
  if (!state.recording || state.paused) return null
  const now = event.t || Date.now()
  const isActivity = !['idle', 'session_start', 'session_end'].includes(event.type)
  if (isActivity && state.lastActivity && now - state.lastActivity >= IDLE_AFTER_MS) {
    pushEvent({ t: state.lastActivity + 1, type: 'idle', seconds: Math.round((now - state.lastActivity) / 1000), app: state.lastApp })
  }
  if (isActivity) state.lastActivity = now
  return pushEvent({ ...event, t: now })
}

function pushEvent(event) {
  const e = { seq: ++state.seq, session: state.session, ...event, frame: event.frame || state.lastFrame }
  queue.events.push(e)
  state.eventCount++
  if (e.app) state.lastApp = e.app // includes 'outside' after leaving Chrome, so coming back is recorded
  persist()
  return e
}

// ---------- badge on the toolbar icon and on recorded pages ----------

function updateBadge() {
  const text = !state.recording ? '' : state.paused ? 'II' : 'REC'
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color: state.paused ? '#6b7280' : '#dc2626' })
}

function pageState(tab) {
  return { recording: state.recording, paused: state.paused, allowed: !!tab && isAllowed(tab.url) }
}

async function broadcast() {
  updateBadge()
  for (const tab of await chrome.tabs.query({})) {
    if (isAllowed(tab.url)) chrome.tabs.sendMessage(tab.id, { kind: 'recorderState', ...pageState(tab) }).catch(() => {})
  }
}

// ---------- screenshots (redacted before upload) ----------

// Asks the page where its form fields / private areas are. null = no answer in time.
async function askRedaction(tabId) {
  const req = chrome.tabs.sendMessage(
    tabId,
    { kind: 'redactRects', fields: settings.redactFields, documents: settings.redactDocuments },
    { frameId: 0 },
  )
  const timeout = new Promise((r) => setTimeout(() => r(null), REDACT_TIMEOUT_MS))
  try {
    const answer = await Promise.race([req, timeout])
    return answer && Array.isArray(answer.rects) ? answer : null
  } catch {
    return null // no content script in this tab
  }
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// Paints dark boxes over the given rectangles (CSS px) and re-encodes the JPEG.
async function redact(dataUrl, info) {
  if (!info.rects.length) return { b64: dataUrl.split(',')[1], boxes: 0 }
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const scale = info.vw ? bmp.width / info.vw : info.dpr || 1 // screenshot px per CSS px (includes page zoom)
  const canvas = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  ctx.font = `${Math.round(10 * scale)}px sans-serif`
  ctx.textBaseline = 'middle'
  for (const [x, y, w, h] of info.rects) {
    const box = [x * scale, y * scale, w * scale, h * scale].map(Math.round)
    ctx.fillStyle = '#3f444b'
    ctx.fillRect(...box)
    if (w >= 40 && h >= 12) {
      ctx.fillStyle = '#9aa0a6'
      ctx.fillText('hidden', box[0] + 4 * scale, box[1] + box[3] / 2)
    }
  }
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY / 100 })
  return { b64: toBase64(await blob.arrayBuffer()), boxes: info.rects.length }
}

async function captureNow(reason) {
  if (!state.recording || state.paused || !settings.screenshots) return null
  const now = Date.now()
  if (now - lastShotAt < MIN_SHOT_GAP_MS) return null
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab || !isAllowed(tab.url)) return null
  lastShotAt = now
  const hide = await askRedaction(tab.id)
  if (!hide) {
    // Fail closed: never upload a screenshot we could not redact.
    state.lastError = 'screenshot skipped: page did not answer (reload the tab)'
    return null
  }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: JPEG_QUALITY })
    const { b64, boxes } = await redact(dataUrl, hide)
    if (!state.recording || state.paused) return null // paused/stopped while capturing
    const name = `f_${String(++state.frameSeq).padStart(4, '0')}.jpg`
    queue.frames.push({ name, t: now, b64, app: appFromUrl(tab.url), reason, redacted: boxes })
    state.frameCount++
    state.lastFrame = name
    persist()
    return name
  } catch (err) {
    // Happens when the window is minimised, a DevTools window is focused, or too many captures per second.
    state.lastError = `screenshot: ${err.message || err}`
    return null
  }
}

function startTimers() {
  stopTimers()
  shotTimer = setInterval(() => captureNow('interval'), SHOT_EVERY_MS)
  flushTimer = setInterval(flush, FLUSH_EVERY_MS)
  // Wakes the worker if Chrome shut it down; the interval timers are restarted on wake (see `ready`).
  chrome.alarms.create('keepalive', { periodInMinutes: 0.5 })
}

function stopTimers() {
  clearInterval(shotTimer)
  clearInterval(flushTimer)
  shotTimer = flushTimer = null
  chrome.alarms.clear('keepalive')
}

chrome.alarms.onAlarm.addListener(async (a) => {
  await ready
  if (a.name === 'keepalive' && state.recording && !shotTimer) startTimers()
})

// ---------- upload ----------

async function flush() {
  if (flushing || (!queue.events.length && !queue.frames.length) || !state.session) return
  flushing = true
  const batch = { events: queue.events.slice(), frames: queue.frames.slice() }
  try {
    const res = await fetch(`${SERVER}/ingest/${state.session}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (!res.ok) throw new Error(`server said ${res.status}: ${(await res.text()).slice(0, 200)}`)
    queue.events.splice(0, batch.events.length)
    queue.frames.splice(0, batch.frames.length)
    state.serverOk = true
    state.lastError = null
  } catch (err) {
    // Keep the batch; it is retried on the next flush.
    state.serverOk = false
    state.lastError = `upload: ${err.message || err}`
  } finally {
    flushing = false
    persist()
  }
}

// ---------- start / pause / resume / stop ----------

async function start(session, persona, consent) {
  await ready
  if (state.recording) await stop()
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  state = {
    ...state,
    recording: true, paused: false, pausedAt: null, pausedSeconds: 0,
    session, persona, startedAt: Date.now(),
    consent: { agreed: true, at: consent.at || Date.now(), notice_version: NOTICE_VERSION },
    seq: 0, frameSeq: 0, eventCount: 0, frameCount: 0,
    lastActivity: Date.now(), lastFrame: null, lastApp: tab ? appFromUrl(tab.url) : null, lastError: null,
  }
  queue.events.length = 0
  queue.frames.length = 0
  lastShotAt = 0
  await persist()
  pushEvent({
    t: Date.now(), type: 'session_start', persona, consent: state.consent, app: state.lastApp,
    url: tab && isAllowed(tab.url) ? urlForEvent(tab.url, false) : null,
  })
  startTimers()
  broadcast()
  await captureNow('start')
}

async function pause() {
  await ready
  if (!state.recording || state.paused) return
  addEvent({ t: Date.now(), type: 'pause' }) // recorded before pausing so idle time before it still counts
  state.paused = true
  state.pausedAt = Date.now()
  await persist()
  broadcast()
}

async function resume() {
  await ready
  if (!state.recording || !state.paused) return
  const now = Date.now()
  const seconds = Math.round((now - state.pausedAt) / 1000)
  state.pausedSeconds += seconds
  state.paused = false
  state.pausedAt = null
  state.lastActivity = now // a pause is not idle time
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (tab) state.lastApp = appFromUrl(tab.url) // the person may have switched apps while paused
  addEvent({ t: now, type: 'resume', seconds })
  await persist()
  broadcast()
}

async function stop() {
  await ready
  if (!state.recording) return
  await captureNow('stop') // skipped while paused
  if (state.paused) {
    state.pausedSeconds += Math.round((Date.now() - state.pausedAt) / 1000)
    state.paused = false
    state.pausedAt = null
  }
  pushEvent({ t: Date.now(), type: 'session_end', persona: state.persona, app: state.lastApp })
  state.recording = false
  stopTimers()
  broadcast()
  // Upload everything that's left, retrying a few times.
  for (let i = 0; i < 5 && (queue.events.length || queue.frames.length); i++) {
    await flush()
    if (queue.events.length || queue.frames.length) await new Promise((r) => setTimeout(r, 1000))
  }
  try {
    await fetch(`${SERVER}/sessions/${state.session}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        persona: state.persona, started_at: state.startedAt, ended_at: Date.now(),
        event_count: state.eventCount, frame_count: state.frameCount,
        consent: state.consent,
        paused_seconds: state.pausedSeconds,
        allowed_sites: settings.sites, // locked while recording, so these are the session's sites
        redaction: { fields: settings.redactFields, documents: settings.redactDocuments, screenshots: settings.screenshots },
      }),
    })
  } catch (err) {
    state.lastError = `end: ${err.message || err}`
  }
  await persist()
}

async function saveSettings(raw) {
  await ready
  if (state.recording) return { ok: false, error: 'Settings are locked while recording.' }
  const { settings: next, invalid } = cleanSettings(raw)
  settings = next
  await chrome.storage.local.set({ settings })
  await syncContentScripts(true)
  return { ok: true, settings, invalid }
}

// ---------- messages from content scripts and the popup ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  ;(async () => {
    await ready
    if (msg.kind === 'event') {
      if (!state.recording || !sender.tab || !isAllowed(sender.tab.url)) return reply({ ok: false })
      const event = { ...msg.event, tab_id: sender.tab.id }
      if (event.app === undefined || event.app === null) {
        if (new URL(sender.tab.url).origin !== WORKPLACE) event.app = appFromUrl(sender.tab.url)
      }
      const e = addEvent(event)
      if (e && msg.event.type === 'click') {
        const shoot = async (retry) => {
          const name = await captureNow('click')
          if (name) e.frame_after = name // still in the queue unless already uploaded
          else if (retry) setTimeout(() => shoot(false), MIN_SHOT_GAP_MS) // throttled: try once more
        }
        setTimeout(() => shoot(true), SHOT_AFTER_CLICK_MS)
      }
      return reply({ ok: !!e })
    }
    if (msg.kind === 'pageState') return reply(pageState(sender.tab))
    if (msg.kind === 'start') {
      if (!msg.consent || msg.consent.agreed !== true) return reply({ ok: false, error: 'Consent is required before recording.' })
      await start(msg.session, msg.persona, msg.consent)
      return reply({ ok: true, state: publicState() })
    }
    if (msg.kind === 'pause') {
      await pause()
      return reply({ ok: true, state: publicState() })
    }
    if (msg.kind === 'resume') {
      await resume()
      return reply({ ok: true, state: publicState() })
    }
    if (msg.kind === 'stop') {
      await stop()
      return reply({ ok: true, state: publicState() })
    }
    if (msg.kind === 'status') return reply({ ok: true, state: publicState() })
    if (msg.kind === 'getSettings') return reply({ ok: true, settings, defaults: DEFAULT_SETTINGS })
    if (msg.kind === 'saveSettings') return reply(await saveSettings(msg.settings || {}))
    reply({ ok: false })
  })()
  return true // async reply
})

function publicState() {
  const pausedNow = state.paused && state.pausedAt ? Math.round((Date.now() - state.pausedAt) / 1000) : 0
  return {
    ...state, pausedTotal: state.pausedSeconds + pausedNow,
    pendingEvents: queue.events.length, pendingFrames: queue.frames.length,
  }
}

// ---------- page changes, tab switches, leaving Chrome ----------

chrome.webNavigation.onHistoryStateUpdated.addListener(async (d) => {
  await ready
  if (!state.recording || d.frameId !== 0 || !isAllowed(d.url)) return
  // The app sets document.title in an effect, so read it a moment later.
  setTimeout(async () => {
    let title = ''
    try { title = (await chrome.tabs.get(d.tabId)).title || '' } catch { /* tab closed */ }
    addEvent({ t: Date.now(), type: 'navigate', app: appFromUrl(d.url), url: urlForEvent(d.url, true), title, tab_id: d.tabId })
    setTimeout(() => captureNow('navigate'), 150)
  }, 250)
})

chrome.webNavigation.onCompleted.addListener(async (d) => {
  await ready
  if (!state.recording || d.frameId !== 0) return
  let tab = null
  try { tab = await chrome.tabs.get(d.tabId) } catch { /* tab closed */ }
  if (!isAllowed(d.url)) {
    // The active tab went to a site that isn't on the list: that counts as leaving the work apps.
    if (tab && tab.active && state.lastApp !== 'outside') {
      addEvent({ t: Date.now(), type: 'tab_switch', from_app: state.lastApp, to_app: 'outside', app: 'outside', tab_id: d.tabId })
    }
    return
  }
  addEvent({
    t: Date.now(), type: 'navigate', app: appFromUrl(d.url), url: urlForEvent(d.url, false),
    title: (tab && tab.title) || '', full_load: true, tab_id: d.tabId,
  })
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await ready
  if (!state.recording) return
  let tab
  try { tab = await chrome.tabs.get(tabId) } catch { return }
  const to = appFromUrl(tab.url)
  const from = state.lastApp
  if (to === from) return
  // Titles of tabs outside the allow-list are never recorded.
  addEvent({ t: Date.now(), type: 'tab_switch', from_app: from, to_app: to, app: to, title: to === 'outside' ? undefined : tab.title, tab_id: tabId })
  setTimeout(() => captureNow('tab_switch'), 200)
})

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await ready
  if (!state.recording) return
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    if (state.lastApp !== 'outside') addEvent({ t: Date.now(), type: 'tab_switch', from_app: state.lastApp, to_app: 'outside', app: 'outside' })
    return
  }
  const [tab] = await chrome.tabs.query({ active: true, windowId })
  if (!tab) return
  const to = appFromUrl(tab.url)
  if (to !== state.lastApp) {
    addEvent({ t: Date.now(), type: 'tab_switch', from_app: state.lastApp, to_app: to, app: to, title: to === 'outside' ? undefined : tab.title, tab_id: tab.id })
  }
})
