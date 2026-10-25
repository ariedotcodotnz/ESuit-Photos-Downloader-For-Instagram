#!/usr/bin/env python3
"""Renders the extension icons (public/icons/icon-<size>.png): a download arrow
on a gradient rounded square. Requires Pillow. Run: npm run icons"""
from pathlib import Path

from PIL import Image, ImageDraw

SIZES = (16, 19, 32, 38, 48, 128)
SCALE = 8  # draw large, then downsample for anti-aliasing
TOP_LEFT = (131, 58, 180)  # purple
BOTTOM_RIGHT = (253, 140, 50)  # orange
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            pixels[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP_LEFT, BOTTOM_RIGHT))
    return image


def render(size: int) -> Image.Image:
    big = size * SCALE
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 0.22, fill=255)
    icon = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    icon.paste(gradient(big), (0, 0), mask)

    draw = ImageDraw.Draw(icon)
    white = (255, 255, 255, 255)
    u = big / 16  # grid unit
    # Arrow shaft and head.
    draw.rectangle((7 * u, 3 * u, 9 * u, 9 * u), fill=white)
    draw.polygon([(4.2 * u, 7.6 * u), (11.8 * u, 7.6 * u), (8 * u, 11.4 * u)], fill=white)
    # Tray.
    draw.rectangle((3.5 * u, 12 * u, 12.5 * u, 13.4 * u), fill=white)
    return icon.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        render(size).save(OUT / f"icon-{size}.png")
        print(f"wrote {OUT / f'icon-{size}.png'}")


if __name__ == "__main__":
    main()
