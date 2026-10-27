"""Responsible-AI language check (no AI): flags model text that judges people instead of describing work.

The product describes processes, never individuals' performance, effort or mood (inferring emotions at work is
banned under the EU AI Act, and scoring individual workers would make this a monitoring tool). The prompts say
so; this check catches what slips through, so a human can rewrite it before anything reaches the client.
"""

from __future__ import annotations

import re
from typing import Any

# Words that rate a person, or guess at their feelings or effort.
JUDGING = {
    "performance": ["lazy", "careless", "incompetent", "sloppy", "underperform", "poor performer", "slow worker",
                    "unproductive", "inefficient employee", "inefficient worker", "low performer", "should be replaced",
                    "not trying", "wasting time", "the weakest", "worst performer", "best performer"],
    "emotion": ["frustrated", "stressed", "anxious", "angry", "bored", "confused", "overwhelmed", "nervous", "upset",
                "annoyed", "panicked", "tired", "unhappy", "motivated", "demotivated"],
}


def _texts(obj: Any, path: str = ""):
    if isinstance(obj, str):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from _texts(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _texts(v, f"{path}[{i}]")


def scan(**docs: Any) -> list[dict[str, str]]:
    """Every place where model output uses judging language, with the word and the sentence it's in."""
    hits = []
    for name, doc in docs.items():
        for path, text in _texts(doc):
            low = text.lower()
            for kind, words in JUDGING.items():
                for w in words:
                    if re.search(rf"\b{re.escape(w)}", low):
                        hits.append({"where": f"{name}.{path}", "kind": kind, "word": w, "text": text[:240]})
    return hits
