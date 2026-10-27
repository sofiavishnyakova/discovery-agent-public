// Discovery Recorder: content script.
// Runs inside every allowed tab (the mock workplace by default) and turns what the person does into events.
// It NEVER records typed values: only field names, lengths and kinds.
// It also shows the on-page recording badge and tells the background which areas to black out in screenshots.
(() => {
  // A second copy (re-injection after the allow-list changes) does nothing while the first one is alive.
  // After an extension reload the old copy is orphaned (chrome.runtime.id is gone), so the new one takes over.
  const isAlive = () => {
    try { return !!chrome.runtime.id } catch { return false }
  }
  if (typeof window.__discoveryRecorderAlive === 'function' && window.__discoveryRecorderAlive()) return
  window.__discoveryRecorderAlive = isAlive
  window.__discoveryRecorderLoaded = true
  document.dispatchEvent(new CustomEvent('discovery-recorder-takeover'))

  const INPUT_PAUSE_MS = 600 // one `input` event per field after the person pauses typing
  const KEYBURST_GAP_MS = 1500 // deletes closer together than this count as one burst
  const KEYBURST_MIN = 3
  const ENTITY_ATTRS = ['emailId', 'docId', 'billRef', 'po', 'rowId', 'supplierId', 'invoiceNo', 'persona', 'targetApp']
  // The mock workplace labels everything with data-* attributes and keeps its exact old behaviour.
  // Other sites fall back to generic labels (hostname, cleaned path, button / field names).
  const MOCK = location.origin === 'http://localhost:5173'
  const CONTROL = 'button, a[href], [role=button], [role=link], [role=menuitem], [role=tab], input[type=button], input[type=submit], input[type=reset]'

  // ---------- describing elements ----------

  function nearest(el, selector) {
    return el && el.closest ? el.closest(selector) : null
  }

  // Short label: lowercase words joined by dashes; long numbers (ids, amounts) dropped.
  function slug(text) {
    return (text || '')
      .toLowerCase()
      .replace(/\d{3,}/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || null
  }

  // Ids, uuids and emails in a path become ":id". Hash routes (#/invoices/123) count as part of the path.
  function cleanPath() {
    const hash = location.hash.startsWith('#/') ? location.hash.slice(1).split('?')[0] : ''
    return (
      (location.pathname + hash)
        .split('/')
        .map((s) => (/^\d+$|^[0-9a-f]{8}-[0-9a-f]{4}-|^[0-9a-f]{12,}$|@|^(?=.*\d)[\w-]{8,}$/i.test(s) ? ':id' : s))
        .join('/') || '/'
    )
  }

  function screenOf(el) {
    const s = nearest(el, '[data-screen]')
    if (s) return s.dataset.screen
    const any = document.querySelector('[data-screen]')
    if (any) return any.dataset.screen
    return MOCK ? null : cleanPath()
  }

  function appOf(el) {
    const a = nearest(el, '[data-app]') || document.querySelector('[data-app]')
    if (a) return a.dataset.app
    return MOCK ? null : location.hostname.replace(/^www\./, '')
  }

  // Name of a button / link / menu item / tab from its aria-label or its own text.
  function controlLabel(el) {
    const c = nearest(el, CONTROL)
    if (!c) return null
    const text = c.getAttribute('aria-label') || c.getAttribute('title') || (c.tagName === 'INPUT' ? c.value : c.innerText)
    return slug((text || '').replace(/\s+/g, ' ').trim().slice(0, 60))
  }

  function isTypable(el) {
    return isFormField(el) || (el && el.isContentEditable)
  }

  // Name of a form field from its name / id / aria-label / placeholder / <label>. Never its value.
  function fieldName(el) {
    if (!isTypable(el)) return null
    let label = el.labels && el.labels[0] ? el.labels[0].innerText : ''
    const by = el.getAttribute('aria-labelledby')
    if (!label && by) label = by.split(/\s+/).map((id) => (document.getElementById(id) || {}).innerText || '').join(' ')
    return slug(el.getAttribute('name') || el.id || el.getAttribute('aria-label') || el.getAttribute('placeholder') || label)
  }

  function entitiesOf(el) {
    const out = {}
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (!n.dataset) continue
      for (const k of ENTITY_ATTRS) if (n.dataset[k] && !(k in out)) out[k] = n.dataset[k]
    }
    return out
  }

  function isFormField(el) {
    return el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
  }

  function visibleText(el) {
    if (!el || isFormField(el)) return ''
    const txt = (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim()
    return txt.slice(0, 80)
  }

  function describe(el) {
    if (!MOCK) return describeGeneric(el)
    const labelled = nearest(el, '[data-action],[data-field]')
    const t = labelled || el
    const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null
    return {
      action: labelled ? labelled.dataset.action || null : null,
      field: labelled ? labelled.dataset.field || null : null,
      tag: t ? t.tagName.toLowerCase() : null,
      input_type: t && t.tagName === 'INPUT' ? t.type : undefined,
      // Button/link labels are useful; data-field contents and document text (e.g. invoice amounts) are values, so skip them.
      text: (labelled && labelled.dataset.field) || nearest(el, '[data-redact]') ? '' : visibleText(t),
      entity: entitiesOf(el),
      box: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
    }
  }

  // Real web apps: data-* first, then generic labels. Only control labels are kept as text, never page text.
  function describeGeneric(el) {
    const labelled = nearest(el, '[data-action],[data-field]')
    const control = labelled ? null : nearest(el, CONTROL)
    const t = labelled || control || el
    const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null
    const action = labelled ? labelled.dataset.action || null : isTypable(el) ? null : controlLabel(el)
    const field = labelled ? labelled.dataset.field || null : fieldName(el)
    return {
      action,
      field,
      tag: t && t.tagName ? t.tagName.toLowerCase() : null,
      input_type: t && t.tagName === 'INPUT' ? t.type : undefined,
      text: action && !field ? action : '',
      entity: entitiesOf(el),
      box: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
    }
  }

  function valueKind(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? 'checked' : 'unchecked'
    if (el.tagName === 'SELECT') return el.selectedIndex > 0 ? 'option' : 'empty'
    const v = (el.value || '').trim()
    if (!v) return 'empty'
    if (el.type === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) return 'date'
    if (/^-?[\d\s.,]+$/.test(v) || /^aed\s*[\d.,]+$/i.test(v)) return 'number'
    if (/^[^@\s]+@[^@\s]+$/.test(v)) return 'email'
    return 'text'
  }

  // ---------- sending ----------

  function send(type, el, extra = {}) {
    if (dead || isBadge(el)) return // clicks on the recording badge are not work
    const event = {
      t: Date.now(),
      type,
      app: appOf(el),
      screen: screenOf(el),
      url: MOCK ? location.pathname + location.search : cleanPath(),
      title: document.title,
      viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
      ...(el ? { target: describe(el) } : {}),
      ...extra,
    }
    try {
      chrome.runtime.sendMessage({ kind: 'event', event }).catch(() => {})
    } catch {
      // Extension was reloaded: this old script can no longer talk to it. Reload the page.
    }
  }

  // ---------- typing ----------

  const pendingInputs = new Map() // element -> timer

  function flushInput(el) {
    const timer = pendingInputs.get(el)
    if (timer === undefined) return
    if (burst.el === el) endBurst() // a delete burst inside this field happened before the final value
    clearTimeout(timer)
    pendingInputs.delete(el)
    // Secret fields: record only that the person typed, never how much.
    if (isSecret(el)) return send('input', el, { value_kind: 'secret' })
    send('input', el, { value_length: (el.value || '').length, value_kind: valueKind(el) })
  }

  function isSecret(el) {
    return el.type === 'password' || !!(el.closest && el.closest('[data-private]')) ||
      /^(cc-|current-password|new-password|one-time-code)/.test(el.getAttribute('autocomplete') || '')
  }

  document.addEventListener(
    'input',
    (e) => {
      const el = e.target
      // Date inputs fire on every day/month/year segment, so they go through the same pause-then-record path.
      if (!isFormField(el) || el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') return
      clearTimeout(pendingInputs.get(el))
      pendingInputs.set(el, setTimeout(() => flushInput(el), INPUT_PAUSE_MS))
    },
    true,
  )

  document.addEventListener('blur', (e) => flushInput(e.target), true)

  document.addEventListener(
    'change',
    (e) => {
      const el = e.target
      if (!isFormField(el)) return
      if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') {
        send('change', el, { value_kind: valueKind(el) })
      }
    },
    true,
  )

  // ---------- deletes (rework signal) ----------

  let burst = { el: null, count: 0, timer: null }

  function endBurst() {
    clearTimeout(burst.timer)
    if (burst.count >= KEYBURST_MIN && burst.el && !isSecret(burst.el)) send('keyburst', burst.el, { count: burst.count })
    burst = { el: null, count: 0, timer: null }
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (burst.el && burst.el !== e.target) endBurst()
        burst.el = e.target
        burst.count += 1
        clearTimeout(burst.timer)
        burst.timer = setTimeout(endBurst, KEYBURST_GAP_MS)
      } else if (burst.count) {
        endBurst()
      }
      if (e.key === 'Enter' && isFormField(e.target)) flushInput(e.target)
    },
    true,
  )

  // ---------- clicks ----------

  document.addEventListener(
    'click',
    (e) => {
      // Finish any deleting/typing first so the order of events matches what happened.
      endBurst()
      for (const el of [...pendingInputs.keys()]) flushInput(el)
      send('click', e.target, { button: e.button, modifiers: [e.ctrlKey && 'ctrl', e.metaKey && 'meta', e.shiftKey && 'shift'].filter(Boolean) })
    },
    true,
  )

  // ---------- copy / paste ----------

  function selectionLength(el) {
    if (isFormField(el) && typeof el.selectionStart === 'number') return Math.max(0, el.selectionEnd - el.selectionStart)
    const sel = document.getSelection()
    return sel ? sel.toString().length : 0
  }

  document.addEventListener(
    'copy',
    (e) => {
      const sel = document.getSelection()
      let source = e.target
      if (!isFormField(source) && sel && sel.anchorNode) {
        source = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement
      }
      send('copy', source, { text_length: selectionLength(e.target) })
    },
    true,
  )

  document.addEventListener(
    'paste',
    (e) => {
      const text = e.clipboardData ? e.clipboardData.getData('text') : ''
      send('paste', e.target, isSecret(e.target) ? { secret: true } : { text_length: text.length })
    },
    true,
  )

  // ---------- on-screen messages (errors, warnings, confirmations) ----------
  // Apps show problems as alerts, banners and inline field errors. Recording their text lets plain code see
  // "Duplicate invoice…" or "Due date is before the invoice date" without any AI reading screenshots.
  const MESSAGE_SELECTOR = '[role="alert"], [role="alertdialog"], [aria-live="assertive"], .error, .field-error, .banner, .modal'
  const MESSAGE_DEDUPE_MS = 5000
  const recentMessages = new Map() // text -> last time sent

  function severityOf(el) {
    const c = `${el.className || ''} ${el.getAttribute('role') || ''}`.toLowerCase()
    if (/error|alert(?!dialog)/.test(c)) return 'error'
    if (/success/.test(c)) return 'success'
    if (/warn|modal|alertdialog/.test(c) || /⚠/.test(el.textContent || '')) return 'warning'
    return 'info'
  }

  function reportMessage(el) {
    if (!el.isConnected || el.offsetParent === null) return // not visible
    // A message inside a dialog/banner: report the outermost matching element once.
    const outer = el.parentElement && el.parentElement.closest(MESSAGE_SELECTOR)
    if (outer && outer !== el) return
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!text) return
    // Ordinary dialogs (file pickers, forms) aren't messages; only ones that warn or report an error are.
    if (el.matches('.modal') && !el.matches('[role="alertdialog"]') && !/⚠|warning|error|not valid|failed|duplicate|check/i.test(text)) return
    // Inline field errors sit next to their input: record which field they belong to.
    const holder = el.closest('label, .attach-row')
    const fieldEl = holder && holder.querySelector('[data-field]')
    const key = `${fieldEl ? fieldEl.dataset.field : ''}|${text}`
    const now = Date.now()
    if (now - (recentMessages.get(key) || 0) < MESSAGE_DEDUPE_MS) return
    recentMessages.set(key, now)
    send('message', el, { severity: severityOf(el), message: text, for_field: fieldEl ? fieldEl.dataset.field : null })
  }

  function scanForMessages(root) {
    if (!(root instanceof Element)) return
    if (root.matches(MESSAGE_SELECTOR)) reportMessage(root)
    root.querySelectorAll(MESSAGE_SELECTOR).forEach(reportMessage)
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') m.addedNodes.forEach(scanForMessages)
      else if (m.type === 'characterData' && m.target.parentElement) {
        const el = m.target.parentElement.closest(MESSAGE_SELECTOR)
        if (el) reportMessage(el)
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })

  // ---------- recording badge (Shadow DOM so the page's CSS can't touch it) ----------

  let dead = false // set when a newer copy of this script takes over
  let rec = { recording: false, paused: false, allowed: false }
  let badgeHost = null
  let badgeParts = null

  function isBadge(el) {
    return !!badgeHost && !!el && (el === badgeHost || badgeHost.contains(el))
  }

  function buildBadge() {
    badgeHost = document.createElement('div')
    badgeHost.id = 'discovery-recorder-badge'
    const root = badgeHost.attachShadow({ mode: 'closed' })
    root.innerHTML = `
      <style>
        :host { all: initial; position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; }
        .pill { display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 11px; border-radius: 999px;
          background: rgba(17, 24, 39, .88); color: #fff; font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          box-shadow: 0 2px 8px rgba(0, 0, 0, .25); user-select: none; }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: pulse 1.2s infinite; }
        .paused .dot { background: #9ca3af; animation: none; }
        @keyframes pulse { 50% { opacity: .35; } }
        button { all: unset; cursor: pointer; padding: 3px 9px; border-radius: 999px; background: rgba(255, 255, 255, .16); font-size: 11.5px; }
        button:hover { background: rgba(255, 255, 255, .28); }
      </style>
      <div class="pill"><span class="dot"></span><span class="label"></span><button type="button"></button></div>`
    badgeParts = { pill: root.querySelector('.pill'), label: root.querySelector('.label'), button: root.querySelector('button') }
    badgeParts.button.addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ kind: rec.paused ? 'resume' : 'pause' }).catch(() => {})
      } catch { /* extension reloaded */ }
    })
  }

  function renderBadge() {
    const show = !dead && rec.recording && rec.allowed
    if (!show) {
      if (badgeHost) badgeHost.remove()
      return
    }
    if (!badgeHost) buildBadge()
    if (!badgeHost.isConnected) document.documentElement.appendChild(badgeHost)
    badgeParts.pill.classList.toggle('paused', rec.paused)
    badgeParts.label.textContent = rec.paused ? 'Paused' : 'Recording' // the red dot is the "●"
    badgeParts.button.textContent = rec.paused ? 'Resume' : 'Pause'
  }

  try {
    chrome.runtime.sendMessage({ kind: 'pageState' }).then((r) => {
      if (r) rec = r
      renderBadge()
    }).catch(() => {})
  } catch { /* extension reloaded */ }

  // ---------- messages from the background ----------

  // Areas to black out in a screenshot, in CSS px of the viewport.
  function redactRects(fields, documents) {
    const sel = ['input[type=password]', '[data-private]']
    if (fields) {
      sel.push(
        'input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=image])',
        'textarea', 'select', '[contenteditable]:not([contenteditable=false])',
      )
    }
    if (documents) sel.push('[data-redact]')
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rects = []
    for (const el of document.querySelectorAll(sel.join(','))) {
      if (el === badgeHost) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue
      if (getComputedStyle(el).visibility === 'hidden') continue
      const pad = 2
      const x = Math.max(0, r.left - pad)
      const y = Math.max(0, r.top - pad)
      rects.push([x, y, Math.min(vw, r.right + pad) - x, Math.min(vh, r.bottom + pad) - y].map(Math.round))
      if (rects.length >= 500) break
    }
    return { rects, dpr: window.devicePixelRatio, vw, vh }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (dead) return
    if (msg.kind === 'recorderState') {
      rec = { recording: msg.recording, paused: msg.paused, allowed: msg.allowed }
      renderBadge()
    } else if (msg.kind === 'redactRects') {
      reply(redactRects(msg.fields, msg.documents))
    }
  })

  // A newer copy (after an extension reload) takes over: this orphaned one goes quiet and removes its badge.
  document.addEventListener('discovery-recorder-takeover', () => {
    if (isAlive()) return
    dead = true
    renderBadge()
  })

  // Flush typing if the tab is hidden (switching tabs) or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      for (const el of [...pendingInputs.keys()]) flushInput(el)
      endBurst()
    }
  })
})()
