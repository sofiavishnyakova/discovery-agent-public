# Discovery Recorder (Chrome extension)

Records what a person does in the Meridian mock workplace (or any other site on its allow-list): clicks, typing
(**lengths only, never values**), dropdowns, copy/paste, delete bursts, page changes, tab switches, idle time, and
screenshots with form fields blacked out. It only starts after the person agrees to a short notice, and they can pause at any time.
It sends everything to the server in `server/`, which saves it to `data/sessions/<session>/`.

## One-time setup

1. **Start the server** (from the repo root):
   ```bash
   cd server
   python3 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   .venv/bin/uvicorn main:app --port 8000
   ```
2. **Start the mock workplace** (second terminal):
   ```bash
   cd mock-workplace
   npm install
   npm run dev
   ```
3. **Load the extension in Chrome:** open `chrome://extensions` → turn on **Developer mode** (top right) →
   **Load unpacked** → choose this `recorder/` folder. Pin it from the puzzle-piece menu so the icon is visible.
   Chrome will say it can "read and change all your data on all websites". That permission is needed for
   screenshots (`captureVisibleTab`) and for adding the recorder to the sites you allow. The recorder only runs on,
   listens to and screenshots the sites on its allow-list (by default only `http://localhost:5173/*`).

## Recording a session

1. Open http://localhost:5173 → pick the persona → **Reset data & start session** (leave "Fast replies" off).
2. Open the four apps (Mail, LedgerPoint, ProcureHub, AP Tracker) in their tabs.
3. Click the recorder icon → the person reads the notice and ticks **I've read this and agree to be recorded** →
   choose the persona → check the session ID (e.g. `lina-01`) → **● Start recording**. Start stays disabled until the box is ticked,
   and the box is cleared again after every session.
4. Work through the inbox for ~5 minutes as that persona. The toolbar icon shows **REC** (red), and each allowed page
   shows a small **Recording** badge bottom-right with a **Pause** button.
5. Click the icon → **■ Stop & save** → **Check recording** opens `http://localhost:8000/sessions/<id>/view`.

All recordings: http://localhost:8000/view

**If you change the extension code:** click the reload ↻ icon on `chrome://extensions`, then **reload the workplace tabs**
(old tabs keep the old script).

## Consent, pause and the badge

- **Consent:** the popup shows a plain-language notice (what is and isn't recorded, pausing, per-process results,
  raw recordings deleted after analysis). The agreement is stored with the session only (`consent` in
  `session_start` and in the `/end` body: `{agreed: true, at: <ms>, notice_version: "1"}`), never remembered for the next session.
- **Pause / Resume:** from the popup or the on-page badge. While paused nothing is recorded and no screenshots are taken;
  only a `pause` and a `resume` event are written. Paused time is never counted as idle. The icon shows **II** (grey) while paused.
- **Badge:** a small pill in a Shadow DOM (page CSS can't change it) on every allowed page while recording.
  Clicks on it are not recorded. It is visible in screenshots, so the person can see recording was on.

## Privacy settings (popup → Privacy settings)

Locked while recording, saved in `chrome.storage.local`.

- **Sites that may be recorded:** one Chrome match pattern per line, e.g. `http://localhost:5173/*`,
  `https://books.zoho.com/*`, `https://*.example.com/*` (`*` scheme = http or https; no port = any port).
  "Everything" patterns (`<all_urls>`, `*://*/*`) are refused. The content script is registered for exactly these
  sites (`chrome.scripting.registerContentScripts`) and injected into matching tabs that are already open.
  Other tabs are never recorded or screenshotted; switching to one is a `tab_switch` to `outside`, with no title.
- **Take screenshots** (on), **Hide form fields in screenshots** (on), **Also hide documents in screenshots** (off).

**Screenshot redaction:** before each capture the page reports the boxes of visible inputs, textareas, selects,
`[contenteditable]` and `[data-private]` elements (and `[data-redact]` document areas if "hide documents" is on;
password fields and `[data-private]` are always hidden). The worker paints them dark grey (labelled "hidden") and
re-encodes the JPEG before upload. If the page doesn't answer within 150 ms, the screenshot is dropped, never sent unredacted.
Fields inside iframes are not seen by the recorder, so screenshots of pages with iframe forms are not fully redacted.

## Real web apps (no data-* attributes)

`data-app` / `data-screen` / `data-action` / `data-field` are used first; the mock workplace behaves exactly as before.
On other allowed sites the recorder falls back to:

- `app`: the hostname without `www.` (e.g. `books.zoho.com`)
- `screen` and `url`: the URL path (plus `#/` hash route) with ids, uuids and emails replaced by `:id`; no query string
- `target.action` (and `target.text`): a short slug of the aria-label or text of a button, link, menu item or tab (max 40 chars, long numbers dropped)
- `target.field`: a slug of the field's `name`, `id`, `aria-label`, `placeholder` or `<label>` text

Field values and other page text are never used.

## What gets recorded

Each line in `data/sessions/<id>/events.jsonl`:

| type | when | key fields |
|---|---|---|
| `session_start` / `session_end` | Start / Stop | `persona`, `consent` (start only) |
| `pause` / `resume` | Pause / Resume (popup or badge) | `seconds` (resume only: how long it was paused) |
| `click` | any click | `target.action` or `target.field`, `target.text` (button/link label), `target.entity`, `target.box`, `frame_after` |
| `input` | typing in a field or date picker, once the person pauses 0.6 s (or leaves the field) | `target.field`, `value_length`, `value_kind` (`number`/`text`/`date`/`email`/`empty`) |
| `change` | dropdowns and checkboxes | `target.field`, `value_kind` |
| `copy` / `paste` | clipboard | `target` (where it was copied from / pasted into), `text_length` |
| `keyburst` | 3+ Backspace/Delete in a row | `target.field`, `count` |
| `navigate` | page change inside an app, or a page load | `url`, `title` |
| `tab_switch` | switching tabs, or leaving Chrome (`to_app: "outside"`) | `from_app`, `to_app` |
| `idle` | 20+ s with no activity | `seconds` |

Every event also has `seq` (order), `t` (ms timestamp), `session`, `app`, `screen`, `url`, `title`, `viewport`,
and `frame` (the latest screenshot). `target.entity` carries ids such as `emailId`, `docId`, `invoiceNo`,
`billRef`, `po`, `rowId`.

**Privacy:** typed values and the contents of data fields and document text (invoices, certificates) are never recorded.
Screenshots have form fields blacked out (see above); turn on "Also hide documents" to black out document areas too.

Screenshots: `data/sessions/<id>/frames/f_0001.jpg …`, taken every 2 s, ~0.3 s after each click, after page
changes and tab switches (max ~2 per second), only while an allowed tab is the active tab and not paused.
Each frame's metadata has `redacted`: the number of boxes blacked out.

The `/sessions/<id>/end` body has `persona`, `started_at`, `ended_at`, `event_count`, `frame_count`, plus
`consent`, `paused_seconds`, `allowed_sites` (the patterns used) and `redaction: {fields, documents, screenshots}`.

## Files

- `manifest.json`: extension config (Manifest V3)
- `content.js`: runs in each allowed tab, turns DOM events into recorder events, shows the badge, reports boxes to hide
- `background.js`: allow-list and content script registration, numbering, redacted screenshots, page/tab/idle detection,
  pause/resume, uploads every 2 s (retries if the server is down)
- `popup.html` / `popup.js`: consent, Start/Pause/Stop and privacy settings UI
