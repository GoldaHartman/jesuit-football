#!/usr/bin/env python3
"""
The one AI call in the harness: a short "what matters this week" line over the
district news, written for a football parent.

Deliberately narrow. The model gets ONLY the headlines and summaries already
fetched, and is asked for two or three sentences. It never invents a score, a
time, or a result — everything factual in this app comes from the schedule and
the feeds, not from a model.

Skipped entirely when ANTHROPIC_API_KEY is absent. The app renders fine
without a digest.

Usage: news_digest.py [--dry-run]
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
API = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-5"


def load_env():
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


PROMPT = """You write one short paragraph for the Jesuit High School New Orleans football
parents' app — the "what's going on around the district" note.

Rules:
- Two or three sentences. Plain, warm, not breathless. No exclamation marks.
- Only use what's in the headlines below. Do NOT invent scores, times, records
  or results, and do not speculate about outcomes.
- Lead with Jesuit if there's Jesuit news; otherwise lead with whichever
  district opponent matters most.
- These are high school kids. Write about them the way you'd want someone
  writing about your own son.
- Return the paragraph only, no preamble.

Headlines:
"""


def build_digest(api_key, items):
    lines = []
    for i in items[:14]:
        lines.append(f"- [{i['date']}] {i['title']}"
                     + (f" — {i['summary'][:150]}" if i.get("summary") else ""))

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 400,
        "messages": [{"role": "user", "content": PROMPT + "\n".join(lines)}],
    }).encode()

    request = urllib.request.Request(API, data=body, headers={
        "content-type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    })

    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode())

    for block in payload.get("content", []):
        if block.get("type") == "text":
            return block["text"].strip()
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("No ANTHROPIC_API_KEY — skipping the digest.")
        return 0

    news_file = DATA / "news.json"
    if not news_file.exists():
        print("No news.json yet — run fetch_news.py first.")
        return 0

    news = json.loads(news_file.read_text())
    items = [i for i in news["items"] if not i.get("extra")]
    if not items:
        print("No football news to summarise.")
        return 0

    try:
        text = build_digest(api_key, items)
    except urllib.error.HTTPError as exc:
        print(f"Anthropic API error {exc.code}: {exc.read().decode()[:200]}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Digest failed: {exc}", file=sys.stderr)
        return 1

    if not text:
        print("Model returned nothing usable.")
        return 1

    print("\n" + text + "\n")

    if args.dry_run:
        print("--dry-run: nothing written.")
        return 0

    news["digest"] = {
        "text": text,
        "written": date.today().isoformat(),
        "over": len(items),
    }
    news_file.write_text(json.dumps(news, indent=2))
    print("Wrote the digest into data/news.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
