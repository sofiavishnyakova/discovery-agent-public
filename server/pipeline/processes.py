"""Stage 4d (Claude, text only): find the repeated processes across all sessions."""

from __future__ import annotations

import json
from typing import Any

from .common import strict

SYSTEM = """You are a process-discovery analyst preparing material for a Red Rock Technology consultant.
Red Rock builds AI agents that take over repetitive operational work; every action with economic or
contractual impact must stay under human approval.

You receive the work steps extracted from screen recordings of Accounts Payable clerks at Meridian Advisory
LLC, plus observations from their screenshots and basic stats. Identify the PROCESSES: kinds of work that
repeat (e.g. "supplier invoice entry", "answering supplier payment queries", "chasing approvals").

For each process:
- canonical_steps: the typical sequence in plain words.
- instances: every occurrence you can see, as the list of step ids it consists of (each step id in at most
  one instance), with its outcome and the work item (e.g. the invoice number).
- variations: how people did it differently (name the session/persona).
- exceptions: problems that came up (errors, duplicates, mismatches, missed checks) with step ids.
- approval_points: where a human decision with money/contract impact is needed, with step ids.
- automation_fit: score and concrete reasons; list the judgment calls an agent must escalate.
Refer to steps by their step number (e.g. 17) exactly as given in the input. Be specific and factual; don't invent volumes or causes.
Describe the work, never the person: do not rate, rank or compare individuals' speed, skill or effort, and never guess at feelings or mood. Call differences between people process variations."""

SCHEMA = strict({
    "type": "object",
    "properties": {
        "processes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "canonical_steps": {"type": "array", "items": {"type": "string"}},
                    "instances": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "session": {"type": "string"},
                                "work_item": {"type": "string"},
                                "step_ids": {"type": "array", "items": {"type": "integer"}},
                                "outcome": {"type": "string", "enum": ["completed", "failed", "blocked", "abandoned", "in_progress"]},
                            },
                        },
                    },
                    "variations": {"type": "array", "items": {"type": "string"}},
                    "exceptions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string"},
                                "description": {"type": "string"},
                                "step_ids": {"type": "array", "items": {"type": "integer"}},
                            },
                        },
                    },
                    "approval_points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "description": {"type": "string"},
                                "step_ids": {"type": "array", "items": {"type": "integer"}},
                            },
                        },
                    },
                    "automation_fit": {
                        "type": "object",
                        "properties": {
                            "score": {"type": "string", "enum": ["high", "medium", "low"]},
                            "reasons": {"type": "array", "items": {"type": "string"}},
                            "judgment_calls": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                },
            },
        },
    },
})


def step_numbers(steps_by_session: dict[str, dict[str, Any]]) -> list[str]:
    """Steps are shown to the model as plain numbers (1, 2, 3…): small models copy those far more reliably than
    ids like `lina-01:s012`. Index i+1 in this list is step number i+1."""
    return [s["id"] for d in steps_by_session.values() for s in d["steps"]]


def to_ids(numbers: list[int], ids: list[str]) -> list[str]:
    return [ids[n - 1] for n in numbers if isinstance(n, int) and 1 <= n <= len(ids)]


def build_request(steps_by_session: dict[str, dict[str, Any]], stats: dict[str, Any]) -> list[dict[str, Any]]:
    num = {sid: i + 1 for i, sid in enumerate(step_numbers(steps_by_session))}
    compact = []
    for sess, data in steps_by_session.items():
        for s in data["steps"]:
            ent = {k: v for k, v in s["entities"].items() if v}
            compact.append(f"step {num[s['id']]} [{sess}] t={s['start_s']:.0f}s dur={s['duration_s']:.0f}s {s['app']} {s['action']} | "
                           f"{s['description']}" + (f" | {json.dumps(ent)}" if ent else "") + (f" | flags={','.join(s['flags'])}" if s["flags"] else ""))
    obs = [f"{o['kind']} [{'shown by the app, a fact' if o.get('source') == 'recording' else 'seen by the analyst model'}] "
           f"(steps {', '.join(str(num[x]) for x in o['step_ids'] if x in num)}): {o['note']}"
           for d in steps_by_session.values() for o in d["observations"]]
    st = {k: {kk: v[kk] for kk in ("persona", "minutes", "tab_switches", "tab_switches_per_min", "bills_created", "copy_paste")}
          for k, v in stats.items()}
    for v in st.values():
        v["copy_paste"] = v["copy_paste"]["count"]
    text = ("Sessions and stats:\n" + json.dumps(st, indent=1) + "\n\nSteps:\n" + "\n".join(compact)
            + "\n\nObservations from screenshots:\n" + ("\n".join(obs) or "(none)"))
    return [{"type": "text", "text": text}]


def validate(result: dict[str, Any], steps_by_session: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Drops unknown step ids and steps claimed by two instances; records what was fixed."""
    ids = step_numbers(steps_by_session)
    for p in result["processes"]:
        for inst in p["instances"]:
            inst["step_ids"] = to_ids(inst["step_ids"], ids)
        for group in ("exceptions", "approval_points"):
            for item in p[group]:
                item["step_ids"] = to_ids(item["step_ids"], ids)
    known = set(ids)
    used: set[str] = set()
    warnings = []
    for p in result["processes"]:
        for inst in p["instances"]:
            keep = []
            for sid in inst["step_ids"]:
                if sid not in known:
                    warnings.append(f"{p['id']}: unknown step {sid} removed")
                elif sid in used:
                    warnings.append(f"{p['id']}: step {sid} already used by another instance, removed")
                else:
                    keep.append(sid)
                    used.add(sid)
            inst["step_ids"] = keep
        p["instances"] = [i for i in p["instances"] if i["step_ids"]]
        for group in ("exceptions", "approval_points"):
            for item in p[group]:
                item["step_ids"] = [s for s in item["step_ids"] if s in known]
    result["warnings"] = warnings
    return result
