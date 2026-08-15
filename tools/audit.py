#!/usr/bin/env python3
"""
Cross-check everything the app shows against every source we have.

Sources:
  source/2026 FOOTBALL CALENDAR.pdf     coach's year calendar  -> data/calendar.json
  source/2026 Football Welcome Letter.pdf  the letter that went to parents
  source/2026-27 Important Dates.pdf    Jesuit's official school dates
  ~/Downloads/Jesuit_Football_2026.xlsx  Golda's working spreadsheet

Checks internal consistency too: dangling venue ids, meal grades that match no
grade, weekday drift, games missing from the calendar, and so on.

Usage: audit.py
"""

import json
import pathlib
import re
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SOURCE = ROOT / "source"
DOWNLOADS = pathlib.Path.home() / "Downloads"

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

findings = []


def finding(level, area, detail):
    findings.append((level, area, detail))


def load(name):
    return json.loads((DATA / name).read_text())


def pdf_text(path):
    from pypdf import PdfReader
    return "\n".join(p.extract_text() or "" for p in PdfReader(str(path)).pages)


def norm(text):
    return re.sub(r"\s+", " ", text or "").strip()


# ---------------------------------------------------------------- checks

def check_internal(season, calendar, school):
    venue_ids = {v["id"] for v in season["venues"]}
    grade_names = {g["name"] for g in season["grades"]}
    cal_dates = {d["date"] for d in calendar["days"]}

    for g in season["games"]:
        if g["venueId"] not in venue_ids:
            finding("ERROR", "season.json", f"{g['id']} points at unknown venue '{g['venueId']}'")
        if g["mealGrade"] and g["mealGrade"] not in grade_names:
            finding("ERROR", "season.json", f"{g['id']} meal grade '{g['mealGrade']}' matches no grade")
        if g["date"] not in cal_dates:
            finding("WARN", "season.json", f"{g['id']} ({g['date']}) has no entry in the coach's calendar")

    # every game should appear in the calendar text too
    by_date = {d["date"]: " ".join(d["items"]).upper() for d in calendar["days"]}
    for g in season["games"]:
        if g["type"] != "regular":
            continue
        text = by_date.get(g["date"], "")
        if g["week"] and f"WEEK {g['week']}" not in text:
            finding("WARN", "cross-check",
                    f"Week {g['week']} on {g['date']} isn't labelled 'WEEK {g['week']}' in the calendar")

    # grade metadata completeness
    for grade in season["grades"]:
        if grade["dues"] and not grade["duesHandle"]:
            finding("WARN", "grades", f"{grade['name']} has ${grade['dues']} dues but no Venmo handle — "
                                      "the app can't offer a pay button")
        if not grade.get("teams"):
            finding("WARN", "grades", f"{grade['name']} has no teams mapping")

    # duplicate team games on one day for one team
    seen = {}
    for g in season.get("teamGames", []):
        key = (g["team"], g["date"])
        seen.setdefault(key, []).append(g)
    for (team, day), games in sorted(seen.items()):
        if len(games) > 1:
            opps = " / ".join(f"{'vs' if x['isHome'] else 'at'} {x['opponent']} {x['kickoff'] or ''}".strip()
                              for x in games)
            finding("CHECK", "coach's calendar",
                    f"{team} has {len(games)} games listed on {day}: {opps}")

    # kickoff times still unknown
    for g in season["games"]:
        if not g["kickoff"]:
            finding("INFO", "season.json", f"{g['id']} ({g['date']}) has no kickoff time set")

    return venue_ids, grade_names


def check_weekdays(season, calendar, school):
    for g in season["games"]:
        d = date.fromisoformat(g["date"])
        notes = (g.get("notes") or "") + (g.get("kickoffNote") or "")
        if "Thursday" in notes and d.weekday() != 3:
            finding("ERROR", "season.json", f"{g['id']} notes say Thursday but {g['date']} is a {WEEKDAYS[d.weekday()]}")
        if "SATURDAY" in notes.upper() and d.weekday() != 5:
            finding("ERROR", "season.json", f"{g['id']} notes say Saturday but {g['date']} is a {WEEKDAYS[d.weekday()]}")

    for day in calendar["days"]:
        d = date.fromisoformat(day["date"])
        if day["weekday"] != WEEKDAYS[d.weekday()].replace("Sunday", "Sunday"):
            expected = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d.weekday()]
            if day["weekday"] != expected:
                finding("ERROR", "calendar.json", f"{day['date']} labelled {day['weekday']}, actually {expected}")


