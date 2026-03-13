"""
Persistent storage for the company watchlist.
Companies are stored in a JSON file on disk.
"""

import json
import os
from pathlib import Path
from typing import Optional

DEFAULT_STORAGE_PATH = Path.home() / ".mcp_news_server" / "companies.json"


def _get_storage_path() -> Path:
    path_str = os.environ.get("COMPANIES_STORAGE_PATH")
    if path_str:
        return Path(path_str)
    return DEFAULT_STORAGE_PATH


def _load_data() -> dict:
    path = _get_storage_path()
    if not path.exists():
        return {"companies": {}}
    with open(path) as f:
        return json.load(f)


def _save_data(data: dict) -> None:
    path = _get_storage_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def add_company(name: str, description: Optional[str] = None) -> dict:
    """Add a company to the watchlist. Returns the company entry."""
    data = _load_data()
    key = name.strip().lower()
    if key in data["companies"]:
        return {"status": "already_exists", "company": data["companies"][key]}
    entry = {
        "name": name.strip(),
        "description": description or "",
        "key": key,
    }
    data["companies"][key] = entry
    _save_data(data)
    return {"status": "added", "company": entry}


def remove_company(name: str) -> dict:
    """Remove a company from the watchlist. Returns status."""
    data = _load_data()
    key = name.strip().lower()
    if key not in data["companies"]:
        return {"status": "not_found", "key": key}
    removed = data["companies"].pop(key)
    _save_data(data)
    return {"status": "removed", "company": removed}


def list_companies() -> list[dict]:
    """Return all companies in the watchlist."""
    data = _load_data()
    return list(data["companies"].values())


def get_company_names() -> list[str]:
    """Return just the display names of all companies."""
    return [c["name"] for c in list_companies()]
