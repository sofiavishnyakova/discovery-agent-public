"""Run the analysis pipeline on this computer, using the model loaded in LM Studio.

  cd server
  .venv/bin/python -m pipeline.run --sessions lina-01 --estimate              # checks LM Studio, shows request sizes
  .venv/bin/python -m pipeline.run --sessions lina-01 --stage steps           # one stage
  .venv/bin/python -m pipeline.run --sessions sara-02 lina-01                 # full run (finished stages are reused)
  .venv/bin/python -m pipeline.run --sessions sara-02 lina-01 --rerun interview   # redo one stage

Results go to data/results/<batch>/. Nothing leaves this computer.
"""

from __future__ import annotations

import argparse
import sys

from . import costs as costs_mod
from . import interview, processes, steps
from .clean import load_events
from .common import VISION, LLMError, approx_tokens, call_json, load_json, model_name, results_dir, save_json
from .stats import session_stats

STAGES = ["steps", "processes", "interview"]
MAX_TOKENS = {"steps": 8000, "processes": 12000, "interview": 12000}


def _size(system: str, content: list[dict]) -> int:
    return approx_tokens(system) + sum(approx_tokens(b["text"]) for b in content if b["type"] == "text") + \
        sum(1500 for b in content if b["type"] == "image" and VISION)


def main() -> int:
    ap = argparse.ArgumentParser(description="Discovery Agent analysis pipeline (local model via LM Studio)")
    ap.add_argument("--sessions", nargs="+", required=True, help="recording ids, e.g. sara-02 lina-01")
    ap.add_argument("--batch", default=None, help="results folder name (default: sessions joined with +)")
    ap.add_argument("--stage", choices=STAGES + ["all"], default="all", help="run up to and including this stage")
    ap.add_argument("--estimate", action="store_true", help="check LM Studio and show request sizes without running")
    ap.add_argument("--force", action="store_true", help="re-run all stages even if results exist")
    ap.add_argument("--rerun", nargs="+", choices=STAGES, default=[], help="re-run only these stages, e.g. --rerun interview")
    args = ap.parse_args()

    batch = args.batch or "+".join(args.sessions)
    out = results_dir(batch)
    last = STAGES.index(args.stage) if args.stage != "all" else len(STAGES) - 1
    wanted = STAGES[: last + 1]

    try:
        model = model_name()
    except LLMError as e:
        print(f"✖ {e}", file=sys.stderr)
        if not args.estimate:
            return 1
        model = "(LM Studio not running)"
    print(f"Batch {batch} · local model {model} · screenshots {'on' if VISION else 'off'} · stages {', '.join(wanted)}"
          + (" · ESTIMATE ONLY" if args.estimate else ""))

    stats = {s: session_stats(s, load_events(s)) for s in args.sessions}
    save_json(out / "stats.json", stats)
    rerun = lambda stage: args.force or stage in args.rerun  # noqa: E731

    try:
        # ---- steps: one or more requests per session ----
        steps_by_session = {}
        for s in args.sessions:
            path = out / f"steps_{s}.json"
            if path.exists() and not rerun("steps"):
                steps_by_session[s] = load_json(path)
                print(f"  steps {s}: reusing saved result")
                continue
            chunks, ctx = steps.build_chunks(s)
            if args.estimate:
                sizes = [_size(steps.SYSTEM, c) for c in chunks]
                print(f"  steps {s}: {len(ctx['cleaned'])} events → {len(ctx['segments'])} steps in {len(chunks)} request(s) of ~{max(sizes):,} tokens "
                      f"(LM Studio's context length must be at least ~{max(sizes) + MAX_TOKENS['steps']:,})")
                continue
            parts = []
            for i, c in enumerate(chunks):
                # Each finished part is saved, so a failure later doesn't throw away slow local work.
                ppath = out / f"steps_{s}.part{i + 1}of{len(chunks)}.json"
                if ppath.exists() and not rerun("steps"):
                    parts.append(load_json(ppath))
                    print(f"  steps {s} part {i + 1}/{len(chunks)}: reusing saved part")
                    continue
                part = call_json(system=steps.SYSTEM, content=c, schema=steps.SCHEMA, max_tokens=MAX_TOKENS["steps"],
                                 stage=f"steps {s} part {i + 1}/{len(chunks)}", batch=batch, thinking=False)
                save_json(ppath, part)
                parts.append(part)
            result = steps.finalize(s, steps.merge_chunks(parts), ctx)
            save_json(path, result)
            steps_by_session[s] = result
            for w in result["warnings"]:
                print(f"    ⚠ {w}")
            print(f"    {len(result['steps'])} steps, {len(result['observations'])} observations")

        if "processes" not in wanted or len(steps_by_session) < len(args.sessions):
            if args.estimate and "processes" in wanted:
                print("  processes, interview: sizes known once steps exist (usually ~5,000–10,000 tokens each)")
            return _done(args)

        # ---- processes ----
        ppath = out / "processes.json"
        if ppath.exists() and not rerun("processes"):
            procs = load_json(ppath)
            print("  processes: reusing saved result")
        else:
            content = processes.build_request(steps_by_session, stats)
            if args.estimate:
                print(f"  processes: 1 request of ~{_size(processes.SYSTEM, content):,} tokens")
                return _done(args)
            procs = processes.validate(call_json(system=processes.SYSTEM, content=content, schema=processes.SCHEMA,
                                                 max_tokens=MAX_TOKENS["processes"], stage="processes", batch=batch), steps_by_session)
            save_json(ppath, procs)
            for w in procs["warnings"]:
                print(f"    ⚠ {w}")
            print(f"    {len(procs['processes'])} processes: " + "; ".join(p["name"] for p in procs["processes"]))

        # ---- costs (plain Python) ----
        cost = costs_mod.compute(procs, steps_by_session, stats)
        save_json(out / "costs.json", cost)
        for pid in cost["ranking"]:
            c = cost["processes"][pid]
            print(f"    {c['name']}: ~AED {c['monthly_aed']['total']:,}/month (≈ ${c['monthly_usd_total']:,}), fit {c['automation_fit']}")
        if "interview" not in wanted:
            return _done(args)

        # ---- interview plan ----
        ipath = out / "interview_plan.json"
        if ipath.exists() and not rerun("interview"):
            print("  interview: reusing saved result")
        else:
            content = interview.build_request(procs, cost, steps_by_session, stats)
            if args.estimate:
                print(f"  interview: 1 request of ~{_size(interview.SYSTEM, content):,} tokens")
                return _done(args)
            plan = interview.validate(call_json(system=interview.SYSTEM, content=content, schema=interview.SCHEMA,
                                                max_tokens=MAX_TOKENS["interview"], stage="interview", batch=batch), steps_by_session)
            save_json(ipath, plan)
            print(f"    {sum(len(s['questions']) for s in plan['sections'])} questions; first agent: {plan['first_agent']['process_id']}")
    except LLMError as e:
        print(f"✖ {e}", file=sys.stderr)
        return 1
    return _done(args)


def _done(args) -> int:
    print("Nothing was run (estimate only)." if args.estimate else "Done. Timings per request are in usage.jsonl.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
