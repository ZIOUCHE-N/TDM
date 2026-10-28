#!/usr/bin/env python3
"""Generate the original NZix application icon set.

The icon is a turquoise rounded tile with the NZix wordmark. It is rendered at
high resolution then downsampled with Lanczos filtering so small sizes stay
legible. Only the application assets are written; browser-extension icons keep
their existing artwork.

Requires Pillow (development-time only; not needed to build or run TDM).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
ICONS = BUILD / "icons"

MASTER = 1024
MARGIN = 42
RADIUS = 214
TOP = (99, 232, 202)
BOTTOM = (31, 176, 146)
INK = (7, 33, 27)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"
WORDMARK = "NZix"


def gradient_tile() -> Image.Image:
    tile = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    gradient = Image.new("RGBA", (MASTER, MASTER))
    pixels = gradient.load()
    for y in range(MASTER):
        t = y / (MASTER - 1)
        # Diagonal-like blend: slightly brighter at the top-left.
        for x in range(0, MASTER, 4):
            u = (x / (MASTER - 1) + t) / 2
            r = round(TOP[0] + (BOTTOM[0] - TOP[0]) * u)
            g = round(TOP[1] + (BOTTOM[1] - TOP[1]) * u)
            b = round(TOP[2] + (BOTTOM[2] - TOP[2]) * u)
            for dx in range(4):
                if x + dx < MASTER:
                    pixels[x + dx, y] = (r, g, b, 255)

    mask = Image.new("L", (MASTER, MASTER), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (MARGIN, MARGIN, MASTER - MARGIN, MASTER - MARGIN),
        radius=RADIUS,
        fill=255,
    )
    tile.paste(gradient, (0, 0), mask)
    return tile


def fitted_font(max_width: int, max_height: int) -> ImageFont.FreeTypeFont:
    size = max_height
    while size > 8:
        font = ImageFont.truetype(FONT_PATH, size)
        box = font.getbbox(WORDMARK)
        width = box[2] - box[0]
        height = box[3] - box[1]
        if width <= max_width and height <= max_height:
            return font
        size -= 4
    return ImageFont.truetype(FONT_PATH, 8)


def render_master() -> Image.Image:
    image = gradient_tile()

    # Subtle inner rim keeps the tile crisp on light backgrounds.
    rim = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim)
    rim_draw.rounded_rectangle(
        (MARGIN + 6, MARGIN + 6, MASTER - MARGIN - 6, MASTER - MARGIN - 6),
        radius=RADIUS - 6,
        outline=(255, 255, 255, 46),
        width=6,
    )
    image = Image.alpha_composite(image, rim)

    draw = ImageDraw.Draw(image)
    font = fitted_font(int(MASTER * 0.70), int(MASTER * 0.34))
    box = draw.textbbox((0, 0), WORDMARK, font=font)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    x = (MASTER - text_width) / 2 - box[0]
    y = (MASTER - text_height) / 2 - box[1]
    draw.text((x, y), WORDMARK, font=font, fill=INK)
    return image


def resize(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.LANCZOS)


def main() -> int:
    if not Path(FONT_PATH).exists():
        print(f"Police introuvable : {FONT_PATH}", file=sys.stderr)
        return 1

    ICONS.mkdir(parents=True, exist_ok=True)
    master = render_master()

    sizes = [16, 24, 32, 48, 64, 128, 256, 512]
    rendered = {}
    for size in sizes:
        image = resize(master, size)
        rendered[size] = image
        if size <= 256:
            image.save(ICONS / f"{size}x{size}.png", "PNG", optimize=True)

    rendered[512].save(BUILD / "icon.png", "PNG", optimize=True)
    rendered[32].save(BUILD / "tray.png", "PNG", optimize=True)
    rendered[64].save(BUILD / "notification.png", "PNG", optimize=True)
    rendered[256].save(
        BUILD / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    print("Icônes NZix générées dans build/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
