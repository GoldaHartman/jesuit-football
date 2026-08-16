#!/usr/bin/env python3
"""
Pull football news into data/news.json — Jesuit and the rest of 9-5A.

Four sources, each filtered differently:

  jesuitnola.org/category/football/feed/
      The school's own Football archive. Game recaps, kept only when
      "Football" is genuinely one of the post's categories.

  nola.com prep sports
      The Times-Picayune's high school desk, and by far the best coverage of
      the district — Jesuit, Brother Martin, Karr, Holy Cross, Curtis, Rummel,
      Chalmette, St. Aug. Needs a browser User-Agent; it answers 429 without
      one, which is why it was missing entirely at first.

  crescentcitysports.com/category/preps/feed/
      Local prep coverage. The site's main feed is mostly Saints and LSU —
      the preps category is the one worth reading.

  jesuitnola.org/feed/
      A few non-football school stories parents asked to keep: Athletics,
      Campus Centennial, and Class of 2027.

None of them send CORS headers, so a phone can't read them directly. They get
pulled here and baked into the app.

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
KEEP = 30

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0 Safari/537.36")

JESUIT_FOOTBALL = "https://www.jesuitnola.org/category/football/feed/"
JESUIT_ALL = "https://www.jesuitnola.org/feed/"
NOLA_PREPS = "https://www.nola.com/search/?f=rss&t=article&c=sports/high_schools&l=50"
CRESCENT_PREPS = "https://crescentcitysports.com/category/preps/feed/"

# District 9-5A. Deliberately not "Blue Jays" — that's the whole school's
# nickname and it mis-tagged spirituality and academics posts as football.
DISTRICT = re.compile(
    r"\b(jesuit|brother martin|chalmette|edna karr|\bkarr\b|holy cross|"
    r"john curtis|curtis christian|rummel|st\.? augustine|st\.? aug)\b", re.I)

# Not football, but parents want them. Categories are the honest signal;
# "Homepage" is on nearly every post and tells you nothing.
WORTH_SEEING = {"athletics", "alumni making news", "campus centennial", "class of 2027"}
SKIP_CATEGORY = {"announcements"}
EXTRA_LIMIT = 5


def strip_html(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def read_items(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ElementTree.fromstring(response.read())

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
            "categories": [strip_html(c.text) for c in node.findall("category")][:3],
        }


def tag(items, source, jesuit_only=False):
    """Keep district-relevant items and stamp where they came from."""
    kept = []
    for item in items:
        haystack = f"{item['title']} {item['summary']} {' '.join(item['categories'])}"
        if jesuit_only:
            if not re.search(r"\bjesuit\b", haystack, re.I):
                continue
        elif not DISTRICT.search(haystack):
            continue
        item["source"] = source
        # Jesuit must be in the HEADLINE to count as our news. A passing
        # mention in the body catches things like "a QB who transferred in
        # from Jesuit" — that's Country Day's story, not ours.
        item["aboutJesuit"] = bool(re.search(r"\bjesuit\b", item["title"], re.I))
        kept.append(item)
    return kept


def from_jesuit_football():
    kept = []
    for item in read_items(JESUIT_FOOTBALL):
        if not any(c.strip().lower() == "football" for c in item["categories"]):
            continue
        item["source"] = "Jesuit"
        item["aboutJesuit"] = True
        kept.append(item)
    return kept


def from_jesuit_general():
    kept = []
    for item in read_items(JESUIT_ALL):
        cats = {c.strip().lower() for c in item["categories"]}
        if cats & SKIP_CATEGORY or "football" in cats or not (cats & WORTH_SEEING):
            continue
        item["source"] = "Jesuit"
        item["extra"] = True
        kept.append(item)
    return kept[:EXTRA_LIMIT]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sources = [
        ("Jesuit football", from_jesuit_football),
        ("nola.com preps", lambda: tag(read_items(NOLA_PREPS), "nola.com")),
        ("Crescent City preps", lambda: tag(read_items(CRESCENT_PREPS), "Crescent City Sports")),
        ("Worth seeing", from_jesuit_general),
    ]

    items, failed = [], []
    for name, getter in sources:
        try:
            found = list(getter())
            items.extend(found)
            print(f"  {name}: {len(found)} kept")
        except Exception as exc:
            failed.append(name)
            print(f"  {name}: FAILED ({exc})", file=sys.stderr)

    seen, unique = set(), []
    for item in sorted(items, key=lambda i: i["date"], reverse=True):
        if item["link"] in seen:
            continue
        seen.add(item["link"])
        unique.append(item)
    unique = unique[:KEEP]

    if failed and not unique and (DATA / "news.json").exists():
        print("\nEvery source failed — keeping the news already on file.")
        return 0

    jesuit = [i for i in unique if i.get("aboutJesuit")]
    district = [i for i in unique if not i.get("aboutJesuit") and not i.get("extra")]
    extra = [i for i in unique if i.get("extra")]

    print(f"\n{len(jesuit)} Jesuit · {len(district)} district · {len(extra)} worth seeing")
    for label, group in (("JESUIT  ", jesuit), ("district", district), ("also    ", extra)):
        for item in group[:8]:
            print(f"  {label} {item['date']}  {item['title'][:62]}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0

    (DATA / "news.json").write_text(json.dumps({
        "sources": ["jesuitnola.org", "nola.com", "crescentcitysports.com"],
        "fetched": datetime.now(timezone.utc).date().isoformat(),
        "items": unique,
    }, indent=2))
    print("\nWrote data/news.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
