#!/usr/bin/env python3
"""
Turn iPhone HEIC photos into web-ready JPEGs for the app gallery.

Three things happen to every photo:
  1. HEIC -> JPEG, because Safari renders HEIC but most other browsers don't
  2. resized down (a 4284x5712 phone photo is ~3 MB; nobody should burn that
     much of their data plan in a stadium parking lot)
  3. ALL EXIF stripped — camera, timestamps, and any GPS coordinates. These are
     photos of other people's children going on a public page; the location of
     where they were taken does not go with them.

Also writes docs/photos/photos.json so the app knows what's there.

Usage:
  prepare_photos.py <source-dir-or-files...> [--caption "Blue & White Night"]
"""

import argparse
import json
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "photos"

FULL_MAX = 1600   # long edge of the viewable image
THUMB_MAX = 500   # long edge of the grid thumbnail
QUALITY = 82

HEIC_SUFFIXES = {".heic", ".heif"}
JPEG_SUFFIXES = {".jpg", ".jpeg", ".png"}
VIDEO_SUFFIXES = {".mov", ".mp4", ".m4v"}


def decode_to_jpeg(path, workdir):
    """HEIC needs macOS `sips` to decode; PIL handles everything else."""
    if path.suffix.lower() not in HEIC_SUFFIXES:
        return path
    target = workdir / (path.stem + ".jpg")
    subprocess.run(
        ["sips", "-s", "format", "jpeg", str(path), "--out", str(target)],
        check=True, capture_output=True,
    )
    return target


def save_clean(img, dest, max_edge):
    """Resize to fit max_edge and save with no EXIF whatsoever."""
    copy = img.copy()
    copy.thumbnail((max_edge, max_edge), Image.LANCZOS)
    if copy.mode not in ("RGB", "L"):
        copy = copy.convert("RGB")
    # a fresh image object carries no EXIF from the original
    clean = Image.new(copy.mode, copy.size)
    clean.putdata(list(copy.getdata()))
    clean.save(dest, "JPEG", quality=QUALITY, optimize=True)
    return dest.stat().st_size


def collect(inputs):
    files = []
    for raw in inputs:
        path = pathlib.Path(raw).expanduser()
        if path.is_dir():
            files.extend(sorted(p for p in path.iterdir() if p.is_file()))
        elif path.is_file():
            files.append(path)
        else:
            print(f"  skipped (not found): {raw}", file=sys.stderr)
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--caption", default="")
    parser.add_argument("--album", default="", help="Shared album URL for the full set")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "thumbs").mkdir(exist_ok=True)

    entries = []
    skipped_video = []

    with tempfile.TemporaryDirectory() as tmp:
        workdir = pathlib.Path(tmp)

        for path in collect(args.inputs):
            suffix = path.suffix.lower()

            if suffix in VIDEO_SUFFIXES:
                skipped_video.append(path.name)
                continue
            if suffix not in HEIC_SUFFIXES | JPEG_SUFFIXES:
                continue

            try:
                decoded = decode_to_jpeg(path, workdir)
                with Image.open(decoded) as opened:
                    opened.load()
                    # iPhones store photos landscape plus an EXIF orientation
                    # flag. Bake the rotation into the pixels BEFORE stripping
                    # EXIF, or every portrait shot ends up on its side.
                    img = ImageOps.exif_transpose(opened)
                    name = path.stem.lower().replace(" ", "-")
                    full = save_clean(img, OUT_DIR / f"{name}.jpg", FULL_MAX)
                    save_clean(img, OUT_DIR / "thumbs" / f"{name}.jpg", THUMB_MAX)
                    width, height = img.size
            except Exception as exc:  # a single bad file shouldn't kill the run
                print(f"  FAILED {path.name}: {exc}", file=sys.stderr)
                continue

            entries.append({
                "file": f"{name}.jpg",
                "thumb": f"thumbs/{name}.jpg",
                "caption": args.caption,
                "portrait": height > width,
            })
            print(f"  {path.name} -> {name}.jpg ({full // 1024} KB)")

    manifest = {
        "album": args.album,
        "photos": entries,
    }
    (OUT_DIR / "photos.json").write_text(json.dumps(manifest, indent=2))

    total = sum((OUT_DIR / e["file"]).stat().st_size for e in entries)
    print(f"\n{len(entries)} photos -> docs/photos/  ({total // 1024 // 1024} MB total)")
    if skipped_video:
        print(f"skipped {len(skipped_video)} video file(s) — put those in the shared album: "
              + ", ".join(skipped_video))
    print("\nEXIF stripped from every image (no camera, timestamp, or GPS data).")


if __name__ == "__main__":
    main()
