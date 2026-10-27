"""Stage 4e (no AI): monthly cost per process, in Red Rock's three buckets. Every number has its formula.

Volume is the one number recordings can't tell us (a few minutes of recording says nothing about a month),
so it is an explicit assumption: how many items the busiest process handles per month. Other processes are
scaled by how often they appeared relative to it. The interview plan asks the client to confirm it.
"""

from __future__ import annotations

from typing import Any

AED_PER_USD = 3.6725

DEFAULT_ASSUMPTIONS = {
    # Supplier invoices per month for a ~120-person consulting firm (assumption to confirm in the interview).
    "monthly_volume_main_process": 350,
    "clerk_rate_aed_per_hour": 60,
    "manager_rate_aed_per_hour": 150,
    "review_minutes_per_item": 2,  # manager/senior time checking each item before it goes out
    "max_gap_s": 30,  # gaps between an instance's steps shorter than this count as working time
}


def _instance_seconds(step_ids: list[str], steps: dict[str, dict[str, Any]], max_gap: float) -> tuple[float, float]:
    """(total working seconds, rework seconds) for one instance."""
    ss = sorted((steps[i] for i in step_ids if i in steps), key=lambda s: s["start_s"])
    total = sum(s["duration_s"] for s in ss)
    for a, b in zip(ss, ss[1:]):
        gap = b["start_s"] - a["end_s"]
        if a["session"] == b["session"] and 0 < gap < max_gap:
            total += gap
    rework = sum(s["duration_s"] for s in ss if {"rework", "error_shown"} & set(s["flags"]))
    return total, rework


# How much we need to see before a number is trustworthy: enough repetitions to separate the normal path from
# exceptions, from enough people to see more than one way of working.
CONFIDENCE_RULES = {"high": {"instances": 20, "people": 3}, "medium": {"instances": 5, "people": 2}}


def confidence(instances: int, people: int) -> dict[str, Any]:
    """How far to trust a process's numbers, from how often (and by how many people) it was seen."""
    level = next((lvl for lvl, r in CONFIDENCE_RULES.items() if instances >= r["instances"] and people >= r["people"]), "low")
    hi = CONFIDENCE_RULES["high"]
    need = []
    if instances < hi["instances"]:
        need.append(f"{hi['instances'] - instances} more occurrences")
    if people < hi["people"]:
        need.append(f"{hi['people'] - people} more {'person' if hi['people'] - people == 1 else 'people'}")
    return {
        "level": level,
        "instances": instances,
        "people": people,
        "reason": f"Seen {instances}× from {people} {'person' if people == 1 else 'people'}.",
        "to_reach_high": ("Record " + " and ".join(need) + ".") if need else "",
        "rule": f"high: ≥{hi['instances']} occurrences from ≥{hi['people']} people; "
                f"medium: ≥{CONFIDENCE_RULES['medium']['instances']} from ≥{CONFIDENCE_RULES['medium']['people']}; otherwise low",
    }


def compute(processes: dict[str, Any], steps_by_session: dict[str, dict[str, Any]], stats: dict[str, Any],
            assumptions: dict[str, Any] | None = None) -> dict[str, Any]:
    a = {**DEFAULT_ASSUMPTIONS, **(assumptions or {})}
    steps = {s["id"]: s for d in steps_by_session.values() for s in d["steps"]}
    observed_hours = sum(v["minutes"] for v in stats.values()) / 60
    procs = [p for p in processes["processes"] if p["instances"]]
    most_seen = max((len(p["instances"]) for p in procs), default=1)
    out: dict[str, Any] = {"assumptions": a, "observed_hours": round(observed_hours, 2), "currency": "AED", "processes": {}}
    for p in procs:
        insts = p["instances"]
        done = [i for i in insts if i["outcome"] == "completed"] or insts
        secs = [_instance_seconds(i["step_ids"], steps, a["max_gap_s"]) for i in done]
        avg_min = sum(s for s, _ in secs) / len(secs) / 60
        rework_min = sum(r for _, r in secs) / len(secs) / 60
        share = len(insts) / most_seen
        volume = a["monthly_volume_main_process"] * share
        manual = volume * avg_min / 60 * a["clerk_rate_aed_per_hour"]
        rework = volume * rework_min / 60 * a["clerk_rate_aed_per_hour"]
        checking = volume * a["review_minutes_per_item"] / 60 * a["manager_rate_aed_per_hour"]
        total = manual + rework + checking
        volume_formula = (f"{a['monthly_volume_main_process']}/month (assumption)" if share == 1 else
                          f"{a['monthly_volume_main_process']}/month × {len(insts)}/{most_seen} (seen {len(insts)}× vs {most_seen}× for the main process)")
        out["processes"][p["id"]] = {
            "name": p["name"],
            "instances_observed": len(insts),
            "instances_completed": sum(1 for i in insts if i["outcome"] == "completed"),
            "sessions": sorted({i["session"] for i in insts}),
            "avg_minutes_per_item": round(avg_min, 2),
            "rework_minutes_per_item": round(rework_min, 2),
            "est_monthly_volume": round(volume),
            "monthly_aed": {"manual": round(manual), "rework": round(rework), "checking": round(checking), "total": round(total)},
            "monthly_usd_total": round(total / AED_PER_USD),
            "annual_aed_total": round(total * 12),
            "annual_usd_total": round(total * 12 / AED_PER_USD),
            "monthly_hours": round(volume * (avg_min + rework_min) / 60, 1),
            "formulas": {
                "volume": volume_formula,
                "manual": f"{volume:.0f}/month × {avg_min:.1f} min observed per item × AED {a['clerk_rate_aed_per_hour']}/h",
                "rework": f"{volume:.0f}/month × {rework_min:.1f} min rework observed per item × AED {a['clerk_rate_aed_per_hour']}/h",
                "checking": f"{volume:.0f}/month × {a['review_minutes_per_item']} min review × AED {a['manager_rate_aed_per_hour']}/h (assumption)",
            },
            "automation_fit": p["automation_fit"]["score"],
            # Two recordings of the same person count as one person.
            "confidence": confidence(len(insts), len({(stats.get(i["session"]) or {}).get("persona") or i["session"] for i in insts})),
        }
    ranked = sorted(out["processes"].items(), key=lambda kv: -kv[1]["monthly_aed"]["total"])
    out["ranking"] = [k for k, _ in ranked]
    return out