def check_letter(season):
    path = SOURCE / "2026 Football Welcome Letter.pdf"
    if not path.exists():
        finding("INFO", "sources", "welcome letter PDF not in source/ — skipped that comparison")
        return
    text = norm(pdf_text(path))

    # grade mom emails
    for mom in season["gradeMoms"]:
        if mom["email"].lower() not in text.lower():
            in_letter = re.findall(r"[\w.+-]+@[\w.-]+", text)
            near = [e for e in in_letter if mom["name"].split()[0].lower() in text.lower()]
            finding("ERROR", "contacts",
                    f"{mom['grade']} mom {mom['name']}: app has {mom['email']}, which does not appear in the "
                    f"welcome letter. Letter lists: {', '.join(sorted(set(in_letter))[:8])}")

    # dues
    for grade in season["grades"]:
        if grade["dues"] and f"${grade['dues']}" not in text:
            finding("CHECK", "dues",
                    f"{grade['name']} dues ${grade['dues']} not found in the welcome letter")
        if grade["duesHandle"] and grade["duesHandle"] not in text:
            finding("CHECK", "dues",
                    f"{grade['name']} handle {grade['duesHandle']} not found in the welcome letter")

    # tailgate assignments
    for grade in season["grades"]:
        food = grade["tailgateFood"]
        if food and food.lower() not in text.lower():
            finding("CHECK", "tailgate", f"{grade['name']} tailgate item '{food}' not found in the letter")

    # gatorade should be gone everywhere
    if "Gatorade" in text and "chocolate milk" in text.lower():
        pass  # the letter explains the switch; fine


def check_xlsx(season):
    candidates = sorted(DOWNLOADS.glob("Jesuit_Football_2026*.xlsx"))
    candidates = [c for c in candidates if not c.name.startswith("~$")]
    if not candidates:
        finding("INFO", "sources", "no Jesuit_Football_2026*.xlsx in Downloads — skipped")
        return
    path = candidates[-1]

    try:
        import openpyxl
    except ImportError:
        finding("INFO", "sources", "openpyxl not available — skipped the spreadsheet comparison")
        return

    wb = openpyxl.load_workbook(path, data_only=True)
    text_by_sheet = {}
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            rows.append(" | ".join(str(c) for c in row if c is not None))
        text_by_sheet[ws.title] = "\n".join(rows)
    everything = "\n".join(text_by_sheet.values())

    if "Gatorade" in everything:
        finding("ERROR", f"{path.name}",
                "still says Gatorade. The welcome letter says Coach Manale replaced it with chocolate milk. "
                "Anyone you point at this sheet gets the wrong instruction.")

    if re.search(r"Sophomore.*Senior Night.*flowers", everything, re.S):
        finding("ERROR", f"{path.name}",
                "assigns Senior Night flowers to the Sophomore class. The welcome letter gives roses and the "
                "announcer script to the Freshman class.")

    if "Sep 118" in everything:
        finding("ERROR", f"{path.name}", "Bonnabel date reads 'Sep 118' — should be Sep 18.")

    # contact drift between sheet and app
    for mom in season["gradeMoms"]:
        if mom["name"] in everything and mom["email"] not in everything:
            sheet_emails = re.findall(rf"{re.escape(mom['name'])}\s*\|\s*([\w.+-]+@[\w.-]+)", everything)
            if sheet_emails and sheet_emails[0] != mom["email"]:
                finding("ERROR", "contacts",
                        f"{mom['grade']} mom {mom['name']}: spreadsheet has {sheet_emails[0]}, app has {mom['email']}")


