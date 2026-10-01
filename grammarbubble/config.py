"""Settings stored in ~/.grammarbubble/config.json (created on first run)."""

from __future__ import annotations

import json
import os
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("GRAMMARBUBBLE_HOME", Path.home() / ".grammarbubble"))
CONFIG_PATH = CONFIG_DIR / "config.json"

DEFAULTS = {
    # "claude" (Claude API, best quality) or "ollama" (fully offline).
    "backend": "claude",
    "claude_model": "claude-opus-5-5",
    # low | medium | high — higher is more thorough but slower.
    "claude_effort": "medium",
    # Leave empty to use the ANTHROPIC_API_KEY environment variable.
    "anthropic_api_key": "",
    "ollama_model": "qwen2.5:7b",
    "ollama_url": "http://localhost:11434",
    # Language for explanations of each correction.
    "explain_in": "Vietnamese",
    # auto | en | ko
    "language": "auto",
    # keep | formal | academic | friendly
    "tone": "keep",
    "max_chars": 8000,
    "bubble_x": None,
    "bubble_y": None,
}


def read() -> dict:
    """Settings from disk merged over DEFAULTS. Raises ValueError if the file is broken."""
    cfg = dict(DEFAULTS)
    if not CONFIG_PATH.exists():
        return cfg
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as e:
        raise ValueError(f"{CONFIG_PATH}: {e}") from None
    if not isinstance(data, dict):
        raise ValueError(f"{CONFIG_PATH}: expected a JSON object")
    cfg.update(data)
    return cfg


def load() -> dict:
    """Startup load: falls back to defaults (without overwriting) if the file is broken."""
    try:
        cfg = read()
    except ValueError as e:
        print(f"[grammarbubble] Ignoring unreadable config: {e}")
        return dict(DEFAULTS)
    if not CONFIG_PATH.exists():
        save(cfg)
    return cfg


def save(cfg: dict) -> None:
    try:
        read()
    except ValueError:
        return  # never overwrite a file the user is still fixing by hand
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    except OSError as e:
        print(f"[grammarbubble] Could not save {CONFIG_PATH}: {e}")
