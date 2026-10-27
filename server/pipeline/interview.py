"""Stage 4f (Claude, text only): the consultant's brief and interview plan."""

from __future__ import annotations

import json
from typing import Any

from .common import strict
from .processes import step_numbers, to_ids

SECTIONS = ["Confirm volume", "Explain exceptions", "Find what we didn't see", "Approval & risk"]

SYSTEM = f"""You prepare a Red Rock Technology consultant for a discovery interview with a client's staff.
Red Rock builds AI agents that take over repetitive operational work; anything with economic or contractual
impact stays under human approval. The client is Meridian Advisory LLC (Accounts Payable team).

You receive the processes found in screen recordings, their cost estimates (computed from observed timings
plus clearly labelled assumptions), observations from screenshots, and session stats.

Write:
- headline: 3 short findings a consultant can say out loud, each grounded in what was observed.
- first_agent: which process Red Rock should automate first, why, and which steps must stay with a human.
- sections: exactly these four, in order: {", ".join(SECTIONS)}. 3–5 questions each.
  Each question has: the question as the consultant would ask it (refer to what was observed, e.g. "In the
  recording, Lina switched between Mail and LedgerPoint 78 times in 7 minutes..."), the hypothesis it tests,
  why it matters (link to cost or risk), evidence step numbers from the input, and a priority.
Questions must confirm the assumptions behind the cost numbers (volumes, hours, review time) and probe the
exceptions seen. Use only step numbers that appear in the input. Plain, specific language; no filler.
Describe the work, never the person: do not rate, rank or compare individuals' speed, skill or effort, and never guess at feelings or mood. Call differences between people process variations."""

SCHEMA = strict({
    "type": "object",
    "properties": {
        "headline": {"type": "array", "items": {"type": "string"}},
        "first_agent": {
            "type": "object",
            "properties": {
                "process_id": {"type": "string"},
                "why": {"type": "string"},
                "human_approval_steps": {"type": "array", "items": {"type": "string"}},
            },
        },
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "enum": SECTIONS},
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": {"type": "string"},
                                "hypothesis": {"type": "string"},
                                "why": {"type": "string"},
                                "evidence": {"type": "array", "items": {"type": "integer"}},
                                "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                            },
                        },
                    },
                },
            },
        },
    },
})


def build_request(processes: dict[str, Any], costs: dict[str, Any], steps_by_session: dict[str, dict[str, Any]],
                  stats: dict[str, Any]) -> list[dict[str, Any]]:
    num = {sid: i + 1 for i, sid in enumerate(step_numbers(steps_by_session))}
    nums = lambda ids: [num[i] for i in ids if i in num]  # noqa: E731
    procs = [{k: p[k] for k in ("id", "name", "description", "canonical_steps", "variations", "automation_fit")}
             | {g: [{**x, "step_ids": nums(x["step_ids"])} for x in p[g]] for g in ("exceptions", "approval_points")}
             | {"instances": [{"session": i["session"], "work_item": i["work_item"], "outcome": i["outcome"], "steps": nums(i["step_ids"])} for i in p["instances"]]}
             for p in processes["processes"]]
    obs = [{"kind": o["kind"], "note": o["note"], "steps": nums(o["step_ids"])} for d in steps_by_session.values() for o in d["observations"]]
    st = {k: {kk: v[kk] for kk in ("persona", "minutes", "tab_switches", "tab_switches_per_min", "bills_created", "failed_submit_seqs", "left_chrome")}
          | {"copy_paste": v["copy_paste"]["count"]} for k, v in stats.items()}
    text = (f"Processes:\n{json.dumps(procs, indent=1)}\n\nCost estimates:\n{json.dumps(costs, indent=1)}\n\n"
            f"Observations:\n{json.dumps(obs, indent=1)}\n\nSession stats:\n{json.dumps(st, indent=1)}")
    return [{"type": "text", "text": text}]


def validate(result: dict[str, Any], steps_by_session: dict[str, dict[str, Any]]) -> dict[str, Any]:
    ids = step_numbers(steps_by_session)
    dropped = 0
    for sec in result["sections"]:
        for q in sec["questions"]:
            before = len(q["evidence"])
            q["evidence"] = to_ids(q["evidence"], ids)
            dropped += before - len(q["evidence"])
    result["warnings"] = [f"{dropped} unknown evidence ids removed"] if dropped else []
    return result
