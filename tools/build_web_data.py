#!/usr/bin/env python3
"""
Bundle data/season.json + data/calendar.json into web/data.js.

Inlining as JS (rather than fetching JSON) means the app also works when the
file is opened directly from disk, with no server and no CORS surprises.

Usage: build_web_data.py
"""

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "web" / "data.js"


def main():
    season = json.loads((DATA / "season.json").read_text())
    calendar = json.loads((DATA / "calendar.json").read_text())

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Rebuild with: python3 tools/build_web_data.py\n"
        f"const SEASON = {json.dumps(season, indent=2)};\n\n"
        f"const CALENDAR = {json.dumps(calendar, indent=2)};\n"
    )

    days = len(calendar["days"])
    games = len(season["games"])
    print(f"web/data.js written — {games} games, {days} calendar days, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
