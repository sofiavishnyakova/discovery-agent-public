"""Stage 4b: turn one session into work steps.

Code decides where each step starts and ends (clean.segment) and computes the facts it can (apps, copy/paste,
rework, on-screen errors). The model only describes each step in plain words, which small local models do well.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .clean import clean, fallback_description, frame_b64, load_events, pick_key_frames, render, segment
from .common import VISION, strict

FLAGS = ["rework", "wait", "approval_seeking", "exception", "lookup", "copy_paste", "app_switching", "error_shown", "missed_check"]
STEPS_PER_REQUEST = 20

SYSTEM = """You describe steps of office work recorded at an Accounts Payable team (Meridian Advisory LLC, Dubai).
Apps: mail (shared AP inbox; invoices open in a document viewer, screen "mail-document"), ledgerpoint (accounting:
new bills, bill list, approvals, suppliers), procurehub (purchase orders), tracker (team spreadsheet).
"launcher" is the recording setup page; "outside" means the person left the browser. Typed values are never
logged, only field names and lengths. Lines starting "SCREEN ERROR/WARNING/SUCCESS" are messages the app showed.

The recording is already split into numbered steps. For EVERY step, write:
- description: one plain sentence saying what the person did and, if visible, the outcome. Mention the invoice
  number or bill reference when it appears. Example: "Copied the PO number from invoice INV-GOS-88247 into the
  New Bill form." or "Submitted the bill; LedgerPoint rejected it because the due date was before the invoice date."
- action: a short label such as open_invoice, copy_field, enter_field, submit_bill, email_manager, look_up_bill,
  attach_file, download_file, switch_app, setup.
- object: what the action was about (e.g. "PO number", "bill LP-2026-04401").
- entities: invoice number, supplier, LedgerPoint bill ref, PO, email id if known; otherwise "".
- flags: only if clearly true (approval_seeking = asking a manager for approval; lookup = checking another system;
  missed_check = something the person should have caught but didn't).
If screenshots are included, read them for details (invoice numbers, amounts, company names, error banners) and
add an observation when something doesn't add up, such as an invoice addressed to the wrong company name, VAT that
is not 5% of the net amount, or a value entered that doesn't match the document. At most 3 observations per
request, only for real problems, never for normal work. Don't invent details.
Describe the work, never the person: do not rate, rank or compare individuals' speed, skill or effort, and never guess at feelings or mood. Call differences between people process variations."""

SCHEMA = strict({
    "type": "object",
    "properties": {
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step": {"type": "integer"},
                    "action": {"type": "string"},
                    "object": {"type": "string"},
                    "description": {"type": "string"},
                    "entities": {
                        "type": "object",
                        "properties": {k: {"type": "string"} for k in ("invoice", "supplier", "bill_ref", "po", "email")},
                    },
                    "flags": {"type": "array", "items": {"type": "string", "enum": FLAGS}},
                },
            },
        },
        "observations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step": {"type": "integer"},
                    "kind": {"type": "string", "enum": ["error", "warning", "mismatch", "missed_check", "duplicate", "other"]},
                    "note": {"type": "string"},
                },
            },
        },
    },
})


def build_chunks(session: str) -> tuple[list[list[dict[str, Any]]], dict[str, Any]]:
    """Returns (content blocks per request, context for finalize). Each request carries STEPS_PER_REQUEST steps."""
    raw = load_events(session)
    cleaned = clean(raw)
    segs = segment(cleaned)
    frames = pick_key_frames(session, cleaned)
    t0 = raw[0]["t"]
    chunks: list[list[dict[str, Any]]] = []
    for start in range(0, len(segs), STEPS_PER_REQUEST):
        content: list[dict[str, Any]] = []
        lines = []
        for n, seg in enumerate(segs[start:start + STEPS_PER_REQUEST], start=start + 1):
            lo, hi = seg[0]["seq"], seg[-1]["seq"]
            if VISION:
                for f in (f for f in frames if lo <= f["seq"] <= hi):
                    content.append({"type": "text", "text": f"Screenshot for step {n} ({f['why']}):"})
                    content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": frame_b64(session, f["frame"])}})
            lines.append(f"Step {n}:\n{render(seg, t0)}")
        content.append({"type": "text", "text": f"Session {session}. Describe steps {start + 1}–{start + len(lines)}.\n\n" + "\n\n".join(lines)})
        chunks.append(content)
    return chunks, {"raw": raw, "cleaned": cleaned, "segments": segs, "frames": frames}


