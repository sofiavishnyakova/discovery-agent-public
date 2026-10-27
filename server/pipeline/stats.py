"""Stage 4c (no AI): counts and timings computed straight from the event log."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any


def session_stats(session: str, raw: list[dict[str, Any]]) -> dict[str, Any]:
    events = [e for e in raw if e["type"] not in ("session_start", "session_end")]
    if not events:
        return {"session": session, "minutes": 0}
    t0, t1 = raw[0]["t"], raw[-1]["t"]
    # Time while the person paused the recording is neither work nor idle.
    paused_ms = 0.0
    paused_since = None
    for e in raw:
        if e["type"] == "pause":
            paused_since = e["t"]
        elif e["type"] == "resume" and paused_since is not None:
            paused_ms += e["t"] - paused_since
            paused_since = None
    if paused_since is not None:
        paused_ms += t1 - paused_since
    minutes = (t1 - t0 - paused_ms) / 60000

    # Time per app: each gap between events is credited to the app of the earlier event.
    app_seconds: dict[str, float] = defaultdict(float)
    for a, b in zip(raw, raw[1:]):
        if a["type"] == "pause":
            continue  # paused time belongs to no app
        gap = min((b["t"] - a["t"]) / 1000, 60)  # cap long gaps so one pause doesn't dominate
        app_seconds[a.get("app") or "unknown"] += gap

    switches = [e for e in events if e["type"] == "tab_switch"]
    pairs = Counter((e.get("from_app"), e.get("to_app")) for e in switches)

    # Copy in one place → paste in another within 60 s.
    copy_paste = []
    last_copy = None
    for e in events:
        tg = e.get("target") or {}
        if e["type"] == "copy":
            last_copy = e
        elif e["type"] == "paste" and last_copy and e["t"] - last_copy["t"] < 60000:
            src = last_copy.get("target") or {}
            copy_paste.append({
                "from": f"{last_copy.get('app')}:{src.get('field') or src.get('tag')}",
                "to": f"{e.get('app')}:{tg.get('field') or tg.get('tag')}",
                "copy_seq": last_copy["seq"], "paste_seq": e["seq"],
            })

    # Bill submissions: a submit followed within 4 s by a "created" page is a success, otherwise it bounced.
    submits = [e for e in events if e["type"] == "click" and (e.get("target") or {}).get("action") == "submit-bill"]
    created = [e for e in events if e["type"] == "navigate" and "created=1" in (e.get("url") or "")]
    bills = [re.search(r"LP-\d{4}-\d+", e["url"]).group(0) for e in created if re.search(r"LP-\d{4}-\d+", e["url"])]
    failed_submits = [s["seq"] for s in submits if not any(0 <= c["t"] - s["t"] < 4000 for c in created)]

    keybursts = [e for e in events if e["type"] == "keyburst"]
    idle = [e for e in events if e["type"] == "idle"]
    pauses = [e for e in events if e["type"] == "pause"]
    outside = [e for e in switches if e.get("to_app") == "outside"]
    docs_opened = sorted({(e.get("target") or {}).get("entity", {}).get("docId") for e in events
                          if (e.get("target") or {}).get("action") == "open-attachment"} - {None})
    emails_sent = [e["seq"] for e in events if (e.get("target") or {}).get("action") == "send-email"]
    screen_messages = [{"seq": e["seq"], "severity": e.get("severity"), "message": e.get("message")}
                       for e in events if e["type"] == "message" and e.get("severity") in ("error", "warning")]

    return {
        "session": session,
        "persona": next((e.get("persona") for e in raw if e.get("persona")), None),
        "minutes": round(minutes, 1),
        "paused_minutes": round(paused_ms / 60000, 1),
        "pauses": len(pauses),
        "events": len(events),
        "time_per_app_min": {k: round(v / 60, 1) for k, v in sorted(app_seconds.items(), key=lambda x: -x[1])},
        "tab_switches": len(switches),
        "tab_switches_per_min": round(len(switches) / minutes, 1) if minutes else 0,
        "top_switch_pairs": [{"from": f, "to": t, "count": c} for (f, t), c in pairs.most_common(4)],
        "copy_paste": {"count": len(copy_paste), "pairs": copy_paste},
        "bills_created": bills,
        "bill_submits": len(submits),
        "failed_submit_seqs": failed_submits,
        "delete_bursts": [{"seq": e["seq"], "field": (e.get("target") or {}).get("field"), "count": e.get("count")} for e in keybursts],
        "idle_periods": [{"seq": e["seq"], "seconds": e.get("seconds")} for e in idle],
        "left_chrome": len(outside),
        "documents_opened": docs_opened,
        "emails_sent_seqs": emails_sent,
        "screen_errors": screen_messages,
    }
