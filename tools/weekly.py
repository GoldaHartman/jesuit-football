#!/usr/bin/env python3
"""
The two things that need a human each week: the district table and the
spotlight.

    weekly.py standings                            show the table
    weekly.py standings "Brother Martin" 3 1        overall 3-1
    weekly.py standings "Brother Martin" 3 1 2 0    overall 3-1, district 2-0

    weekly.py spotlight "Hayes Ponder" "Three sacks and never came off the field."
    weekly.py spotlight --list
    weekly.py spotlight --remove 0                  drop the newest entry

Jesuit's own record comes from the scores you enter with score.py, so you
never type it twice — this only tracks the other seven schools.

Nobody publishes a machine-readable 9-5A table, so the rest is by hand.
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def load(name):
    return json.loads((DATA / name).read_text())


def save(name, payload):
    (DATA / name).write_text(json.dumps(payload, indent=2))


def jesuit_record():
    """Derived from recorded scores, so it can't drift from the schedule."""
    season = load("season.json")
    results = season.get("results", {})
    district_ids = {g["id"] for g in season["games"] if g.get("isDistrict")}

    w = l = dw = dl = 0
    for gid, r in results.items():
        if not isinstance(r, dict) or "us" not in r:
            continue
        won = r["us"] > r["them"]
        if gid in district_ids:
            dw, dl = dw + won, dl + (not won)
        # only varsity games count toward the varsity record
        if gid in {g["id"] for g in season["games"] if g["type"] == "regular"}:
            w, l = w + won, l + (not won)
    return w, l, dw, dl


def show_standings(table):
    w, l, dw, dl = jesuit_record()
    print(f"\n  {table['district']} — updated {table['updated'] or 'never'}\n")
    print(f"  {'team':20s} {'overall':>9s} {'district':>10s}")
    print("  " + "-" * 42)
    rows = []
    for team in table["teams"]:
        if team["name"] == "Jesuit":
            rows.append((team["name"], w, l, dw, dl, True))
        else:
            rows.append((team["name"], team["w"], team["l"], team["districtW"], team["districtL"], False))
    rows.sort(key=lambda r: (-(r[3]), r[4], -(r[1])))
    for name, tw, tl, tdw, tdl, is_us in rows:
        mark = " *" if is_us else "  "
        print(f"{mark}{name:20s} {f'{tw}-{tl}':>9s} {f'{tdw}-{tdl}':>10s}")
    print("\n  * Jesuit's record is derived from score.py — don't set it here.\n")


def main():
    parser = argparse.ArgumentParser(add_help=True)
    sub = parser.add_subparsers(dest="cmd")

    s = sub.add_parser("standings")
    s.add_argument("team", nargs="?")
    s.add_argument("w", nargs="?", type=int)
    s.add_argument("l", nargs="?", type=int)
    s.add_argument("dw", nargs="?", type=int)
    s.add_argument("dl", nargs="?", type=int)

    p = sub.add_parser("spotlight")
    p.add_argument("title", nargs="?")
    p.add_argument("body", nargs="?")
    p.add_argument("--list", action="store_true")
    p.add_argument("--remove", type=int, metavar="N")

    args = parser.parse_args()
    if not args.cmd:
        parser.print_help()
        return 0

    if args.cmd == "standings":
        table = load("standings.json")
        if not args.team:
            show_standings(table)
            return 0

        names = {t["name"].lower(): t for t in table["teams"]}
        match = names.get(args.team.lower())
        if not match:
            close = [n for n in names if args.team.lower() in n]
            sys.exit(f"Unknown team '{args.team}'. Known: {', '.join(sorted(names))}"
                     + (f"\nDid you mean: {', '.join(close)}" if close else ""))
        if match["name"] == "Jesuit":
            sys.exit("Jesuit's record comes from score.py — record the game there instead.")
        if args.w is None or args.l is None:
            sys.exit("Give at least overall wins and losses.")

        match["w"], match["l"] = args.w, args.l
        if args.dw is not None:
            match["districtW"] = args.dw
        if args.dl is not None:
            match["districtL"] = args.dl
        table["updated"] = date.today().isoformat()
        save("standings.json", table)
        print(f"{match['name']}: {match['w']}-{match['l']} overall, "
              f"{match['districtW']}-{match['districtL']} district")
        show_standings(table)

    elif args.cmd == "spotlight":
        book = load("spotlight.json")

        if args.list or (not args.title and args.remove is None):
            if not book["entries"]:
                print("No spotlight entries yet.")
            for i, e in enumerate(book["entries"]):
                print(f"  [{i}] {e['date']}  {e['title']}\n       {e['body'][:80]}")
            return 0

        if args.remove is not None:
            if not 0 <= args.remove < len(book["entries"]):
                sys.exit(f"No entry [{args.remove}].")
            gone = book["entries"].pop(args.remove)
            print(f"Removed: {gone['title']}")
        else:
            if not args.body:
                sys.exit('Give both: weekly.py spotlight "Name" "What he did."')
            book["entries"].insert(0, {
                "date": date.today().isoformat(),
                "title": args.title,
                "body": args.body,
            })
            print(f"Added: {args.title}")

        save("spotlight.json", book)

    subprocess.run([sys.executable, str(ROOT / "tools" / "build_web_data.py")], check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
