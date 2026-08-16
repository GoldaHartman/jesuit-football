#!/usr/bin/env python3
"""
Bundle the whole app into ONE .html file you can text or email.

The recipient opens it on any phone, anywhere — no wifi of yours, no hosting,
no install. Everything is inlined: styles, code, season data, and the photos
as data: URIs.

Two things a single file can't do, and the app says so rather than showing a
dead button:

  * calendar subscriptions — those need a real URL for Google or Apple to poll
  * offline caching — no service worker without a server

Photos use the 500px thumbnails rather than the full 1600px versions. The full
set would push the file past 13 MB, which stops being textable; thumbnails
land it near 2 MB and still look right on a phone.

It is a SNAPSHOT. If a kickoff time changes, the file in someone's inbox is
wrong forever — which is the argument for hosting it properly.

Usage: build_standalone.py [output.html]
"""

import base64
import json
import mimetypes
import pathlib
import re
import sys
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"


def data_uri(path):
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.standard_b64encode(path.read_bytes()).decode()


def main():
    out_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "Jesuit-Football.html"

    html = (DOCS / "index.html").read_text()
    css = (DOCS / "style.css").read_text()
    app = (DOCS / "app.js").read_text()
    data = (DOCS / "data.js").read_text()

    # swap every photo path for an inlined thumbnail
    photos_dir = DOCS / "photos"
    manifest = json.loads((photos_dir / "photos.json").read_text()) if (photos_dir / "photos.json").exists() else {"photos": []}

    inlined, missing = 0, 0
    for photo in manifest["photos"]:
        thumb = photos_dir / photo["thumb"]
        if not thumb.exists():
            missing += 1
            continue
        uri = data_uri(thumb)
        # the grid and the full view both use the thumbnail here
        data = data.replace(f'"thumb": "{photo["thumb"]}"', f'"thumb": "{uri}"')
        data = data.replace(f'"file": "{photo["file"]}"', f'"file": "{uri}"')
        inlined += 1

    # a favicon so the browser tab isn't blank
    icon = DOCS / "icon-180.png"
    icon_tag = f'<link rel="icon" href="{data_uri(icon)}">' if icon.exists() else ""

    # strip anything that needs a server, then inline the rest
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', "", html)
    # lambda replacements, not f-strings: the JSON is full of \u escapes and
    # re.sub would try to interpret them as replacement templates
    html = re.sub(r'<link rel="stylesheet"[^>]*>',
                  lambda _: f"{icon_tag}\n<style>\n{css}\n</style>", html)
    html = re.sub(r'<script src="data\.js[^"]*"></script>',
                  lambda _: f"<script>\nconst IS_STANDALONE = true;\n{data}\n</script>", html)
    html = re.sub(r'<script src="app\.js[^"]*"></script>',
                  lambda _: f"<script>\n{app}\n</script>", html)

    built = datetime.now().strftime("%B %-d, %Y")
    html = html.replace("</head>",
                        f"<!-- Jesuit Football — single-file snapshot, built {built}. -->\n</head>")

    out_path.write_text(html)
    size_mb = out_path.stat().st_size / 1_048_576

    print(f"{out_path}")
    print(f"  {size_mb:.1f} MB · {inlined} photos inlined" + (f" · {missing} missing" if missing else ""))
    print(f"  built {built}")
    if size_mb > 20:
        print("  WARNING: over 20 MB — too big for most email. Consider dropping the photos.")
    print("\nThis is a snapshot. If the schedule changes, rebuild and resend —")
    print("the copy already in someone's inbox will never update itself.")


if __name__ == "__main__":
    main()
