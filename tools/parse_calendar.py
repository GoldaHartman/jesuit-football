#!/usr/bin/env python3
"""
Turn the coach's 2026/27 Jesuit Football calendar PDF into day-by-day JSON.

The PDF is a Word doc printed to PDF: one table per month, seven columns
(Sunday..Saturday). Two row shapes show up, so we handle both:

  A) a "number row" whose cells are bare day numbers, followed by a
     "content row" holding that week's text, matched up by column
  B) a single row where each cell starts with its own day number

Anchors verified against the parent welcome letter: Aug 3 combine,
Aug 4 parent dinner, Aug 14 Blue & White, and all ten game dates.

Usage: parse_calendar.py <calendar.pdf> <out.json>
"""

import json
import re
import sys
from datetime import date

MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11,
    "December": 12,
}

WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

# The PDF renders ordinal suffixes as separate runs, so "1st Quarter" arrives
# as "st 1 Quarter" and "9th/JV" as "th 9 /JV". Repair those before anything else.
ORDINAL_FIXES = [
    (r"\bst\s+1\s+Quarter\b", "1st Quarter"),
    (r"\bth\s+9\s*/", "9th/"),
    (r"\bth\s+8\s+Grade\b", "8th Grade"),
    (r"\b8\s*TH\s+Grade\b", "8th Grade"),
    (r"\bth\s+4\s+of\s+July\b", "4th of July"),
]


def clean(text):
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    for pattern, repl in ORDINAL_FIXES:
        text = re.sub(pattern, repl, text)
    return text.replace("“", '"').replace("”", '"').replace("’", "'").strip()


def month_header(page_text):
    """Read '<Month> <Year>' off the top of a calendar page."""
    match = re.search(r"\b(" + "|".join(MONTHS) + r")\s*(\d{4})\b", page_text)
    if not match:
        return None
    return MONTHS[match.group(1)], int(match.group(2))


def is_number_row(cells):
    """True when every non-empty cell is a bare day number."""
    values = [c for c in cells if c]
    return bool(values) and all(re.fullmatch(r"\d{1,2}", c) for c in values)


def split_leading_day(cell):
    """'14 BLUE AND WHITE ...' -> (14, 'BLUE AND WHITE ...')"""
    match = re.match(r"^(\d{1,2})\b\s*(.*)$", cell)
    if not match:
        return None, cell
    return int(match.group(1)), match.group(2).strip()


def resolve(day, month, year):
    """
    A month grid's leading/trailing cells spill into the neighbouring month
    (Aug 30/31 sit on the September page). Pick the calendar month whose
    numbering actually contains this day near this position.
    """
    for delta in (0, -1, 1):
        m = month + delta
        y = year
        if m < 1:
            m, y = 12, year - 1
        if m > 12:
            m, y = 1, year + 1
        try:
            candidate = date(y, m, day)
        except ValueError:
            continue
        if delta == 0:
            return candidate
        # only accept a spill-over if the day sits at the far end of that month
        if delta == -1 and day > 20:
            return candidate
        if delta == 1 and day < 10:
            return candidate
    return None


def parse(pdf_path):
    import pdfplumber

    events = {}

    def record(day_date, weekday_index, text):
        text = clean(text)
        if not text or not day_date:
            return
        key = day_date.isoformat()
        entry = events.setdefault(key, {
            "date": key,
            "weekday": WEEKDAYS[weekday_index],
            "items": [],
        })
        if text not in entry["items"]:
            entry["items"].append(text)

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            header = month_header(page.extract_text() or "")
            if not header:
                continue
            month, year = header

            for table in page.extract_tables():
                rows = [[clean(c) for c in row] for row in table]
                # skip the title table and any non-7-column stragglers
                if not rows or len(rows[0]) != 7:
                    continue
                if rows and rows[0][0].startswith("Sunday"):
                    rows = rows[1:]

                pending_numbers = None
                for cells in rows:
                    if len(cells) != 7:
                        continue

                    if is_number_row(cells):
                        # shape A: remember the numbers, content is on the next row
                        pending_numbers = cells
                        continue

                    if pending_numbers:
                        for col in range(7):
                            num, content = pending_numbers[col], cells[col]
                            if not num or not content:
                                continue
                            record(resolve(int(num), month, year), col, content)
                        pending_numbers = None
                        continue

                    # shape B: each cell carries its own day number
                    for col in range(7):
                        if not cells[col]:
                            continue
                        num, content = split_leading_day(cells[col])
                        if num is None:
                            continue
                        record(resolve(num, month, year), col, content)

    return [events[k] for k in sorted(events)]


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    days = parse(sys.argv[1])
    with open(sys.argv[2], "w") as handle:
        json.dump({"source": "2026/27 Jesuit Football Calendar", "days": days}, handle, indent=2)
    print(f"{len(days)} days -> {sys.argv[2]}")
    if days:
        print(f"range: {days[0]['date']} .. {days[-1]['date']}")


if __name__ == "__main__":
    main()
