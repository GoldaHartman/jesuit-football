#!/usr/bin/env python3
"""
Build data/school_calendar.json — the non-football side of the day view.

Two sources, kept distinguishable:

  official  Jesuit's "2026-27 Important Dates" PDF (cdn.jesuitnola.org).
            One page, ~35 rows, reissued once a year, so it's transcribed
            rather than parsed — a parser for a one-off layout would be more
            fragile than the thing it replaces.

  coach     School and program events the coach writes into the football
            calendar that never made the official list: College Fair, Blue Jay
            Bazaar, Athletic Physical Day and so on. Real events, second-hand
            source, so they carry a different provenance flag.

Dates for the `coach` rows are verified against data/calendar.json at build
time — if the coach's calendar stops mentioning one, the build says so instead
of silently keeping a stale date.

Usage: build_school_calendar.py
"""

import json
import pathlib
import re
from datetime import date, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SOURCE_NAME = "Jesuit High School — 2026-27 Important Dates"
SOURCE_URL = "https://cdn.jesuitnola.org/wp-content/uploads/2026/01/2026-27-Important-Dates-2.pdf"

# (start, end_or_None, title, detail, audience)
OFFICIAL = [
    ("2026-08-03", None, "Archdiocesan Day of Reflection", "", "faculty"),
    ("2026-08-06", None, "Faculty Inservice", "", "faculty"),
    ("2026-08-07", None, "Faculty Inservice", "", "faculty"),
    ("2026-08-10", None, "Faculty Inservice", "", "faculty"),
    ("2026-08-11", None, "Registration Day", "", "all"),
    ("2026-08-12", None, "New Students' Orientation", "", "all"),
    ("2026-08-13", None, "1st Quarter Begins", "All classes meet", "all"),
    ("2026-08-19", None, "New Parents' Orientation", "6 p.m.", "all"),
    ("2026-08-19", None, "Mini-Schedule (8th & 9th)", "7 p.m.", "all"),
    ("2026-08-26", None, "Mini-Schedule (10th – 12th)", "6 p.m.", "all"),
    ("2026-09-04", None, "Mass of the Holy Spirit", "9th – 12th dismissed after Mass", "all"),
    ("2026-09-04", None, "Pre-Freshman Retreat", "7:45 a.m. – 2 p.m.", "all"),
    ("2026-09-07", None, "Labor Day Holiday", "", "holiday"),
    ("2026-09-12", None, "Senior Ring Mass", "4:00 p.m.", "all"),
    ("2026-09-14", None, "Senior Ring Holiday", "", "holiday"),
    ("2026-10-12", "2026-10-16", "1st Quarter Exams", "", "all"),
    ("2026-10-16", None, "Freshman Retreat", "9:00 a.m.", "all"),
    ("2026-10-19", None, "PSAT for 10th & 11th", "", "all"),
    ("2026-11-04", None, "Open House", "Dismissal at 1:04 p.m.", "all"),
    ("2026-11-05", None, "Holiday for Students, Faculty, and Staff", "", "holiday"),
    ("2026-11-25", None, "Delivery of Thanksgiving Baskets", "School offices close at noon", "all"),
    ("2026-11-26", "2026-11-27", "Thanksgiving Holidays", "", "holiday"),
    ("2026-12-14", "2026-12-18", "2nd Quarter Exams", "", "all"),
    ("2026-12-21", "2027-01-01", "Christmas Holidays", "Students & faculty", "holiday"),
    ("2027-01-04", "2027-01-05", "Faculty Retreat", "Holidays for students", "holiday"),
    ("2027-01-06", None, "Classes Resume", "", "all"),
    ("2027-01-18", None, "Martin Luther King, Jr. Day", "Holiday for students, faculty, and staff", "holiday"),
    ("2027-02-08", "2027-02-12", "Mardi Gras Holidays", "Students & faculty", "holiday"),
    ("2027-03-08", "2027-03-12", "3rd Quarter Exams", "", "all"),
    ("2027-03-12", None, "PSAT for 8th & 9th", "", "all"),
    ("2027-03-25", "2027-03-29", "Easter Holidays", "", "holiday"),
    ("2027-05-03", "2027-05-06", "Senior Exams", "", "all"),
    ("2027-05-15", None, "Baccalaureate Mass", "5 p.m.", "all"),
    ("2027-05-17", "2027-05-21", "4th Quarter Exams", "", "all"),
    ("2027-05-20", None, "Commencement Rehearsal", "9 a.m.", "all"),
    ("2027-05-20", None, "Commencement Exercises", "8 p.m.", "all"),
    ("2027-05-24", None, "Class of 2029 Interviews", "8 – 10:30 a.m.", "all"),
]

# (expected_date, phrase to confirm in the coach's calendar, title, detail)
# The phrase is what the coach actually writes; the date is checked against it.
FROM_COACH = [
    ("2026-10-05", "College Fair", "College Fair", "6 p.m."),
    ("2026-10-29", "Parent / Teacher", "Parent / Teacher Conferences", "5:30"),
    ("2027-04-03", "Blue Jay Bazaar", "Blue Jay Bazaar", ""),
    ("2027-04-09", "Golf Classic", "Jesuit Golf Classic", ""),
    ("2027-04-10", r"\bACT\b", "ACT test date", ""),
    ("2027-05-05", "Commitment Ceremony", "Commitment Ceremony", ""),
    ("2027-05-08", "Athletic Physical", "Athletic Physical Day", ""),
    ("2027-05-08", "Track State", "Track State", ""),
    ("2027-05-11", "Spring Sports Recognition", "Spring Sports Recognition", ""),
    ("2027-05-27", "Baseball State", "Baseball State Championship", ""),
    ("2027-05-29", "Baseball State", "Baseball State Championship", ""),
    ("2027-06-12", r"\bACT\b", "ACT test date", ""),
]


def expand(byday, start, end, title, detail, audience, source):
    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end) if end else d0
    span = (d1 - d0).days + 1
    cur = d0
    while cur <= d1:
        entry = {"title": title, "detail": detail, "audience": audience, "source": source}
        if span > 1:
            entry["partOf"] = f"{d0.isoformat()}..{d1.isoformat()}"
        byday.setdefault(cur.isoformat(), []).append(entry)
        cur += timedelta(days=1)


def main():
    calendar = json.loads((DATA / "calendar.json").read_text())
    text_by_date = {d["date"]: " ".join(d["items"]) for d in calendar["days"]}

    byday = {}
    for start, end, title, detail, audience in OFFICIAL:
        expand(byday, start, end, title, detail, audience, "official")

    confirmed, missing = 0, []
    for iso, phrase, title, detail in FROM_COACH:
        haystack = text_by_date.get(iso, "")
        pattern = phrase if phrase.startswith("\\b") else re.escape(phrase)
        if re.search(pattern, haystack, re.I):
            expand(byday, iso, None, title, detail, "all", "coach")
            confirmed += 1
        else:
            missing.append(f"{iso} {title}")

    out = {
        "source": SOURCE_NAME,
        "url": SOURCE_URL,
        "days": {k: byday[k] for k in sorted(byday)},
    }
    (DATA / "school_calendar.json").write_text(json.dumps(out, indent=2))

    print(f"school_calendar.json — {len(byday)} dated days")
    print(f"  official rows: {len(OFFICIAL)}")
    print(f"  from the coach's calendar: {confirmed} confirmed")
    if missing:
        print("  NOT FOUND in the coach's calendar (date may have moved):")
        for m in missing:
            print(f"    - {m}")


if __name__ == "__main__":
    main()