def merge_chunks(results: list[dict[str, Any]]) -> dict[str, Any]:
    return {"steps": [s for r in results for s in r["steps"]], "observations": [o for r in results for o in r["observations"]]}


def _code_flags(seg: list[dict[str, Any]]) -> set[str]:
    types = [e["type"] for e in seg]
    actions = [(e.get("target") or {}).get("action") for e in seg]
    flags = set()
    if "copy" in types and "paste" in types:
        flags.add("copy_paste")
    if types.count("tab_switch") >= 2:
        flags.add("app_switching")
    fields = [(e.get("target") or {}).get("field") for e in seg if e["type"] in ("input", "paste")]
    if "keyburst" in types or "vat-go-back" in actions or any(c > 1 for c in Counter(f for f in fields if f).values()):
        flags.add("rework")
    if any(e["type"] == "message" and e.get("severity") in ("error", "warning") for e in seg):
        flags.update({"error_shown", "exception"})
    if "idle" in types:
        flags.add("wait")
    return flags


def finalize(session: str, result: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """Builds steps from the code-made segments plus the model's descriptions; times and facts come from events."""
    raw, segs, frames = ctx["raw"], ctx["segments"], ctx["frames"]
    t0 = raw[0]["t"]
    labels = {s["step"]: s for s in result["steps"] if isinstance(s.get("step"), int)}
    steps, warnings = [], []
    missing = [n for n in range(1, len(segs) + 1) if n not in labels]
    if missing:
        warnings.append(f"{len(missing)} steps had no description from the model; used a plain one: {missing[:15]}")
    for n, seg in enumerate(segs, start=1):
        lab = labels.get(n, {})
        apps = Counter(e.get("app") for e in seg if e.get("app") and e.get("app") != "outside")
        copy_app = next((e.get("app") for e in seg if e["type"] == "copy"), None)
        ents = {k: "" for k in ("invoice", "supplier", "bill_ref", "po", "email")} | (lab.get("entities") or {})
        # Fill entities the event log already knows.
        for e in seg:
            ent = (e.get("target") or {}).get("entity") or {}
            ents["invoice"] = ents["invoice"] or ent.get("invoiceNo", "")
            ents["bill_ref"] = ents["bill_ref"] or ent.get("billRef", "") or (re.search(r"LP-\d{4}-\d+", e.get("url") or "") or [""])[0]
            ents["po"] = ents["po"] or ent.get("po", "")
            ents["email"] = ents["email"] or ent.get("emailId", "")
        seqs = [e["seq"] for e in seg]
        steps.append({
            "id": f"{session}:s{n:03d}",
            "session": session,
            "first_seq": seqs[0],
            "last_seq": seqs[-1],
            "app": apps.most_common(1)[0][0] if apps else (seg[0].get("app") or ""),
            "action": lab.get("action") or "work",
            "object": lab.get("object") or "",
            "source_app": copy_app or "",
            "description": lab.get("description") or fallback_description(seg),
            "entities": ents,
            "flags": sorted(_code_flags(seg) | set(lab.get("flags") or [])),
            "messages": [{"severity": e.get("severity"), "text": e.get("message")} for e in seg if e["type"] == "message"],
            "start_s": round((seg[0]["t"] - t0) / 1000, 1),
            "end_s": round((seg[-1]["t"] - t0) / 1000, 1),
            # Paused stretches are private time: never count them as work.
            "duration_s": round(max(0.0, (seg[-1]["t"] - seg[0]["t"]) / 1000 - sum(e.get("seconds") or 0 for e in seg if e["type"] == "resume")), 1),
            "event_seqs": seqs,
            "frames": sorted({e.get("frame_after") or e.get("frame") for e in seg} - {None}),
        })

    # Observations: on-screen errors are facts from the recording; the model adds what it read in screenshots.
    observations = []
    for st in steps:
        for m in st["messages"]:
            if m["severity"] in ("error", "warning"):
                kind = "duplicate" if "duplicate" in (m["text"] or "").lower() else m["severity"]
                observations.append({"kind": kind, "note": f"App showed: {m['text']}", "step_ids": [st["id"]], "source": "recording"})
    for o in result["observations"]:
        if isinstance(o.get("step"), int) and 1 <= o["step"] <= len(steps):
            observations.append({"kind": o["kind"], "note": o["note"], "step_ids": [steps[o["step"] - 1]["id"]], "source": "model"})
    return {"session": session, "steps": steps, "observations": observations, "key_frames": frames, "warnings": warnings}
