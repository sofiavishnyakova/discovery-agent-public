"""Shared helpers: paths, settings, and calls to the local model (LM Studio) with structured JSON output.

Everything runs on this computer: LM Studio serves the model at http://localhost:1234 and nothing is sent
to an outside service. Settings can be overridden in server/.env:

  LLM_BASE_URL=http://localhost:1234/v1   # LM Studio's local server
  LLM_MODEL=                               # empty = use the model currently loaded in LM Studio
  LLM_VISION=0                             # 1 = the loaded model can read screenshots
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SESSIONS_DIR = ROOT / "data" / "sessions"
RESULTS_DIR = ROOT / "data" / "results"


def load_env() -> None:
    """Reads server/.env (KEY=value lines) into the environment."""
    env = ROOT / "server" / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


load_env()
BASE_URL = os.environ.get("LLM_BASE_URL", "http://localhost:1234/v1").rstrip("/")
VISION = os.environ.get("LLM_VISION", "0") == "1"
REQUEST_TIMEOUT_S = int(os.environ.get("LLM_TIMEOUT_S", "1800"))


def results_dir(batch: str) -> Path:
    d = RESULTS_DIR / batch
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def approx_tokens(text: str) -> int:
    return len(text) // 4


class LLMError(RuntimeError):
    pass


def _request(method: str, path: str, body: dict | None = None, timeout: int = 10) -> dict:
    req = urllib.request.Request(
        f"{BASE_URL}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise LLMError(f"LM Studio returned {e.code}: {e.read().decode(errors='replace')[:400]}") from None
    except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
        raise LLMError(
            f"Can't reach LM Studio at {BASE_URL} ({getattr(e, 'reason', e)}). Open LM Studio, load a model, "
            "and start the local server (Developer tab → Start server)."
        ) from None


def model_name() -> str:
    """The model to use: LLM_MODEL if set, otherwise the one loaded in LM Studio."""
    if os.environ.get("LLM_MODEL"):
        return os.environ["LLM_MODEL"]
    models = [m["id"] for m in _request("GET", "/models").get("data", []) if "embed" not in m["id"].lower()]
    if not models:
        raise LLMError("LM Studio is running but no model is loaded. Load a model in LM Studio first.")
    return models[0]


def _to_openai_content(content: list[dict]) -> list[dict]:
    """Converts our content blocks to the chat format LM Studio expects. Images are skipped unless LLM_VISION=1."""
    out = []
    for block in content:
        if block["type"] == "text":
            out.append({"type": "text", "text": block["text"]})
        elif block["type"] == "image" and VISION:
            out.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{block['source']['data']}"}})
    return out


def _extract_json(text: str) -> dict:
    """Some local models wrap JSON in <think> blocks or code fences; take the JSON object out."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def call_json(*, system: str, content: list[dict], schema: dict, max_tokens: int, stage: str, batch: str,
              thinking: bool = True) -> dict:
    """One local-model call that must return JSON matching `schema`. Logs tokens and time to usage.jsonl.

    thinking=False switches off the model's reasoning: much faster for simple description tasks.
    """
    model = model_name()
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": _to_openai_content(content)}],
        "response_format": {"type": "json_schema", "json_schema": {"name": re.sub(r"\W", "_", stage), "strict": True, "schema": schema}},
        "temperature": 0.2,
        "max_tokens": max_tokens,
        "stream": False,
    }
    if not thinking:
        body["reasoning_effort"] = "none"
    started = time.time()
    resp = _request("POST", "/chat/completions", body, timeout=REQUEST_TIMEOUT_S)
    secs = time.time() - started
    usage = resp.get("usage") or {}
    choice = (resp.get("choices") or [{}])[0]
    with (results_dir(batch) / "usage.jsonl").open("a") as log:
        log.write(json.dumps({
            "stage": stage, "model": model, "input_tokens": usage.get("prompt_tokens"), "output_tokens": usage.get("completion_tokens"),
            "usd": 0, "seconds": round(secs, 1), "finish_reason": choice.get("finish_reason"), "at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }) + "\n")
    print(f"  {stage}: {usage.get('prompt_tokens', '?')} in / {usage.get('completion_tokens', '?')} out tokens, {secs:.0f}s on {model}")

    if choice.get("finish_reason") == "length":
        raise LLMError(f"{stage}: the model ran out of output space (max_tokens={max_tokens}) or context. "
                       "Increase the context length in LM Studio (Load settings → Context Length).")
    msg = choice.get("message") or {}
    # With thinking models (e.g. Qwen3.5), LM Studio sometimes puts the structured answer in reasoning_content.
    text = msg.get("content") or msg.get("reasoning_content") or ""
    try:
        return _extract_json(text)
    except json.JSONDecodeError:
        raise LLMError(f"{stage}: the model didn't return valid JSON. Start of reply: {text[:300]!r}") from None


def strict(schema: dict) -> dict:
    """Marks every object in a JSON schema as closed with all properties required (what structured outputs expect)."""
    if schema.get("type") == "object":
        props = schema.get("properties", {})
        schema["additionalProperties"] = False
        schema["required"] = list(props)
        for p in props.values():
            strict(p)
    elif schema.get("type") == "array":
        strict(schema["items"])
    return schema
