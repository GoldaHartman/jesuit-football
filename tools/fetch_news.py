#!/usr/bin/env python3
"""
Pull football news into data/news.json. Football only — parents said so.

Two sources, each filtered differently:

  jesuitnola.org/category/football/feed/
      The school's own Football archive. Real game recaps. Kept only when
      "Football" is actually one of the post's categories — the archive also
      carries loosely-related athletics posts.

  crescentcitysports.com/feed/
      Local sports coverage. Mostly Saints and LSU, so kept only when the item
      is filed under high school football AND mentions Jesuit or a 9-5A rival.

Neither site sends a CORS header, so a phone can't read them directly. They
have to be pulled here and baked into the app.

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
KEEP = 20

JESUIT_FOOTBALL = "https://www.jesuitnola.org/category/football/feed/"
JESUIT_ALL = "https://www.jesuitnola.org/feed/"
CRESCENT_CITY = "https://crescentcitysports.com/feed/"

# Not football, but parents want them anyway. "Homepage" is useless as a
# filter — the school puts it on almost everything — so go by what the story
# is actually about. Class of 2027 is here because it's our seniors.
WORTH_SEEING = {
    "athletics",
    "alumni making news",
    "campus centennial",
    "class of 2027",
}

# routine noise, never interesting
SKIP_CATEGORY = {"announcements"}

EXTRA_LIMIT = 5

# Deliberately not "Blue Jays" — that's the whole school's nickname and shows
# up in spirituality and academics posts. It mis-tagged four in a row once.
DISTRICT = re.compile(
    r"\b(jesuit|brother martin|chalmette|edna karr|holy cross|john curtis|"
    r"rummel|st\.? augustine|st\.? aug)\b", re.I)

PREP_FOOTBALL_CATEGORY = re.compile(r"high school football|preps", re.I)


def strip_html(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "jesuit-football-app/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def read_items(url):
    root = ElementTree.fromstring(fetch(url))
    for node in root.findall(".//item"):
        title = strip_html(node.findtext("title"))
        link = (node.findtext("link") or "").strip()
        if not title or not link:
            continue
        try:
            published = parsedate_to_datetime(node.findtext("pubDate") or "").astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue

        summary = strip_html(node.findtext("description"))
        if len(summary) > 240:
            summary = summary[:237].rsplit(" ", 1)[0] + "…"

        yield {
            "title": title,
            "link": link,
            "date": published.date().isoformat(),
            "summary": summary,
            "categories": [strip_html(c.text) for c in node.findall("category")],
        }


def from_jesuit():
    """Keep only posts genuinely filed under Football."""
    kept = []
    for item in read_items(JESUIT_FOOTBALL):
        if not any(c.strip().lower() == "football" for c in item["categories"]):
            continue
        item["source"] = "Jesuit"
        item["categories"] = item["categories"][:3]
        kept.append(item)
    return kept


def from_crescent_city():
    """Local coverage, but only prep football that touches our district."""
    kept = []
    for item in read_items(CRESCENT_CITY):
        cats = " ".join(item["categories"])
        if not PREP_FOOTBALL_CATEGORY.search(cats):
            continue
        if not DISTRICT.search(item["title"] + " " + item["summary"]):
            continue
        item["source"] = "Crescent City Sports"
        item["categories"] = item["categories"][:3]
        kept.append(item)
    return kept


def from_jesuit_general():
    """The handful of non-football school stories parents actually like."""
    kept = []
    for item in read_items(JESUIT_ALL):
        cats = {c.strip().lower() for c in item["categories"]}
        if cats & SKIP_CATEGORY:
            continue
        if "football" in cats:
            continue                      # already covered by the football feed
        if not (cats & WORTH_SEEING):
            continue
        item["source"] = "Jesuit"
        item["extra"] = True
        item["categories"] = item["categories"][:3]
        kept.append(item)
    return kept[:EXTRA_LIMIT]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    items, failures = [], []
    for name, getter in (("Jesuit football", from_jesuit),
                         ("Crescent City Sports", from_crescent_city),
                         ("Worth seeing", from_jesuit_general)):
        try:
            found = getter()
            items.extend(found)
            print(f"  {name}: {len(found)} kept")
        except Exception as exc:
            # one source being down must never empty the tab
            failures.append(name)
            print(f"  {name}: FAILED ({exc})", file=sys.stderr)

    # dedupe by link, newest first
    seen, unique = set(), []
    for item in sorted(items, key=lambda i: i["date"], reverse=True):
        if item["link"] in seen:
            continue
        seen.add(item["link"])
        unique.append(item)
    unique = unique[:KEEP]

    if failures and not unique:
        existing = DATA / "news.json"
        if existing.exists():
            print("\nEvery source failed — keeping the news already on file.")
            return 0

    football = [i for i in unique if not i.get("extra")]
    extra = [i for i in unique if i.get("extra")]

    print(f"\n{len(football)} football + {len(extra)} worth seeing")
    for item in football[:10]:
        print(f"  FOOTBALL  {item['date']}  {item['title'][:58]}")
    for item in extra:
        print(f"  also      {item['date']}  {item['title'][:58]}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    (DATA / "news.json").write_text(json.dumps({
        "sources": ["jesuitnola.org (Football)", "crescentcitysports.com"],
        "fetched": datetime.now(timezone.utc).date().isoformat(),
        "items": unique,
    }, indent=2))
    print("\nWrote data/news.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
