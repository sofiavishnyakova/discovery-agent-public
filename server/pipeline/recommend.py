"""Stage 4g (no AI): turn the costed processes into a personalised roadmap of existing tools.

Vendor-neutral by construction: tools come from a curated catalogue (catalog.json) with no commercial
relationships, and every score is computed here with a published method, never by the model. Personalisation
comes from the client profile (what they already pay for, their systems, region, budget, data-residency rules).

How it works:
1. Every step of every observed occurrence is matched to one "need" (e.g. invoice capture, approvals) with plain
   keyword rules on the step's action, description and flags. Time in a need is measured, not guessed.
2. For each need, catalogue tools that cover it are scored out of 100 (see SCORING) and the saving is
   volume × measured minutes per item × the tool's typical automation rate × the clerk rate.
3. Work no tool covers well, plus the judgment calls an agent must escalate, becomes a spec for a custom build,
   to hand to a builder of the client's choice. We never build it ourselves.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CATALOG_PATH = Path(__file__).with_name("catalog.json")

DEFAULT_PROFILE = {
    "company": "Meridian Advisory LLC",
    "region": "uae",
    "stack": ["microsoft365"],
    "existing_tools": ["microsoft365"],
    "accounting_system": "LedgerPoint (in-house)",
    "monthly_budget_aed": 5000,
    "data_residency": "any",  # "any" | "in-country" (cloud hosted in the country, or on-premises)
    "prefer_no_code": True,
}

MAX_PAYBACK_MONTHS = 24

SCORING = {
    "fit": "40 if the tool is built for this need, 20 if it covers part of it",
    "stack": "25 if you already pay for it, 18 if it works with your systems, 8 otherwise",
    "region": "15 if sold and supported in your region, 8 if global only, 0 if not available",
    "residency": "10 if it meets your data-residency rule (in-country cloud or on-premises when required), else 0",
    "value": "10 if it pays back within 3 months, 7 within 6, 4 within 12, else 0",
    "penalties": "−10 over your monthly budget · −5 needs coding when you prefer no-code · −5 replaces your accounting system",
    "plan": f"The plan repeatedly adds the tool that saves the most net money on work not yet covered, if it is sold in your "
            f"region, meets your data-residency rule and pays back its setup within {MAX_PAYBACK_MONTHS} months.",
}

# Matched in this order: the first need whose rule fits a step gets the step's time.
NEED_RULES: list[tuple[str, dict[str, list[str]]]] = [
    ("duplicate_check", {"flags": ["rework", "error_shown", "missed_check", "exception"],
                         "words": ["duplicate", "correct", "fix", "re-enter", "reenter", "rejected", "resubmit", "validation"]}),
    ("approval_workflow", {"flags": ["approval_seeking", "wait"], "words": ["approval", "approve", "approver", "sign-off", "sign off"]}),
    ("po_matching", {"apps": ["procurehub"], "words": [" po ", "po number", "purchase order", "match", "balance"]}),
    ("email_followup", {"apps": ["mail"], "words": ["compose", "reply", "send email", "draft", "chase", "follow-up", "follow up", "email"]}),
    ("spreadsheet_tracking", {"apps": ["tracker"], "words": ["tracker", "spreadsheet", "sheet", "log row"]}),
    ("invoice_capture", {"flags": ["copy_paste"], "words": ["enter", "type", "copy", "paste", "invoice number", "invoice date",
                                                             "due date", "net amount", "vat", "amount", "new bill", "submit"]}),
    ("cross_app_transfer", {"flags": ["app_switching", "lookup"], "words": ["switch", "look up", "lookup", "open invoice", "open email"]}),
]


def load_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text())


def need_of(step: dict[str, Any]) -> str | None:
    text = f" {step.get('action', '')} {step.get('description', '')} {step.get('object', '')} ".lower().replace("_", " ")
    flags = set(step.get("flags") or [])
    for need, rule in NEED_RULES:
        if flags & set(rule.get("flags", [])) or step.get("app") in rule.get("apps", []) or any(w in text for w in rule.get("words", [])):
            return need
    return None


def _measure(process: dict[str, Any], steps: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Average minutes per occurrence spent in each need, plus the step ids that show it."""
    insts = [i for i in process["instances"] if i["outcome"] == "completed"] or process["instances"]
    out: dict[str, dict[str, Any]] = {}
    for inst in insts:
        for sid in inst["step_ids"]:
            s = steps.get(sid)
            if not s:
                continue
            n = need_of(s) or "other"
            m = out.setdefault(n, {"seconds": 0.0, "step_ids": []})
            m["seconds"] += s["duration_s"]
            m["step_ids"].append(sid)
    for m in out.values():
        m["minutes_per_item"] = round(m.pop("seconds") / len(insts) / 60, 2) if insts else 0
    return out


