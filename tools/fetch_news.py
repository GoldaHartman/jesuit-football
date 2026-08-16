#!/usr/bin/env python3
"""
Pull Jesuit's news feed into data/news.json.

jesuitnola.org is WordPress and publishes RSS at /feed/, but sends no CORS
header — so a phone can't fetch it directly. It has to be pulled here and
baked into the app.

Football stories are tagged so the News tab can lead with them; the rest of
the school's news follows, because parents want that too.

Usage:
  fetch_news.py              pull and write data/news.json
  fetch_news.py --dry-run    show what it found, write nothing
"""

import argparse
import html
import json
import pathlib
import re
import sys
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

FEED = "https://www.jesuitnola.org/feed/"
KEEP = 25

# NOT "Blue Jays" — that's the whole school's nickname and turns up in
# spirituality and academics stories. It tagged four straight non-football
# articles as football before this was tightened.
FOOTBALL = re.compile(
    r"\b(football|gridiron|kickoff|touchdown|quarterback|"
    r"tad gormley|john ryan stadium|coach manale|9-5a)\b", re.I)

# WordPress categories are a far better signal than prose
FOOTBALL_CATEGORY = re.compile(r"^football$", re.I)
SPORTS_CATEGORY = re.compile(r"^(athletics|sports)$", re.I)


def strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "jesuit-football-app/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def parse(xml_bytes):
    root = ElementTree.fromstring(xml_bytes)
    items = []

    for node in root.findall(".//item"):
        title = strip_html(node.findtext("title"))
        link = (node.findtext("link") or "").strip()
        if not title or not link:
            continue

        raw_date = node.findtext("pubDate") or ""
        try:
            published = parsedate_to_datetime(raw_date).astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue

        summary = strip_html(node.findtext("description"))
        if len(summary) > 260:
            summary = summary[:257].rsplit(" ", 1)[0] + "…"

        categories = [strip_html(c.text) for c in node.findall("category")]

        # the headline and the categories are trustworthy; the body is not,
        # because half the school's prose mentions the Blue Jays
        is_football = (
            bool(FOOTBALL.search(title))
            or any(FOOTBALL_CATEGORY.match(c) for c in categories)
            or bool(FOOTBALL.search(summary))
        )
        is_sports = any(SPORTS_CATEGORY.match(c) for c in categories)

        items.append({
            "title": title,
            "link": link,
            "date": published.date().isoformat(),
            "summary": summary,
            "categories": categories[:4],
            "football": is_football,
            "sports": is_sports and not is_football,
        })

    items.sort(key=lambda i: i["date"], reverse=True)
    return items[:KEEP]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        items = parse(fetch(FEED))
    except Exception as exc:
        # a news outage must never break the build — keep whatever we had
        print(f"Could not fetch news: {exc}", file=sys.stderr)
        existing = DATA / "news.json"
        if existing.exists():
            print("Keeping the previously fetched news.")
            return 0
        print("No previous news either — the News tab will say so.", file=sys.stderr)
        items = []

    football = [i for i in items if i["football"]]
    sports = [i for i in items if i["sports"]]

    print(f"{len(items)} stories — {len(football)} football, {len(sports)} other sports")
    for item in items[:12]:
        tag = "FOOTBALL" if item["football"] else ("sports  " if item["sports"] else "        ")
        print(f"  {tag} {item['date']}  {item['title'][:66]}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    (DATA / "news.json").write_text(json.dumps({
        "source": "jesuitnola.org",
        "feed": FEED,
        "fetched": datetime.now(timezone.utc).date().isoformat(),
        "items": items,
    }, indent=2))
    print(f"\nWrote data/news.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
