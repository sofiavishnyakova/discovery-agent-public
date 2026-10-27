"""Re-measurement (no AI): compare a baseline analysis with one recorded after changes went live.

Processes are matched by name (the model names them freshly in each run), or by an explicit mapping. Every
number comes from the two costs.json files, so the comparison is as checkable as the costs themselves. If the
baseline's roadmap promised a saving, it is shown next to what was measured.
"""

from __future__ import annotations

import re
from typing import Any

STOP = {"and", "the", "of", "to", "for", "from", "a", "an", "in", "on", "by", "with"}


def _words(name: str) -> set[str]:
    return {w for w in re.findall(r"[a-z]+", name.lower()) if w not in STOP}


def match(before: dict[str, Any], after: dict[str, Any], mapping: dict[str, str] | None = None) -> dict[str, str | None]:
    """before process id -> after process id (or None), by word overlap of the names."""
    if mapping:
        return {b: mapping.get(b) for b in before["processes"]}
    out: dict[str, str | None] = {}
    taken: set[str] = set()
    for bid, bp in before["processes"].items():
        best, best_j = None, 0.0
        for aid, ap in after["processes"].items():
            if aid in taken:
                continue
            wb, wa = _words(bp["name"]), _words(ap["name"])
            j = len(wb & wa) / len(wb | wa) if wb | wa else 0
            if j > best_j:
                best, best_j = aid, j
        out[bid] = best if best_j >= 0.25 else None
        if out[bid]:
            taken.add(out[bid])
    return out


def _change(b: float, a: float) -> dict[str, Any]:
    return {"before": b, "after": a, "change": round(a - b, 2), "change_pct": round((a - b) / b * 100) if b else None}


def compare(before_costs: dict[str, Any], after_costs: dict[str, Any], mapping: dict[str, str] | None = None,
            promised: dict[str, Any] | None = None) -> dict[str, Any]:
    pairs = match(before_costs, after_costs, mapping)
    rows = []
    for bid, aid in pairs.items():
        b = before_costs["processes"][bid]
        a = after_costs["processes"].get(aid) if aid else None
        row: dict[str, Any] = {"before_id": bid, "after_id": aid, "name": b["name"], "after_name": a["name"] if a else None}
        if a:
            row["minutes_per_item"] = _change(b["avg_minutes_per_item"], a["avg_minutes_per_item"])
            row["rework_minutes_per_item"] = _change(b["rework_minutes_per_item"], a["rework_minutes_per_item"])
            row["monthly_aed"] = _change(b["monthly_aed"]["total"], a["monthly_aed"]["total"])
            row["confidence"] = {"before": (b.get("confidence") or {}).get("level"), "after": (a.get("confidence") or {}).get("level")}
            row["formula"] = ("Same assumptions as the baseline are needed for a fair comparison: "
                              f"before {before_costs['assumptions']['monthly_volume_main_process']}/month at AED "
                              f"{before_costs['assumptions']['clerk_rate_aed_per_hour']}/h, after "
                              f"{after_costs['assumptions']['monthly_volume_main_process']}/month at AED "
                              f"{after_costs['assumptions']['clerk_rate_aed_per_hour']}/h.")
        rows.append(row)
    saved = sum(-r["monthly_aed"]["change"] for r in rows if "monthly_aed" in r)
    out: dict[str, Any] = {
        "rows": rows,
        "measured_monthly_saving_aed": round(saved),
        "same_assumptions": before_costs["assumptions"] == after_costs["assumptions"],
        "unmatched_after": [aid for aid in after_costs["processes"] if aid not in pairs.values()],
    }
    if promised:
        p = sum(t["monthly_saving_aed"] for t in promised.get("plan", []))
        out["promised_monthly_saving_aed"] = p
        out["delivered_pct"] = round(saved / p * 100) if p else None
    return out