def _score(tool: dict[str, Any], need: str, saving: float, profile: dict[str, Any]) -> dict[str, Any]:
    owned = tool["id"] in profile["existing_tools"] or bool(set(tool.get("included_with", [])) & set(profile["existing_tools"]))
    fee = 0 if owned else tool["price_monthly_aed"]
    setup = tool["setup_aed"]
    net = saving - fee
    payback = round(setup / net, 1) if net > 0 else None
    region = profile["region"]
    residency_ok = profile["data_residency"] != "in-country" or bool({"in-country-cloud", "on-prem"} & set(tool["hosting"]))
    parts = {
        "fit": 40 if tool["needs"][need] == "primary" else 20,
        "stack": 25 if owned else 18 if set(tool["works_with"]) & set(profile["stack"]) else 8,
        "region": 15 if region in tool["regions"] else 8 if "global" in tool["regions"] else 0,
        "residency": 10 if residency_ok else 0,
        "value": 0 if payback is None else 10 if payback <= 3 else 7 if payback <= 6 else 4 if payback <= 12 else 0,
    }
    penalties = []
    if fee > profile["monthly_budget_aed"]:
        penalties.append(("over your monthly budget", -10))
    if profile.get("prefer_no_code") and not tool["no_code"]:
        penalties.append(("needs some coding", -5))
    if tool["category"] == "Accounting system" and not owned:
        penalties.append(("replaces your accounting system", -5))
    total = max(0, sum(parts.values()) + sum(p for _, p in penalties))
    return {
        "tool_id": tool["id"], "name": tool["name"], "vendor": tool["vendor"], "category": tool["category"], "note": tool["note"],
        "already_owned": owned, "coverage": tool["needs"][need], "score": total, "score_parts": parts,
        "penalties": [{"reason": r, "points": p} for r, p in penalties], "residency_ok": residency_ok,
        "monthly_fee_aed": fee, "setup_aed": setup, "setup_weeks": tool["setup_weeks"],
        "monthly_saving_aed": round(saving), "net_monthly_aed": round(net), "payback_months": payback,
    }


