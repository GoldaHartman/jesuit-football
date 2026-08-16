#!/usr/bin/env python3
"""
Bundle data/season.json + data/calendar.json into web/data.js.

Inlining as JS (rather than fetching JSON) means the app also works when the
file is opened directly from disk, with no server and no CORS surprises.

Usage: build_web_data.py
"""

import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "data.js"

# The coach's calendar buries the sub-varsity games inside the day cells, like
# "JH vs Shaw 6:30" or "9th at Chalmette 5:00". Pull them out so each team gets
# a real schedule. Varsity isn't here — those are the ten games in season.json.
TEAM_OF = {"JH": "8th", "9TH": "9th", "FR": "9th", "JV": "JV"}

MARKER = re.compile(r"\b(JH|9th|FR|JV)\s+(vs|at)\b\.?\s*", re.I)
TIME = re.compile(r"\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b", re.I)


def extract_team_games(calendar):
    """Every JH / 9th / FR / JV game found in the calendar, in date order."""
    games = []

    for day in calendar["days"]:
        for item in day["items"]:
            hits = list(MARKER.finditer(item))
            for i, hit in enumerate(hits):
                # the chunk runs to the next team marker, or the end of the cell
                end = hits[i + 1].start() if i + 1 < len(hits) else len(item)
                chunk = item[hit.end():end].strip()

                time_match = TIME.search(chunk)
                kickoff = time_match.group(1).strip() if time_match else None
                opponent = (chunk[:time_match.start()] if time_match else chunk).strip()

                # trailing "(D)" marks a district game in the source
                district = "(D)" in chunk
                opponent = opponent.replace("(D)", "").strip(" .,-")

                if not opponent:
                    continue

                games.append({
                    "team": TEAM_OF[hit.group(1).upper()],
                    "date": day["date"],
                    "weekday": day["weekday"],
                    "isHome": hit.group(2).lower() == "vs",
                    "opponent": opponent,
                    "kickoff": kickoff,
                    "isDistrict": district,
                })

    games.sort(key=lambda g: (g["date"], g["team"]))
    return games


VERSIONED = ("style.css", "app.js", "data.js")


def stamp_build_version():
    """
    Give the app's assets a content-derived version and thread it through
    index.html and the service worker.

    Without this a browser will happily serve a cached data.js and show last
    week's kickoff times — which is the single worst way this app can fail.
    Hashing the contents means the URL changes only when something really did.
    """
    docs = ROOT / "docs"

    digest = hashlib.sha256()
    for name in VERSIONED:
        digest.update((docs / name).read_bytes())
    build = digest.hexdigest()[:12]

    index = docs / "index.html"
    html = index.read_text()
    for name in VERSIONED:
        attr = "href" if name.endswith(".css") else "src"
        html = re.sub(
            rf'{attr}="{re.escape(name)}(?:\?v=[^"]*)?"',
            f'{attr}="{name}?v={build}"',
            html,
        )
    index.write_text(html)

    sw = docs / "sw.js"
    sw.write_text(re.sub(r"const BUILD = '[^']*';", f"const BUILD = '{build}';", sw.read_text()))

    return build


def load_school():
    """Jesuit's official Important Dates, keyed by day."""
    path = DATA / "school_calendar.json"
    if not path.exists():
        return {"days": {}}
    return json.loads(path.read_text())


def load_this_week():
    """The coach's posted week, if sunday_update.py has fetched one."""
    path = DATA / "this_week.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def load_photos():
    """Written by prepare_photos.py; absent until photos have been processed."""
    manifest = ROOT / "docs" / "photos" / "photos.json"
    if not manifest.exists():
        return {"album": "", "photos": []}
    return json.loads(manifest.read_text())


def main():
    season = json.loads((DATA / "season.json").read_text())
    calendar = json.loads((DATA / "calendar.json").read_text())
    season["teamGames"] = extract_team_games(calendar)
    photos = load_photos()
    this_week = load_this_week()
    school = load_school()

    # the album link lives in season.json so it can be edited without
    # re-running the photo pipeline
    if season.get("photoAlbum", {}).get("url"):
        photos["album"] = season["photoAlbum"]["url"]

    OUT.parent.mkdir(parents=True, exist_ok=True)

    # A JSON twin of data.js. The store apps bundle their copy but fetch this
    # on launch, so a corrected kickoff reaches phones without an App Store
    # review — otherwise every schedule tweak is a week-long resubmission.
    (OUT.parent / "data.json").write_text(json.dumps({
        "season": season,
        "calendar": calendar,
        "photos": photos,
        "thisWeek": this_week,
        "school": school,
    }, indent=2))

    OUT.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Rebuild with: python3 tools/build_web_data.py\n"
        f"const SEASON = {json.dumps(season, indent=2)};\n\n"
        f"const CALENDAR = {json.dumps(calendar, indent=2)};\n\n"
        f"const PHOTOS = {json.dumps(photos, indent=2)};\n\n"
        f"const THIS_WEEK = {json.dumps(this_week, indent=2)};\n\n"
        f"const SCHOOL = {json.dumps(school, indent=2)};\n"
    )

    days = len(calendar["days"])
    games = len(season["games"])
    by_team = {}
    for g in season["teamGames"]:
        by_team[g["team"]] = by_team.get(g["team"], 0) + 1
    teams = ", ".join(f"{k} {v}" for k, v in sorted(by_team.items()))
    # imported here, not at module scope: build_ics imports this module for the
    # team-game parser, so a top-level import would be circular
    from build_ics import build as build_calendars
    feeds = build_calendars()

    build = stamp_build_version()

    print(f"docs/data.js written — {games} varsity games, {days} calendar days")
    print(f"  team games extracted: {teams}")
    print(f"  photos bundled: {len(photos['photos'])}"
          + ("" if photos["album"] else "  (no shared album URL set yet)"))
    print(f"  build {build} stamped into index.html and sw.js — no manual cache bump needed")
    print("  this week: " + (f"{len(this_week['days'])} days from the coach, posted {this_week['postedOn']}"
                            if this_week else "none yet — run tools/sunday_update.py"))
    print(f"  school calendar: {len(school['days'])} dated days")
    print("  calendar feeds: " + ", ".join(f"{n.replace('jesuit-', '').replace('.ics', '')} {c}"
                                           for n, c in feeds.items()))


if __name__ == "__main__":
    main()
