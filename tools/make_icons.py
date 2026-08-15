#!/usr/bin/env python3
"""
Generate the home-screen icons: a white football on Blue Jay navy.

Drawn at 4x and downsampled, which is cheaper than pulling in a real
vector rasteriser and looks the same at icon sizes.

Usage: make_icons.py
"""

import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs"

NAVY = (10, 36, 80)
WHITE = (255, 255, 255)
GOLD = (200, 162, 74)

SUPERSAMPLE = 4


def draw_icon(size, *, maskable=False):
    """maskable icons keep the art inside the safe circle Android crops to."""
    s = size * SUPERSAMPLE
    img = Image.new("RGB", (s, s), NAVY)
    d = ImageDraw.Draw(img)

    # shrink the art for maskable so Android's circular crop can't clip it
    inset = 0.30 if maskable else 0.17
    pad_x = s * inset
    pad_y = s * (inset + 0.10)

    ball = (pad_x, pad_y, s - pad_x, s - pad_y)
    d.ellipse(ball, fill=WHITE)

    cx, cy = s / 2, s / 2
    half_w = (s - 2 * pad_x) / 2

    # long seam
    seam = half_w * 0.52
    lw = max(1, int(s * 0.022))
    d.line([(cx - seam, cy), (cx + seam, cy)], fill=NAVY, width=lw)

    # laces
    lace_half = s * 0.036
    step = seam / 3.2
    for i in (-1.5, -0.5, 0.5, 1.5):
        x = cx + i * step
        d.line([(x, cy - lace_half), (x, cy + lace_half)], fill=NAVY, width=lw)

    # gold bar under the ball — the Blue Jay accent
    bar_w = s * 0.30
    bar_h = max(2, int(s * 0.030))
    bar_y = s - pad_y + s * 0.055
    d.rounded_rectangle(
        [cx - bar_w / 2, bar_y, cx + bar_w / 2, bar_y + bar_h],
        radius=bar_h / 2, fill=GOLD,
    )

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        draw_icon(size).save(OUT / f"icon-{size}.png")
        print(f"icon-{size}.png")
    draw_icon(512, maskable=True).save(OUT / "icon-512-maskable.png")
    print("icon-512-maskable.png")


if __name__ == "__main__":
    main()