def compute(processes: dict[str, Any], steps_by_session: dict[str, dict[str, Any]], costs: dict[str, Any],
            profile: dict[str, Any] | None = None) -> dict[str, Any]:
    prof = {**DEFAULT_PROFILE, **(profile or {})}
    cat = load_catalog()
    tools = {t["id"]: t for t in cat["tools"]}
    steps = {s["id"]: s for d in steps_by_session.values() for s in d["steps"]}
    a = costs["assumptions"]
    out: dict[str, Any] = {
        "profile": prof, "catalog_version": cat["version"], "scoring": SCORING, "independence": cat["about"],
        "processes": {}, "plan": [],
    }
    work: list[dict[str, Any]] = []  # every (process, need) with a cost, for the plan below
    for pid in costs["ranking"]:
        p = next(x for x in processes["processes"] if x["id"] == pid)
        c = costs["processes"][pid]
        volume = c["est_monthly_volume"]
        measured = _measure(p, steps)
        if a.get("review_minutes_per_item"):
            measured["review_checking"] = {"minutes_per_item": a["review_minutes_per_item"], "step_ids": [], "assumed": True}
        needs = []
        for need, m in sorted(measured.items(), key=lambda kv: -kv[1]["minutes_per_item"]):
            if need == "other" or m["minutes_per_item"] <= 0:
                continue
            hourly = a["manager_rate_aed_per_hour"] if need == "review_checking" else a["clerk_rate_aed_per_hour"]
            per_item_aed = m["minutes_per_item"] * hourly / 60
            options = []
            for t in cat["tools"]:
                if need in t["needs"]:
                    share = t["automation_rate"] * (1 if t["needs"][need] == "primary" else 0.5)
                    o = _score(t, need, volume * per_item_aed * share, prof)
                    # The volume at which this tool alone would pay its monthly fee for this need.
                    o["break_even_volume"] = round(o["monthly_fee_aed"] / (per_item_aed * share)) if o["monthly_fee_aed"] else 0
                    options.append(o)
            options.sort(key=lambda o: (-o["score"], -o["net_monthly_aed"]))
            item = {
                "need": need, "label": cat["needs"][need], "minutes_per_item": m["minutes_per_item"], "step_ids": m["step_ids"],
                "measured": not m.get("assumed"),
                "monthly_hours": round(volume * m["minutes_per_item"] / 60, 1),
                "monthly_cost_aed": round(volume * per_item_aed),
                "formula": (f"{volume}/month × {m['minutes_per_item']} min "
                            f"{'(assumption)' if m.get('assumed') else 'measured'} per item × AED {hourly}/h × the tool's automation rate"
                            " (halved where it covers the need only partly)"),
                "options": options[:3], "in_plan": None,
            }
            needs.append(item)
            work.append({"pid": pid, "process": p["name"], "item": item, "volume": volume, "per_item_aed": per_item_aed})
        out["processes"][pid] = {"name": p["name"], "needs": needs, "custom_build": None, "_p": p, "_c": c}

    # The plan: repeatedly pick the eligible tool that saves the most net money on work not yet covered, so tools that
    # cover several needs (or that you already pay for) are preferred, and each fee is counted once.
    left = list(work)
    while True:
        best = None
        for t in cat["tools"]:
            cover = [w for w in left if w["item"]["need"] in t["needs"]]
            if not cover:
                continue
            ev = [_score(t, w["item"]["need"], 0, prof) for w in cover]
            # Swapping the accounting system is a project of its own, not a roadmap step: only suggested as an option.
            if t["category"] == "Accounting system" and not ev[0]["already_owned"] and prof.get("accounting_system"):
                continue
            if min(e["score_parts"]["region"] for e in ev) == 0 or not ev[0]["residency_ok"]:
                continue
            share = lambda w: t["automation_rate"] * (1 if t["needs"][w["item"]["need"]] == "primary" else 0.5)  # noqa: E731
            saving = sum(w["volume"] * w["per_item_aed"] * share(w) for w in cover)
            fee = ev[0]["monthly_fee_aed"]
            net = saving - fee
            fit = sum(e["score_parts"]["fit"] for e in ev) / len(ev)
            # Only tools that pay back their setup within two years make the plan.
            if net > 0 and t["setup_aed"] / net <= MAX_PAYBACK_MONTHS and fit >= 20 and (best is None or net > best["net"]):
                best = {"tool": t, "cover": cover, "saving": saving, "fee": fee, "net": net, "owned": ev[0]["already_owned"]}
        if not best:
            break
        t = best["tool"]
        line = {
            "tool_id": t["id"], "name": t["name"], "vendor": t["vendor"], "category": t["category"], "note": t["note"],
            "already_owned": best["owned"], "monthly_saving_aed": round(best["saving"]), "monthly_fee_aed": best["fee"],
            "net_monthly_aed": round(best["net"]), "setup_aed": t["setup_aed"], "setup_weeks": t["setup_weeks"],
            "payback_months": round(t["setup_aed"] / best["net"], 1),
            "covers": [{"process_id": w["pid"], "process": w["process"], "need": w["item"]["need"], "label": w["item"]["label"]}
                       for w in best["cover"]],
            "phase": ("Quick win (weeks 1–4)" if best["owned"] or t["setup_weeks"] <= 2 else
                      "Next (months 2–3)" if t["setup_weeks"] <= 6 else "Later (months 4–6)"),
        }
        out["plan"].append(line)
        for w in best["cover"]:
            w["item"]["in_plan"] = t["id"]
            left.remove(w)
    order = {"Quick win (weeks 1–4)": 0, "Next (months 2–3)": 1, "Later (months 4–6)": 2}
    out["plan"].sort(key=lambda t: (order[t["phase"]], -t["net_monthly_aed"]))
    out["total_net_monthly_aed"] = sum(t["net_monthly_aed"] for t in out["plan"])
    out["total_setup_aed"] = sum(t["setup_aed"] for t in out["plan"])
    out["not_covered"] = [{"process_id": w["pid"], "need": w["item"]["need"], "label": w["item"]["label"],
                           "monthly_cost_aed": w["item"]["monthly_cost_aed"]} for w in left]

    # Work no tool pays for, plus the judgment calls an agent must escalate, becomes a spec for a custom build.
    for pid, entry in out["processes"].items():
        p, c = entry.pop("_p"), entry.pop("_c")
        entry["confidence"] = (c.get("confidence") or {}).get("level")
        uncovered = [n for n in entry["needs"] if not n["in_plan"]]
        if not (uncovered or p["automation_fit"]["judgment_calls"]):
            continue
        other = _measure(p, steps).get("other", {"minutes_per_item": 0, "step_ids": []})
        entry["custom_build"] = {
            "title": f"Custom agent for: {p['name']}",
            "why": ("No catalogue tool pays back for " + ", ".join(n["label"][0].lower() + n["label"][1:] for n in uncovered)
                    + " at this volume." if uncovered else
                    "The tools in the plan cover the routine steps; these judgment calls need a custom agent with a human in the loop."),
            "trigger": p["canonical_steps"][0] if p["canonical_steps"] else "",
            "steps": p["canonical_steps"],
            "human_approval": [x["description"] for x in p["approval_points"]],
            "escalate": p["automation_fit"]["judgment_calls"],
            "known_exceptions": [e["description"] for e in p["exceptions"]][:6],
            "success_metric": f"Today: {c['avg_minutes_per_item']} min per item and {c['rework_minutes_per_item']} min of rework "
                              "(measured). Re-measure after go-live.",
            "evidence_step_ids": [s for n in uncovered for s in n["step_ids"]][:12] or other["step_ids"][:12],
            "handoff": "Hand this spec to a builder of your choice (an automation agency or your IT team). We don't build it, "
                       "so we have no stake in who does.",
        }
    return out
