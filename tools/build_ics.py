#!/usr/bin/env python3
"""
Generate .ics calendar feeds so parents can subscribe in Google or Apple
Calendar instead of retyping the season.

One feed per team, plus a full-season feed with every practice and event.

Two deliberate choices:

* Varsity games become real timed events — we have actual kickoffs, converted
  from New Orleans local time to UTC (which correctly straddles the end of
  daylight saving before the Nov 5 game).
* Sub-varsity games become ALL-DAY events with the time in the title. The
  coach's calendar prints "4:30" with no AM/PM, and a calendar entry that
  confidently says 4:30 AM is worse than one that makes you read the title.

Output is deterministic — same input, byte-identical file — so the build hash
only changes when the schedule actually does.

Usage: build_ics.py
"""

import json
import pathlib
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
# the sub-varsity games only exist once they're parsed out of the calendar —
# reuse that parser rather than writing a second one that can drift
from build_web_data import extract_team_games

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs"

LOCAL_TZ = ZoneInfo("America/Chicago")
UTC = ZoneInfo("UTC")

# Fixed so rebuilds are byte-identical when nothing changed.
DTSTAMP = "20260801T000000Z"

GAME_HOURS = 3          # a high school football game, generously
DOMAIN = "jesuitfootball.local"


def fold(line):
    """RFC 5545 caps lines at 75 octets; continuations start with a space."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    chunks, start = [], 0
    while start < len(raw):
        end = min(start + (75 if not chunks else 74), len(raw))
        # don't split a multi-byte character
        while end > start and (raw[end - 1] & 0xC0) == 0x80 and end < len(raw):
            end -= 1
        chunks.append(raw[start:end].decode("utf-8", "ignore"))
        start = end
    return "\r\n ".join(chunks)


def esc(text):
    return (str(text or "")
            .replace("\\", "\\\\").replace(";", r"\;")
            .replace(",", r"\,").replace("\n", r"\n"))


def to_utc(date_iso, hhmm):
    y, m, d = map(int, date_iso.split("-"))
    hour, minute = map(int, hhmm.split(":"))
    local = datetime(y, m, d, hour, minute, tzinfo=LOCAL_TZ)
    return local.astimezone(UTC)


def stamp(dt):
    return dt.strftime("%Y%m%dT%H%M%SZ")


def all_day(date_iso):
    return date_iso.replace("-", "")


def event(uid, summary, date_iso, kickoff=None, location=None, description=None):
    lines = ["BEGIN:VEVENT", f"UID:{uid}@{DOMAIN}", f"DTSTAMP:{DTSTAMP}"]

    if kickoff:
        start = to_utc(date_iso, kickoff)
        lines.append(f"DTSTART:{stamp(start)}")
        lines.append(f"DTEND:{stamp(start + timedelta(hours=GAME_HOURS))}")
    else:
        y, m, d = map(int, date_iso.split("-"))
        end = (datetime(y, m, d) + timedelta(days=1)).strftime("%Y%m%d")
        lines.append(f"DTSTART;VALUE=DATE:{all_day(date_iso)}")
        lines.append(f"DTEND;VALUE=DATE:{end}")

    lines.append(f"SUMMARY:{esc(summary)}")
    if location:
        lines.append(f"LOCATION:{esc(location)}")
    if description:
        lines.append(f"DESCRIPTION:{esc(description)}")
    lines.append("END:VEVENT")
    return lines


def calendar(name, events):
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Jesuit Football//Parent App//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{esc(name)}",
        "X-WR-TIMEZONE:America/Chicago",
        # ask subscribers to re-check every 6 hours; Google honours this loosely
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]
    lines.extend(events)
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


def varsity_events(season):
    venues = {v["id"]: v for v in season["venues"]}
    out = []
    for g in season["games"]:
        venue = venues.get(g["venueId"], {})
        if g["type"] == "preseason":
            title = g["opponent"]
        else:
            title = f"{'vs' if g['isHome'] else 'at'} {g['opponent']}"
            if g.get("week"):
                title = f"Week {g['week']} — {title}"

        bits = []
        if g.get("notes"):
            bits.append(g["notes"])
        if g.get("mealGrade"):
            bits.append(f"Pre-game meal: {g['mealGrade']} class.")
        if venue.get("bagPolicy"):
            bits.append(f"Bags: {venue['bagPolicy']}")
        if venue.get("parking"):
            bits.append(f"Parking: {venue['parking']}")

        out.extend(event(
            uid=f"varsity-{g['id']}",
            summary=f"🏈 {title}",
            date_iso=g["date"],
            kickoff=g.get("kickoff"),
            location=venue.get("address") or venue.get("name"),
            description="\n".join(bits) or None,
        ))
    return out


def team_events(team_games, team):
    out = []
    for i, g in enumerate(team_games):
        if g["team"] != team:
            continue
        where = "vs" if g["isHome"] else "at"
        time_note = f" — {g['kickoff']}" if g.get("kickoff") else ""
        out.extend(event(
            uid=f"{team}-{g['date']}-{i}",
            summary=f"🏈 {team} {where} {g['opponent']}{time_note}",
            date_iso=g["date"],
            description=("Time as printed on the coach's calendar; confirm with your son. "
                         "The calendar does not list a venue for sub-varsity games."),
        ))
    return out


def practice_events(calendar_json, game_dates):
    out = []
    for day in calendar_json["days"]:
        if day["date"] in game_dates:
            continue
        text = " · ".join(day["items"])
        out.extend(event(
            uid=f"day-{day['date']}",
            summary=text[:120],
            date_iso=day["date"],
            description=text if len(text) > 120 else None,
        ))
    return out


def build():
    season = json.loads((DATA / "season.json").read_text())
    cal = json.loads((DATA / "calendar.json").read_text())
    team_games = extract_team_games(cal)
    game_dates = {g["date"] for g in season["games"]}

    feeds = {
        "jesuit-varsity.ics": ("Jesuit Football — Varsity", varsity_events(season)),
        "jesuit-8th.ics": ("Jesuit Football — 8th Grade", team_events(team_games, "8th")),
        "jesuit-9th.ics": ("Jesuit Football — 9th Grade", team_events(team_games, "9th")),
        "jesuit-jv.ics": ("Jesuit Football — JV", team_events(team_games, "JV")),
        "jesuit-full-season.ics": (
            "Jesuit Football — Everything",
            varsity_events(season) + practice_events(cal, game_dates),
        ),
    }

    written = {}
    for filename, (name, events) in feeds.items():
        # newline="" keeps our explicit CRLF line endings, which the spec wants
        with open(OUT / filename, "w", newline="") as handle:
            handle.write(calendar(name, events))
        written[filename] = events.count("BEGIN:VEVENT")

    return written


if __name__ == "__main__":
    for name, count in build().items():
        print(f"  {name} — {count} events")
