#!/usr/bin/env python3
"""
Pull the coach's weekly schedule out of GroupMe and into the app.

Every Sunday the coach posts the coming week as a picture. This:

  1. asks the GroupMe API for recent messages in the Class of 2027 group
  2. finds the newest image attachment
  3. has Claude read the schedule out of it
  4. writes data/this_week.json and copies the image into docs/schedules/
  5. rebuilds the app

The image is kept and shown in the app next to the parsed times on purpose.
A model reading a photo of a whiteboard can misread a 5 for a 6, and a wrong
pickup time strands a kid in a parking lot — so the original is always one tap
away and parents can check it themselves.

Credentials, both in .env (gitignored, never committed):

  GROUPME_ACCESS_TOKEN   from https://dev.groupme.com  ("Access Token", top right)
  ANTHROPIC_API_KEY      from https://console.anthropic.com

Usage:
  sunday_update.py                 # pull the newest schedule image and apply it
  sunday_update.py --dry-run       # show what it found, write nothing
  sunday_update.py --image PATH    # skip GroupMe, read a local screenshot
  sunday_update.py --days 10       # how far back to look (default 8)
"""

import argparse
import base64
import json
import os
import pathlib
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCHEDULE_DIR = ROOT / "docs" / "schedules"

GROUP_ID = "95375612"          # Blue Jay Football, Class of 2027
GROUPME_API = "https://api.groupme.com/v3"
ANTHROPIC_API = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-5"

CENTRAL_OFFSET = timedelta(hours=-5)   # display only; dates come from the model


# ------------------------------------------------------------------ env

def load_env():
    """Minimal .env reader — no dependency, ignores comments and blanks."""
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require(name, where):
    value = os.environ.get(name)
    if not value:
        sys.exit(
            f"\nMissing {name}.\n"
            f"  Get one at {where}\n"
            f"  Then add this line to {ROOT / '.env'}:\n"
            f"    {name}=your-key-here\n"
            f"  (.env is gitignored — it never gets committed.)\n"
        )
    return value


# ------------------------------------------------------------------ groupme

def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode())


def newest_schedule_image(token, days_back):
    """
    The most recent message carrying an image, newest first.

    We don't try to guess which image is 'the schedule' — the newest picture
    in the group during the Sunday window is overwhelmingly it, and the model
    is asked to say so if the picture clearly isn't a schedule.
    """
    query = urllib.parse.urlencode({"token": token, "limit": 100})
    url = f"{GROUPME_API}/groups/{GROUP_ID}/messages?{query}"

    try:
        payload = get_json(url)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            sys.exit("\nGroupMe rejected the token. Generate a fresh one at https://dev.groupme.com\n")
        raise

    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    messages = payload.get("response", {}).get("messages", [])

    for message in messages:  # API returns newest first
        created = datetime.fromtimestamp(message.get("created_at", 0), timezone.utc)
        if created < cutoff:
            break
        for attachment in message.get("attachments", []):
            if attachment.get("type") == "image" and attachment.get("url"):
                return {
                    "url": attachment["url"],
                    "posted": created,
                    "author": message.get("name", "unknown"),
                    "text": (message.get("text") or "").strip(),
                }
    return None


def download(url, dest):
    request = urllib.request.Request(url, headers={"User-Agent": "jesuit-football-app"})
    with urllib.request.urlopen(request, timeout=60) as response:
        dest.write_bytes(response.read())
    return dest


# ------------------------------------------------------------------ claude

SCHEDULE_TOOL = {
    "name": "record_schedule",
    "description": "Record the weekly football schedule read from the image.",
    "input_schema": {
        "type": "object",
        "properties": {
            "is_schedule": {
                "type": "boolean",
                "description": "False if this image is not a football schedule at all.",
            },
            "week_of": {
                "type": "string",
                "description": "Monday of the week shown, as YYYY-MM-DD.",
            },
            "days": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "description": "YYYY-MM-DD"},
                        "items": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Each line for that day, verbatim from the image.",
                        },
                    },
                    "required": ["date", "items"],
                },
            },
            "unreadable": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Anything blurred, cut off, or that you could not read with confidence.",
            },
        },
        "required": ["is_schedule", "days"],
    },
}

