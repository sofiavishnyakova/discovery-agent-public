"""Discovery Agent server.

For now: receives recordings from the Chrome extension and shows a checking page per session.
Later: the analysis pipeline (/analyze, /results) is added here.

Run:  .venv/bin/uvicorn main:app --port 8000   (from the server/ folder)
"""

from __future__ import annotations

import base64
import binascii
import html
import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SESSION_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
FRAME_RE = re.compile(r"^f_\d{4,6}\.jpg$")

app = FastAPI(title="Discovery Agent server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Frame(BaseModel):
    name: str
    t: float
    b64: str
    app: str | None = None
    reason: str | None = None
    redacted: int | None = None  # how many areas (form fields, private documents) were blacked out before upload


class IngestBatch(BaseModel):
    events: list[dict[str, Any]] = Field(default_factory=list)
    frames: list[Frame] = Field(default_factory=list)


class SessionEnd(BaseModel):
    persona: str | None = None
    started_at: float | None = None
    ended_at: float | None = None
    event_count: int | None = None
    frame_count: int | None = None
    # Privacy facts from the recorder, kept for the privacy report.
    consent: dict[str, Any] | None = None
    paused_seconds: float | None = None
    allowed_sites: list[str] | None = None
    redaction: dict[str, Any] | None = None


def session_dir(session: str, create: bool = False) -> Path:
    if not SESSION_RE.match(session):
        raise HTTPException(400, "Session id must be lowercase letters, digits and dashes, e.g. lina-01")
    d = DATA_DIR / session
    if create:
        (d / "frames").mkdir(parents=True, exist_ok=True)
    elif not d.exists():
        raise HTTPException(404, f"No session called {session}")
    return d


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        if line.strip():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # a half-written line from a crash; skip it
    return rows


def session_summary(d: Path) -> dict[str, Any]:
    events = read_jsonl(d / "events.jsonl")
    meta = json.loads((d / "session.json").read_text()) if (d / "session.json").exists() else {}
    ts = [e["t"] for e in events if isinstance(e.get("t"), (int, float))]
    return {
        "session": d.name,
        "persona": meta.get("persona") or next((e.get("persona") for e in events if e.get("persona")), None),
        "ended": bool(meta.get("ended_at")),
        "events": len(events),
        "frames": len(list((d / "frames").glob("f_*.jpg"))) if (d / "frames").exists() else 0,
        "duration_s": round((max(ts) - min(ts)) / 1000) if len(ts) > 1 else 0,
        "started": min(ts) if ts else None,
        "raw_deleted": (d / "deletion.json").exists(),
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "time": time.time()}


@app.post("/ingest/{session}")
def ingest(session: str, batch: IngestBatch) -> dict[str, Any]:
    d = session_dir(session, create=True)
    saved_frames = 0
    with (d / "frames.jsonl").open("a") as index:
        for f in batch.frames:
            if not FRAME_RE.match(f.name):
                raise HTTPException(400, f"Bad frame name {f.name!r}")
            b64 = f.b64.split(",", 1)[1] if f.b64.startswith("data:") else f.b64
            try:
                data = base64.b64decode(b64, validate=True)
            except binascii.Error:
                raise HTTPException(400, f"Frame {f.name} is not valid base64")
            (d / "frames" / f.name).write_bytes(data)
            index.write(json.dumps({"name": f.name, "t": f.t, "app": f.app, "reason": f.reason, "redacted": f.redacted}) + "\n")
            saved_frames += 1
    with (d / "events.jsonl").open("a") as out:
        for e in batch.events:
            out.write(json.dumps(e, separators=(",", ":")) + "\n")
    return {"ok": True, "events": len(batch.events), "frames": saved_frames}


@app.post("/sessions/{session}/end")
def end_session(session: str, body: SessionEnd) -> dict[str, Any]:
    d = session_dir(session, create=True)
    meta = body.model_dump()
    meta["ended_at"] = meta["ended_at"] or time.time() * 1000
    (d / "session.json").write_text(json.dumps(meta, indent=2))
    return {"ok": True, **session_summary(d)}


@app.get("/sessions")
def list_sessions() -> list[dict[str, Any]]:
    dirs = sorted((p for p in DATA_DIR.iterdir() if p.is_dir()), key=lambda p: p.name)
    return [session_summary(d) for d in dirs]


@app.get("/sessions/{session}/events")
def get_events(session: str) -> list[dict[str, Any]]:
    return read_jsonl(session_dir(session) / "events.jsonl")


@app.get("/sessions/{session}/frames/{name}")
def get_frame(session: str, name: str) -> FileResponse:
    if not FRAME_RE.match(name):
        raise HTTPException(400, "Bad frame name")
    d = session_dir(session)
    if (d / "deletion.json").exists():
        raise HTTPException(410, "Raw recording deleted after analysis (see the deletion certificate)")
    path = d / "frames" / name
    if not path.exists():
        raise HTTPException(404, "Frame not found")
    return FileResponse(path, media_type="image/jpeg")


# ---------------------------------------------------------------- analysis results (for the dashboard)

RESULTS_DIR = DATA_DIR.parent / "results"
RESULT_FILES = ("stats", "processes", "costs", "interview_plan")


def results_path(batch: str) -> Path:
    if not re.match(r"^[a-z0-9+-]{1,120}$", batch):
        raise HTTPException(400, "Bad batch name")
    d = RESULTS_DIR / batch
    if not d.exists():
        raise HTTPException(404, f"No results called {batch}")
    return d


@app.get("/results")
def list_results() -> list[dict[str, Any]]:
    if not RESULTS_DIR.exists():
        return []
    out = []
    for d in sorted(RESULTS_DIR.iterdir()):
        if d.is_dir() and (d / "interview_plan.json").exists():
            usage = read_jsonl(d / "usage.jsonl")
            out.append({"batch": d.name, "sessions": d.name.split("+"), "usd_spent": round(sum(u.get("usd", 0) for u in usage), 3),
                        "updated": (d / "interview_plan.json").stat().st_mtime})
    return out


@app.get("/results/{batch}")
def get_results(batch: str) -> dict[str, Any]:
    d = results_path(batch)
    data: dict[str, Any] = {"batch": batch}
    for name in RESULT_FILES:
        p = d / f"{name}.json"
        data[name] = json.loads(p.read_text()) if p.exists() else None
    data["steps"] = {p.stem.removeprefix("steps_"): json.loads(p.read_text()) for p in sorted(d.glob("steps_*.json")) if ".part" not in p.name}
    data["profile"] = _profile(d)
    data["review"] = get_review(batch)
    if data["processes"] and data["costs"]:
        from pipeline import costs as costs_mod
        from pipeline import recommend

        # Recomputed on load so results from before confidence labels and roadmaps existed get them too.
        data["costs"] = costs_mod.compute(data["processes"], data["steps"], data["stats"], data["costs"]["assumptions"])
        data["roadmap"] = recommend.compute(data["processes"], data["steps"], data["costs"], data["profile"])
    from pipeline import guard

    data["language_check"] = guard.scan(processes=data["processes"], interview_plan=data["interview_plan"],
                                        observations=[o for s in data["steps"].values() for o in s.get("observations", [])])
    return data


class Assumptions(BaseModel):
    monthly_volume_main_process: float = Field(gt=0, le=1_000_000)
    clerk_rate_aed_per_hour: float = Field(gt=0, le=10000)
    manager_rate_aed_per_hour: float = Field(gt=0, le=10000)
    review_minutes_per_item: float = Field(ge=0, le=120)


@app.post("/results/{batch}/costs")
def recompute_costs(batch: str, body: Assumptions) -> dict[str, Any]:
    """Recomputes costs with edited assumptions (pure Python, no API spend). Not saved, unless the dashboard asks again."""
    from pipeline import costs as costs_mod

    d = results_path(batch)
    procs = json.loads((d / "processes.json").read_text())
    stats = json.loads((d / "stats.json").read_text())
    steps = {p.stem.removeprefix("steps_"): json.loads(p.read_text()) for p in d.glob("steps_*.json") if ".part" not in p.name}
    return costs_mod.compute(procs, steps, stats, body.model_dump())


# ---------------------------------------------------------------- roadmap, review, privacy, re-measurement


def _load_batch(batch: str) -> tuple[Path, dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    d = results_path(batch)
    if not (d / "processes.json").exists():
        raise HTTPException(409, f"{batch} has no processes yet; finish the pipeline first")
    procs = json.loads((d / "processes.json").read_text())
    stats = json.loads((d / "stats.json").read_text())
    steps = {p.stem.removeprefix("steps_"): json.loads(p.read_text()) for p in d.glob("steps_*.json") if ".part" not in p.name}
    return d, procs, stats, steps


def _profile(d: Path) -> dict[str, Any]:
    from pipeline import recommend

    p = d / "profile.json"
    return {**recommend.DEFAULT_PROFILE, **(json.loads(p.read_text()) if p.exists() else {})}


@app.get("/catalog")
def get_catalog() -> dict[str, Any]:
    from pipeline import recommend

    return recommend.load_catalog()


class Profile(BaseModel):
    company: str = Field(max_length=120)
    region: str = Field(max_length=20)
    stack: list[str] = Field(default_factory=list, max_length=20)
    existing_tools: list[str] = Field(default_factory=list, max_length=40)
    accounting_system: str = Field("", max_length=120)
    monthly_budget_aed: float = Field(ge=0, le=10_000_000)
    data_residency: str = Field(pattern="^(any|in-country)$")
    prefer_no_code: bool = True


class RoadmapRequest(BaseModel):
    profile: Profile | None = None
    assumptions: Assumptions | None = None


@app.post("/results/{batch}/roadmap")
def roadmap(batch: str, body: RoadmapRequest) -> dict[str, Any]:
    """Personalised tool roadmap (pure Python). A profile sent here is saved for the next visit."""
    from pipeline import costs as costs_mod
    from pipeline import recommend

    d, procs, stats, steps = _load_batch(batch)
    if body.profile:
        (d / "profile.json").write_text(json.dumps(body.profile.model_dump(), indent=2))
    cost = costs_mod.compute(procs, steps, stats, body.assumptions.model_dump() if body.assumptions else None)
    return recommend.compute(procs, steps, cost, _profile(d))


# Human review: every AI finding starts as a draft until a person confirms or rejects it.
REVIEW_STATUSES = ("confirmed", "rejected", "needs_check")


class ReviewMark(BaseModel):
    key: str = Field(pattern=r"^[A-Za-z0-9_:.+-]{1,200}$")
    status: str | None = Field(None, pattern="^(confirmed|rejected|needs_check)$")  # None clears the mark
    note: str = Field("", max_length=1000)
    by: str = Field("consultant", max_length=60)


@app.get("/results/{batch}/review")
def get_review(batch: str) -> dict[str, Any]:
    p = results_path(batch) / "review.json"
    return json.loads(p.read_text()) if p.exists() else {}


@app.post("/results/{batch}/review")
def set_review(batch: str, mark: ReviewMark) -> dict[str, Any]:
    p = results_path(batch) / "review.json"
    review = json.loads(p.read_text()) if p.exists() else {}
    if mark.status is None:
        review.pop(mark.key, None)
    else:
        review[mark.key] = {"status": mark.status, "note": mark.note, "by": mark.by, "at": time.strftime("%Y-%m-%d %H:%M")}
    p.write_text(json.dumps(review, indent=2, ensure_ascii=False))
    return review


@app.get("/results/{batch}/processing")
def processing(batch: str) -> dict[str, Any]:
    """Where and how the AI ran, from usage.jsonl and pipeline settings: the evidence behind "nothing left the computer"."""
    import os
    import platform
    from urllib.parse import urlparse

    from pipeline.common import BASE_URL, VISION

    d = results_path(batch)
    usage = read_jsonl(d / "usage.jsonl")
    host = urlparse(BASE_URL).hostname or ""
    cloud = sorted({u["model"] for u in usage if str(u.get("model", "")).lower().startswith(("claude", "gpt", "gemini", "o1", "o3"))})
    try:
        mem_gb = round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1024**3)
    except (ValueError, OSError, AttributeError):
        mem_gb = None
    return {
        "models": sorted({u.get("model") for u in usage if u.get("model")}),
        "requests": len(usage),
        "minutes": round(sum(u.get("seconds") or 0 for u in usage) / 60, 1),
        "input_tokens": sum(u.get("input_tokens") or 0 for u in usage),
        "output_tokens": sum(u.get("output_tokens") or 0 for u in usage),
        "usd_spent": round(sum(u.get("usd") or 0 for u in usage), 3),
        "llm_endpoint": BASE_URL,
        # A local endpoint can still be a proxy to a cloud model, so the model names and spend decide.
        "local": host in ("localhost", "127.0.0.1", "::1") and not cloud and not sum(u.get("usd") or 0 for u in usage),
        "cloud_models": cloud,
        "screenshots_sent_to_model": VISION,
        "machine": {"system": platform.system(), "chip": platform.machine(), "memory_gb": mem_gb},
        "costs_computed_by": "Python formulas (pipeline/costs.py), not the AI model",
        "recommendations_computed_by": "Python scoring over a curated catalogue (pipeline/recommend.py), not the AI model",
    }


@app.get("/sessions/{session}/privacy")
def session_privacy(session: str) -> dict[str, Any]:
    d = session_dir(session)
    meta = json.loads((d / "session.json").read_text()) if (d / "session.json").exists() else {}
    deletion = json.loads((d / "deletion.json").read_text()) if (d / "deletion.json").exists() else None
    frames = read_jsonl(d / "frames.jsonl")
    return {
        "session": session,
        "consent": meta.get("consent"),
        "paused_seconds": meta.get("paused_seconds"),
        "allowed_sites": meta.get("allowed_sites"),
        "redaction": meta.get("redaction"),
        "screenshots": len(frames),
        "screenshots_redacted": sum(1 for f in frames if f.get("redacted")),
        "typed_values_recorded": False,
        "deletion": deletion,
    }


def _sha256(path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


class DeleteRequest(BaseModel):
    confirm: str = Field(description="must equal the session id")
    by: str = Field("consultant", max_length=60)


@app.post("/sessions/{session}/delete-raw")
def delete_raw(session: str, body: DeleteRequest) -> dict[str, Any]:
    """Deletes the raw recording (events and screenshots) and writes a deletion certificate. Analysis results stay."""
    d = session_dir(session)
    if body.confirm != session:
        raise HTTPException(400, "Type the session id to confirm")
    if (d / "deletion.json").exists():
        return json.loads((d / "deletion.json").read_text())
    files = [p for p in [d / "events.jsonl", d / "frames.jsonl", *sorted((d / "frames").glob("*"))] if p.is_file()]
    manifest = [{"file": str(p.relative_to(d)), "bytes": p.stat().st_size, "sha256": _sha256(p)} for p in files]
    for p in files:
        p.unlink()
    if (d / "frames").exists():
        (d / "frames").rmdir()
    import hashlib

    cert = {
        "certificate_id": hashlib.sha256(f"{session}{time.time()}".encode()).hexdigest()[:16].upper(),
        "session": session,
        "deleted_at": time.strftime("%Y-%m-%d %H:%M:%S %Z"),
        "deleted_by": body.by,
        "files_deleted": len(manifest),
        "screenshots_deleted": sum(1 for m in manifest if m["file"].startswith("frames/")),
        "bytes_deleted": sum(m["bytes"] for m in manifest),
        # A fingerprint of exactly what was deleted, without keeping any of it.
        "manifest_sha256": hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
        "kept": "Analysis results only (steps, processes, costs, interview plan), which contain no typed values or screenshots.",
    }
    (d / "deletion.json").write_text(json.dumps(cert, indent=2))
    return cert


@app.get("/sessions/{session}/certificate", response_class=HTMLResponse, include_in_schema=False)
def view_certificate(session: str) -> HTMLResponse:
    d = session_dir(session)
    if not (d / "deletion.json").exists():
        raise HTTPException(404, "This recording hasn't been deleted")
    c = json.loads((d / "deletion.json").read_text())
    rows = "".join(f"<tr><th>{html.escape(k.replace('_', ' '))}</th><td>{html.escape(str(v))}</td></tr>" for k, v in c.items())
    return page(f"Deletion certificate {c['certificate_id']}",
                f"<h1>Deletion certificate</h1><p class='muted'>The raw recording of session <b>{html.escape(session)}</b> "
                f"(every event and screenshot) was permanently deleted from this computer.</p><table>{rows}</table>"
                "<p class='muted'>Print this page to give the client a copy.</p>")


@app.get("/compare")
def compare_batches(before: str, after: str) -> dict[str, Any]:
    """Re-measurement: baseline vs. a later recording, both recomputed with the baseline's assumptions for a fair comparison."""
    from pipeline import compare as compare_mod
    from pipeline import costs as costs_mod
    from pipeline import recommend

    bd, bprocs, bstats, bsteps = _load_batch(before)
    _, aprocs, astats, asteps = _load_batch(after)
    saved_costs = bd / "costs.json"
    assumptions = json.loads(saved_costs.read_text())["assumptions"] if saved_costs.exists() else None
    bcost = costs_mod.compute(bprocs, bsteps, bstats, assumptions)
    acost = costs_mod.compute(aprocs, asteps, astats, assumptions)
    promised = recommend.compute(bprocs, bsteps, bcost, _profile(bd))
    return {"before": before, "after": after, **compare_mod.compare(bcost, acost, promised=promised)}


# ---------------------------------------------------------------- checking pages

PAGE_CSS = """
:root { color-scheme: light; }
body { font: 14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f6f7f9; color: #1f2933; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { font-size: 22px; margin: 0 0 4px; } .muted { color: #6b7280; }
table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 0 0 1px #e5e7eb; border-radius: 8px; overflow: hidden; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
th { background: #f8fafc; font-size: 12px; text-transform: uppercase; color: #6b7280; position: sticky; top: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
.chip { background: #fff; border: 1px solid #e5e7eb; border-radius: 999px; padding: 3px 10px; font-size: 12.5px; }
.t { color: #6b7280; font-variant-numeric: tabular-nums; white-space: nowrap; }
.type { font-weight: 600; white-space: nowrap; }
.type.click { color: #1d4ed8; } .type.input, .type.change { color: #047857; } .type.copy, .type.paste { color: #7c3aed; }
.type.keyburst { color: #b91c1c; } .type.idle { color: #92400e; } .type.tab_switch, .type.navigate { color: #0f766e; }
.app { font-size: 12px; background: #eef2f7; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
code { font-size: 12px; background: #f3f4f6; padding: 1px 4px; border-radius: 4px; }
img.thumb { width: 150px; border-radius: 4px; border: 1px solid #e5e7eb; cursor: zoom-in; display: block; }
.warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin: 10px 0; }
dialog { padding: 0; border: none; border-radius: 8px; max-width: 95vw; } dialog img { max-width: 95vw; max-height: 90vh; display: block; }
a { color: #1d4ed8; }
"""


def page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title><style>{PAGE_CSS}</style></head><body><main>{body}</main></body></html>"
    )


@app.get("/", include_in_schema=False)
def index() -> RedirectResponse:
    return RedirectResponse("/view")


@app.get("/view", response_class=HTMLResponse, include_in_schema=False)
def view_sessions() -> HTMLResponse:
    rows = "".join(
        f"<tr><td><a href='/sessions/{s['session']}/view'>{s['session']}</a></td><td>{html.escape(s['persona'] or '—')}</td>"
        f"<td>{s['events']}</td><td>{s['frames']}</td><td>{s['duration_s'] // 60}m {s['duration_s'] % 60}s</td>"
        f"<td>{'✓ stopped' if s['ended'] else '● recording / not stopped'}</td></tr>"
        for s in list_sessions()
    ) or "<tr><td colspan=6 class='muted'>No recordings yet. Start one from the extension popup.</td></tr>"
    return page("Recordings", f"<h1>Recordings</h1><p class='muted'>Saved in <code>data/sessions/</code></p>"
                f"<table><tr><th>Session</th><th>Persona</th><th>Events</th><th>Screenshots</th><th>Length</th><th>Status</th></tr>{rows}</table>")


def describe(e: dict[str, Any]) -> str:
    """One human-readable line per event, for the checking page."""
    tg = e.get("target") or {}
    label = tg.get("action") or tg.get("field") or tg.get("tag") or ""
    parts: list[str] = []
    if label:
        parts.append(f"<code>{html.escape(str(label))}</code>")
    if tg.get("text"):
        parts.append(f"“{html.escape(tg['text'])}”")
    if tg.get("entity"):
        parts.append(" ".join(f"{html.escape(k)}=<code>{html.escape(str(v))}</code>" for k, v in tg["entity"].items()))
    t = e.get("type")
    if t == "input":
        parts.append(f"{e.get('value_length')} chars, {e.get('value_kind')}")
    elif t == "change":
        parts.append(str(e.get("value_kind", "")))
    elif t in ("copy", "paste"):
        parts.append(f"{e.get('text_length')} chars")
    elif t == "keyburst":
        parts.append(f"{e.get('count')}× delete")
    elif t == "idle":
        parts.append(f"{e.get('seconds')} s with no activity")
    elif t == "tab_switch":
        parts.append(f"{html.escape(str(e.get('from_app')))} → {html.escape(str(e.get('to_app')))}")
    elif t == "navigate":
        parts.append(f"<code>{html.escape(str(e.get('url', '')))}</code> {html.escape(str(e.get('title', '')))}")
    elif t == "resume":
        parts.append(f"paused for {e.get('seconds')} s (nothing recorded)")
    elif t in ("session_start", "session_end"):
        parts.append(html.escape(str(e.get("persona", ""))))
    return " · ".join(p for p in parts if p)


@app.get("/sessions/{session}/view", response_class=HTMLResponse, include_in_schema=False)
def view_session(session: str) -> HTMLResponse:
    d = session_dir(session)
    events = sorted(read_jsonl(d / "events.jsonl"), key=lambda e: e.get("seq", 0))
    s = session_summary(d)
    t0 = events[0]["t"] if events else 0
    types = Counter(e.get("type") for e in events)
    apps = Counter(e.get("app") for e in events if e.get("app"))
    unlabeled = sum(1 for e in events if e.get("type") == "click" and not (e.get("target") or {}).get("action") and not (e.get("target") or {}).get("field"))
    chips = "".join(f"<span class='chip'>{html.escape(str(k))}: {v}</span>" for k, v in types.most_common())
    chips += "".join(f"<span class='chip'>app {html.escape(str(k))}: {v}</span>" for k, v in apps.most_common())
    warn = ""
    if unlabeled:
        warn += f"<div class='warn'>{unlabeled} clicks had no <code>data-action</code>/<code>data-field</code> label (clicks on empty space, or an element missing a label).</div>"
    if not s["ended"]:
        warn += "<div class='warn'>This session hasn't been stopped yet (or the Stop message didn't arrive). Refresh to see new events.</div>"

    def frame_cell(name: str | None) -> str:
        if not name:
            return ""
        src = f"/sessions/{session}/frames/{name}"
        return f"<img class='thumb' loading='lazy' src='{src}' alt='{name}' onclick=\"z('{src}')\"><span class='muted'>{name}</span>"

    rows = []
    for e in events:
        rel = (e.get("t", t0) - t0) / 1000
        frames = frame_cell(e.get("frame_after") or e.get("frame"))
        rows.append(
            f"<tr><td class='t'>{int(rel // 60)}:{rel % 60:04.1f}</td><td class='t'>#{e.get('seq', '')}</td>"
            f"<td class='type {html.escape(str(e.get('type')))}'>{html.escape(str(e.get('type')))}</td>"
            f"<td><span class='app'>{html.escape(str(e.get('app') or ''))}</span><br><span class='muted'>{html.escape(str(e.get('screen') or ''))}</span></td>"
            f"<td>{describe(e)}</td><td>{frames}</td></tr>"
        )
    body = (
        f"<p><a href='/view'>← All recordings</a></p><h1>{html.escape(session)}</h1>"
        f"<div class='muted'>Persona: {html.escape(s['persona'] or '—')} · {s['events']} events · {s['frames']} screenshots · "
        f"{s['duration_s'] // 60}m {s['duration_s'] % 60}s</div><div class='chips'>{chips}</div>{warn}"
        f"<table><tr><th>Time</th><th>Seq</th><th>Type</th><th>App / screen</th><th>Details</th><th>Screenshot</th></tr>{''.join(rows)}</table>"
        "<dialog id='zoom' onclick='this.close()'><img id='zimg' alt=''></dialog>"
        "<script>function z(s){document.getElementById('zimg').src=s;document.getElementById('zoom').showModal();}</script>"
    )
    return page(f"{session} – recording", body)
