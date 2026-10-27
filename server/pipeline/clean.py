"""Stage 4a (no AI): tidy a recording and pick the few screenshots worth showing the model."""

from __future__ import annotations

import base64
import io
import json
from typing import Any

from .common import SESSIONS_DIR

# Clicks on these show an outcome worth seeing (errors, warnings, created records).
OUTCOME_ACTIONS = {
    "submit-bill", "send-email", "submit-approval-code", "submit-supplier-request",
    "vat-go-back", "vat-submit-anyway", "put-on-hold",
}
MAX_KEY_FRAMES = 14
FRAME_WIDTH = 1280


def load_events(session: str) -> list[dict[str, Any]]:
    path = SESSIONS_DIR / session / "events.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"No recording called {session} in data/sessions/")
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    return sorted(rows, key=lambda e: e["seq"])


def _label(e: dict) -> str | None:
    tg = e.get("target") or {}
    return tg.get("action") or tg.get("field")


def clean(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drops noise and merges repeats, keeping the original seq numbers so evidence still points at real events."""
    out: list[dict[str, Any]] = []
    for e in events:
        e = dict(e)
        tg = dict(e.get("target") or {})
        # Older recordings logged document text on clicks; never pass values on.
        if tg.get("text") and not tg.get("action"):
            tg["text"] = ""
        e["target"] = tg
        prev = out[-1] if out else None

        # Clicks on unlabelled areas (empty space, table cells) carry no meaning on their own.
        if e["type"] == "click" and not _label(e):
            continue
        # Double clicks / repeated clicks on the same control within 0.7 s.
        if prev and e["type"] == "click" and prev["type"] == "click" and _label(prev) == _label(e) \
                and prev.get("screen") == e.get("screen") and e["t"] - prev["t"] < 700:
            continue
        # A click straight into a field that is then typed/pasted into adds nothing.
        if prev and prev["type"] == "click" and e["type"] in ("input", "paste", "change") \
                and tg.get("field") and _label(prev) == tg.get("field"):
            out.pop()
            prev = out[-1] if out else None
        # Repeated change/input events on the same field (date pickers, typing in bursts): keep the last.
        if prev and e["type"] in ("change", "input") and prev["type"] in ("change", "input") \
                and _label(prev) == _label(e) and prev.get("screen") == e.get("screen") and e["t"] - prev["t"] < 15000:
            e = {**e, "merged_from": prev.get("merged_from", [prev["seq"]]) + [prev["seq"]]}
            out[-1] = e
            continue
        out.append(e)
    return out


def _fmt_t(ms: float) -> str:
    s = int(ms // 1000)
    return f"{s // 60:02d}:{s % 60:02d}"


def render(events: list[dict[str, Any]], t0: float | None = None) -> str:
    """One compact line per event, e.g. `#45 02:13 ledgerpoint/new-bill PASTE net (9 chars)`. Times are relative to t0."""
    if not events:
        return ""
    t0 = events[0]["t"] if t0 is None else t0
    lines = []
    for e in events:
        tg = e.get("target") or {}
        where = f"{e.get('app') or '?'}/{e.get('screen') or '-'}"
        t = e["type"]
        what = ""
        if t == "click":
            what = f"CLICK {_label(e)}" + (f' "{tg["text"]}"' if tg.get("text") else "")
        elif t == "input":
            what = f"TYPE {_label(e)} ({e.get('value_length')} chars, {e.get('value_kind')})"
        elif t == "change":
            what = f"SET {_label(e)} ({e.get('value_kind')})"
        elif t in ("copy", "paste"):
            what = f"{t.upper()} {_label(e) or tg.get('tag') or '?'} ({e.get('text_length')} chars)"
        elif t == "keyburst":
            what = f"DELETE×{e.get('count')} in {_label(e)}"
        elif t == "tab_switch":
            what = f"SWITCH {e.get('from_app')} → {e.get('to_app')}"
            where = ""
        elif t == "navigate":
            what = f"PAGE {e.get('url')}"
        elif t == "idle":
            what = f"IDLE {e.get('seconds')}s"
        elif t == "pause":
            what = "RECORDING PAUSED by the person"
        elif t == "resume":
            what = f"RECORDING RESUMED after {e.get('seconds')}s"
        elif t == "message":
            what = f"SCREEN {str(e.get('severity', 'info')).upper()}: \"{e.get('message', '')}\"" + (f" (field {e['for_field']})" if e.get("for_field") else "")
        else:
            what = t.upper()
        ent = tg.get("entity") or {}
        ent_s = " ".join(f"{k}={v}" for k, v in ent.items() if k in ("invoiceNo", "billRef", "po", "emailId", "docId"))
        frame = e.get("frame_after") or ""
        lines.append(f"#{e['seq']} {_fmt_t(e['t'] - t0)} {where} {what}".replace("  ", " ")
                     + (f" [{ent_s}]" if ent_s else "") + (f" (screenshot {frame})" if frame and t == 'click' and _label(e) in OUTCOME_ACTIONS else ""))
    return "\n".join(lines)


def load_frames(session: str) -> list[dict[str, Any]]:
    path = SESSIONS_DIR / session / "frames.jsonl"
    if not path.exists():
        return []
    rows = [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    return sorted(rows, key=lambda f: f["t"])


def frame_after(frames: list[dict[str, Any]], t: float, delay_ms: int = 250, within_ms: int = 4000) -> str | None:
    """The first screenshot taken shortly after time t (what the screen looked like after a click)."""
    for f in frames:
        if t + delay_ms <= f["t"] <= t + within_ms:
            return f["name"]
    return None


def pick_key_frames(session: str, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Screenshots that show content or outcomes: each document opened, and the result of each submit/send."""
    frames = load_frames(session)
    picks: list[dict[str, Any]] = []
    seen_docs: set[str] = set()
    for e in events:
        if e["type"] != "click":
            continue
        tg = e.get("target") or {}
        doc = (tg.get("entity") or {}).get("docId")
        name = e.get("frame_after") or frame_after(frames, e["t"])
        if not name:
            continue
        if tg.get("action") == "open-attachment" and doc and doc not in seen_docs:
            seen_docs.add(doc)
            # The document needs a moment to render; prefer a slightly later screenshot.
            name = frame_after(frames, e["t"], delay_ms=700) or name
            picks.append({"frame": name, "seq": e["seq"], "why": f"document {doc} opened", "priority": 2})
        elif tg.get("action") in OUTCOME_ACTIONS:
            name = frame_after(frames, e["t"], delay_ms=600) or name
            picks.append({"frame": name, "seq": e["seq"], "why": f"result of {tg['action']}", "priority": 1})
    # Outcomes first, then documents; keep chronological order in the final list.
    chosen = sorted(picks, key=lambda p: (p["priority"], p["seq"]))[:MAX_KEY_FRAMES]
    return sorted(chosen, key=lambda p: p["seq"])


def frame_b64(session: str, name: str) -> str:
    """Downscales a screenshot to FRAME_WIDTH px wide (fewer tokens) and returns base64 JPEG."""
    from PIL import Image

    img = Image.open(SESSIONS_DIR / session / "frames" / name).convert("RGB")
    if img.width > FRAME_WIDTH:
        img = img.resize((FRAME_WIDTH, round(img.height * FRAME_WIDTH / img.width)))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    return base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- splitting into steps (no AI)

# A new step starts at these actions: each begins a new purposeful piece of work.
STEP_START_ACTIONS = {
    "reset-world", "open-email", "open-attachment", "new-mail", "reply", "forward", "send-email",
    "nav-new-bill", "nav-bills", "nav-suppliers", "nav-new-supplier", "open-bill", "open-po", "open-supplier",
    "open-attach-dialog", "submit-bill", "submit-approval-code", "submit-supplier-request", "put-on-hold",
    "add-row", "download-attachment", "create-another", "back-to-email", "open-app",
}
PASSIVE = {"tab_switch", "navigate", "message", "idle", "session_start", "session_end", "pause", "resume"}
MAX_STEP_EVENTS = 14


def segment(events: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    """Cuts the cleaned events into steps at clear boundaries, so the model only has to describe them.

    A step starts when the person begins something new: copying a value (copy → switch → paste → type is one step),
    opening an email or document, submitting, sending, or after a long idle. Page changes, tab switches and on-screen
    messages stay with the action that caused them.
    """
    # On real sites without our data-action labels, a click on a different screen is the best boundary we have.
    generic = not any((e.get("target") or {}).get("action") for e in events)
    segs: list[list[dict[str, Any]]] = []
    last_screen = None
    for e in events:
        action = (e.get("target") or {}).get("action")
        new_screen = generic and e["type"] == "click" and last_screen is not None and e.get("screen") != last_screen
        if e["type"] not in PASSIVE and e.get("screen"):
            last_screen = e.get("screen")
        starts = (
            not segs
            or new_screen
            or e["type"] == "copy"
            or e["type"] in ("idle", "resume")
            or (e["type"] == "click" and action in STEP_START_ACTIONS)
            or len(segs[-1]) >= MAX_STEP_EVENTS
            # typing in a different field after the previous step already had real work
            or (e["type"] in ("input", "change", "paste") and segs[-1][-1]["type"] in ("input", "change")
                and _label(segs[-1][-1]) != _label(e) and not any(x["type"] == "copy" for x in segs[-1]))
        )
        if starts:
            segs.append([e])
        else:
            segs[-1].append(e)
    # Steps made only of passive events (a lone tab switch or page load) join the previous step.
    merged: list[list[dict[str, Any]]] = []
    for s in segs:
        if merged and all(x["type"] in PASSIVE for x in s) and s[0]["type"] != "idle":
            merged[-1].extend(s)
        else:
            merged.append(s)
    return merged


def fallback_description(seg: list[dict[str, Any]]) -> str:
    """A plain description built from the events, used when the model skips a step."""
    parts = []
    for e in seg:
        if e["type"] in ("tab_switch", "navigate", "session_start", "session_end"):
            continue
        tg = e.get("target") or {}
        label = _label(e) or tg.get("tag") or ""
        verb = {"click": "clicked", "input": "typed in", "change": "set", "copy": "copied", "paste": "pasted into",
                "keyburst": "deleted text in", "idle": "idle", "message": "saw message"}.get(e["type"], e["type"])
        parts.append(f"{verb} {e.get('message') or label}".strip())
    return ("; ".join(dict.fromkeys(parts)) or "switched between apps")[:200]