def check_school_vs_football(calendar, school):
    """The coach's calendar name-drops school events. They should agree."""
    school_days = school["days"]
    cal_by_date = {d["date"]: " ".join(d["items"]) for d in calendar["days"]}

    probes = [
        ("Registration Day", "Registration Day"),
        ("New Student Orientation", "New Students' Orientation"),
        ("1st Quarter Begins", "1st Quarter Begins"),
        ("Open House", "Open House"),
        ("Mass of Holy Spirit", "Mass of the Holy Spirit"),
        ("Senior Ring Mass", "Senior Ring Mass"),
    ]

    for cal_phrase, school_title in probes:
        cal_dates = {d for d, text in cal_by_date.items() if cal_phrase.lower() in text.lower()}
        sch_dates = {d for d, items in school_days.items()
                     if any(school_title.lower() in i["title"].lower() for i in items)}
        if cal_dates and sch_dates and not (cal_dates & sch_dates):
            finding("ERROR", "school vs football",
                    f"'{cal_phrase}' is {sorted(cal_dates)} on the coach's calendar but "
                    f"{sorted(sch_dates)} on Jesuit's official dates")
        elif cal_dates and sch_dates:
            pass  # agree

    # football events on school holidays are worth knowing about, not errors
    for iso, items in sorted(school_days.items()):
        if any(i["audience"] == "holiday" for i in items):
            football = cal_by_date.get(iso, "")
            if re.search(r"WEEK \d|PRACTICE|WORKOUT|SCRIMMAGE|JAMBOREE", football, re.I):
                titles = ", ".join(i["title"] for i in items)
                finding("INFO", "heads up",
                        f"{iso}: no school ({titles}) but football is on — {norm(football)[:70]}")

    # school events with no football entry at all: fine, but list mismatched ones
    orphan = [d for d in school_days if d not in cal_by_date]
    if orphan:
        finding("INFO", "coverage",
                f"{len(orphan)} school dates have no football entry (expected — e.g. {', '.join(sorted(orphan)[:3])})")

    # school-ish things the coach lists that Jesuit's official dates don't
    school_titles = {i["title"].lower() for items in school_days.values() for i in items}
    SCHOOLISH = ["Parent / Teacher", "College Fair", "Blue Jay Bazaar", "Golf Classic",
                 "Athletic Physical", "Spring Sports Recognition", "Commitment Ceremony"]
    for phrase in SCHOOLISH:
        hits = sorted(d for d, text in cal_by_date.items() if phrase.lower() in text.lower())
        if hits and not any(phrase.split()[0].lower() in t for t in school_titles):
            finding("CHECK", "school vs football",
                    f"'{phrase}' appears on the coach's calendar ({hits[0]}) but not on Jesuit's "
                    f"official Important Dates — worth confirming")


def check_links(season):
    """Every URL the app shows should at least be well-formed and https."""
    urls = []

    def collect(obj, path="") :
        if isinstance(obj, dict):
            for k, v in obj.items():
                collect(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                collect(v, f"{path}[{i}]")
        elif isinstance(obj, str) and obj.startswith("http"):
            urls.append((path, obj))

    collect(season)
    for path, url in urls:
        if url.startswith("http://"):
            finding("WARN", "links", f"{path} is plain http: {url}")
        if "/u/1/" in url or "/u/0/" in url:
            finding("ERROR", "links",
                    f"{path} contains an account-specific Google path and will 404 for other people: {url}")
    finding("INFO", "links", f"{len(urls)} links checked for shape")


# ---------------------------------------------------------------- main

def main():
    season = load("season.json")
    calendar = load("calendar.json")
    school = load("school_calendar.json")

    # teamGames is derived at build time, not stored — derive it here too, or
    # every sub-varsity check silently passes on an empty list
    sys.path.insert(0, str(ROOT / "tools"))
    from build_web_data import extract_team_games
    season["teamGames"] = extract_team_games(calendar)

    check_internal(season, calendar, school)
    check_weekdays(season, calendar, school)
    check_letter(season)
    check_xlsx(season)
    check_school_vs_football(calendar, school)
    check_links(season)

    order = {"ERROR": 0, "CHECK": 1, "WARN": 2, "INFO": 3}
    findings.sort(key=lambda f: (order.get(f[0], 9), f[1]))

    width = max((len(f[1]) for f in findings), default=10)
    current = None
    for level, area, detail in findings:
        if level != current:
            print(f"\n{'=' * 8} {level} {'=' * 8}")
            current = level
        print(f"  [{area:<{width}}] {detail}")

    counts = {}
    for level, _, _ in findings:
        counts[level] = counts.get(level, 0) + 1
    print("\n" + ", ".join(f"{n} {k.lower()}" for k, n in sorted(counts.items(), key=lambda x: order.get(x[0], 9))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
