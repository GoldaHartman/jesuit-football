#!/usr/bin/env python3
"""
Post a note to the app — the kind of thing that goes in the GroupMe and is
scrolled past an hour later.

    notice.py list
    notice.py add "Friday scrimmage rides" "Freshmen not 1-2-3 on the depth
        chart can leave at 6:00..." --on 2026-08-21 --from Coach
    notice.py add "Media Guide help wanted" "..." --until 2026-08-22
    notice.py remove 2

A notice shows on Today from the moment you post it until the day it's about
(or --until), then disappears on its own. If it names a date, it also shows on
that day in the Calendar.

Dates are YYYY-MM-DD.
"""

import argparse
import json
import pathlib
import subprocess
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
FILE = DATA / "notices.json"


def load():
    if not FILE.exists():
        return {"notices": []}
    return json.loads(FILE.read_text())


def save(book):
    FILE.write_text(json.dumps(book, indent=2))


def show(book):
    if not book["notices"]:
        print("No notices posted.")
        return
    today = date.today().isoformat()
    for i, n in enumerate(book["notices"]):
        until = n.get("until") or n.get("on") or "no end date"
        live = "live " if (not n.get("until") and not n.get("on")) or until >= today else "past "
        print(f"  [{i}] {live} {n.get('on') or '—':12s} until {until:12s} {n['title']}")
        print(f"        {n['body'][:88]}")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("list")

    a = sub.add_parser("add")
    a.add_argument("title")
    a.add_argument("body")
    a.add_argument("--on", help="the date this is about (YYYY-MM-DD)")
    a.add_argument("--until", help="hide after this date; defaults to --on")
    a.add_argument("--from", dest="source", default="", help='e.g. "Coach" or "Golda"')

    r = sub.add_parser("remove")
    r.add_argument("index", type=int)

    args = parser.parse_args()
    book = load()

    if args.cmd == "add":
        for field in ("on", "until"):
            value = getattr(args, field)
            if value:
                try:
                    date.fromisoformat(value)
                except ValueError:
                    sys.exit(f"--{field} must look like 2026-08-21")
        book["notices"].insert(0, {
            "title": args.title,
            "body": args.body,
            "on": args.on,
            "until": args.until or args.on,
            "from": args.source,
            "posted": date.today().isoformat(),
        })
        print(f"Posted: {args.title}")

    elif args.cmd == "remove":
        if not 0 <= args.index < len(book["notices"]):
            sys.exit(f"No notice [{args.index}]. Run: notice.py list")
        print(f"Removed: {book['notices'].pop(args.index)['title']}")

    else:
        show(book)
        return 0

    save(book)
    show(book)
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_web_data.py")], check=True)
    print("\nCommit and push to put it on parents' phones.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