PROMPT = """This image was posted by a high school football coach and shows the schedule
for one upcoming week. Read it and record what it says.

Rules:
- Transcribe each line VERBATIM. Do not tidy up the coach's shorthand — "Done for
  6:30", "AM Lift", "JH at Shaw 5:30" should come through as written.
- Do NOT invent AM/PM that isn't printed. Keep the time exactly as shown.
- The season runs August 2026 through July 2027. Use that to resolve dates, and
  give every day as YYYY-MM-DD.
- If part of the image is blurry, cropped, or ambiguous, list it in `unreadable`
  rather than guessing. A wrong pickup time strands a kid in a parking lot.
- If this image is not a schedule at all, set is_schedule to false."""


def read_schedule(api_key, image_path):
    media_type = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    encoded = base64.standard_b64encode(image_path.read_bytes()).decode()

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 4000,
        "tools": [SCHEDULE_TOOL],
        "tool_choice": {"type": "tool", "name": "record_schedule"},
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": encoded}},
                {"type": "text", "text": PROMPT},
            ],
        }],
    }).encode()

    request = urllib.request.Request(
        ANTHROPIC_API,
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:400]
        sys.exit(f"\nAnthropic API error {exc.code}: {detail}\n")

    for block in payload.get("content", []):
        if block.get("type") == "tool_use":
            return block["input"]

    sys.exit("\nThe model did not return a schedule. Try --dry-run to inspect.\n")


# ------------------------------------------------------------------ main

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--image", help="Read a local image instead of pulling GroupMe")
    parser.add_argument("--days", type=int, default=8)
    args = parser.parse_args()

    load_env()
    SCHEDULE_DIR.mkdir(parents=True, exist_ok=True)

    if args.image:
        image_path = pathlib.Path(args.image).expanduser()
        if not image_path.exists():
            sys.exit(f"No such image: {image_path}")
        found = {"posted": datetime.now(timezone.utc), "author": "local file",
                 "text": "", "url": None}
        print(f"Reading local image: {image_path.name}")
    else:
        token = require("GROUPME_ACCESS_TOKEN", "https://dev.groupme.com")
        found = newest_schedule_image(token, args.days)
        if not found:
            print(f"No image posted to the group in the last {args.days} days. Nothing to do.")
            return
        posted = (found["posted"] + CENTRAL_OFFSET).strftime("%a %b %d, %I:%M %p")
        print(f"Newest image — posted by {found['author']} on {posted}")
        if found["text"]:
            print(f"  message: {found['text'][:120]}")
        image_path = download(found["url"], SCHEDULE_DIR / "_incoming.jpg")

    api_key = require("ANTHROPIC_API_KEY", "https://console.anthropic.com")
    result = read_schedule(api_key, image_path)

    if not result.get("is_schedule"):
        print("\nThat image does not look like a schedule. Nothing written.")
        print("If the coach posted it as a document instead, use --image with a screenshot.")
        return

    days = sorted(result.get("days", []), key=lambda d: d["date"])
    print(f"\nRead {len(days)} days:")
    for day in days:
        print(f"  {day['date']}  {' · '.join(day['items'])}")
    if result.get("unreadable"):
        print("\n  Could not read with confidence:")
        for note in result["unreadable"]:
            print(f"    - {note}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return

    if not days:
        print("\nNo days found in the image. Nothing written.")
        return

    stamp = found["posted"].strftime("%Y-%m-%d")
    image_name = f"week-{days[0]['date']}.jpg"
    shutil.copyfile(image_path, SCHEDULE_DIR / image_name)
    if image_path.name == "_incoming.jpg":
        image_path.unlink(missing_ok=True)

    (DATA / "this_week.json").write_text(json.dumps({
        "weekOf": result.get("week_of") or days[0]["date"],
        "postedOn": stamp,
        "postedBy": found["author"],
        "note": found["text"][:300],
        "image": f"schedules/{image_name}",
        "unreadable": result.get("unreadable", []),
        "days": days,
    }, indent=2))

    print(f"\nWrote data/this_week.json and docs/schedules/{image_name}")

    subprocess.run([sys.executable, str(ROOT / "tools" / "build_web_data.py")], check=True)
    print("\nDone. Commit and push to put it on parents' phones.")


if __name__ == "__main__":
    main()
