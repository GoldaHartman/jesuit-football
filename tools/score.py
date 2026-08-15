#!/usr/bin/env python3
"""
Record a final score, then rebuild the app.

    score.py                          list every game and its id
    score.py week-1 28 14             Jesuit 28, Madison Prep 14
    score.py week-1 28 14 --note OT   add a note
    score.py 8th-2026-09-02-hannan 21 6
    score.py --clear week-1           remove a score

Jesuit's points always come first, whether home or away — the app works out
win or loss from that. Scores live in `results` in data/season.json, keyed by
game id, so nothing else about the schedule has to change.

Usage above; run with no arguments to see the ids.
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

sys.path.insert(0, str(ROOT / "tools"))
from build_web_data import extract_team_games


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def team_game_id(g):
    return f"{g['team']}-{g['date']}-{slug(g['opponent'])}"


def all_games():
    season = json.loads((DATA / "season.json").read_text())
    calendar = json.loads((DATA / "calendar.json").read_text())

    games = []
    for g in season["games"]:
        label = g["opponent"] if g["type"] == "preseason" else \
            f"{'vs' if g['isHome'] else 'at'} {g['opponent']}"
        games.append((g["id"], g["date"], "Varsity", label))

    for g in extract_team_games(calendar):
        games.append((team_game_id(g), g["date"], g["team"],
                      f"{'vs' if g['isHome'] else 'at'} {g['opponent']}"))

    games.sort(key=lambda x: (x[1], x[2]))
    return season, games


def show(season, games):
    results = season.get("results", {})
    print(f"{'id':38s} {'date':12s} {'team':8s} opponent")
    print("-" * 78)
    for gid, day, team, label in games:
        result = results.get(gid)
        mark = ""
        if result:
            us, them = result["us"], result["them"]
            outcome = "W" if us > them else "L" if us < them else "T"
            mark = f"   {outcome} {us}-{them}"
        print(f"{gid:38s} {day:12s} {team:8s} {label}{mark}")
    print(f"\n{len(results)} score(s) recorded.")


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("game", nargs="?", help="game id (run with no args to list)")
    parser.add_argument("us", nargs="?", type=int, help="Jesuit's points")
    parser.add_argument("them", nargs="?", type=int, help="opponent's points")
    parser.add_argument("--note", default="", help="e.g. OT, forfeit, weather")
    parser.add_argument("--clear", metavar="GAME", help="remove a recorded score")
    args = parser.parse_args()

    season, games = all_games()
    valid = {gid for gid, *_ in games}
    season.setdefault("results", {})

    if args.clear:
        if args.clear not in season["results"]:
            sys.exit(f"No score recorded for '{args.clear}'.")
        season["results"].pop(args.clear)
        print(f"Cleared {args.clear}.")
    elif args.game is None:
        show(season, games)
        return
    else:
        if args.game not in valid:
            close = [g for g in valid if args.game.lower() in g.lower()]
            hint = "\n  ".join(close[:8]) if close else "run with no arguments to list them"
            sys.exit(f"Unknown game id '{args.game}'.\nDid you mean:\n  {hint}")
        if args.us is None or args.them is None:
            sys.exit("Give both scores: score.py <game> <jesuit> <opponent>")
        if args.us < 0 or args.them < 0:
            sys.exit("Scores can't be negative.")

        season["results"][args.game] = {"us": args.us, "them": args.them, "note": args.note}
        outcome = "Won" if args.us > args.them else "Lost" if args.us < args.them else "Tied"
        label = next(l for gid, d, t, l in games if gid == args.game)
        print(f"{outcome} {args.us}-{args.them} — {label}")

    (DATA / "season.json").write_text(json.dumps(season, indent=2))
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_web_data.py")], check=True)
    print("\nCommit and push to put it on parents' phones.")


if __name__ == "__main__":
    main()
