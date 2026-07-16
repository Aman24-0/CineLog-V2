#!/usr/bin/env python3
"""Generate PWA icons (192x192 and 512x512) for CineLog V2.

The manifest.json references /icon-192.png and /icon-512.png but neither
file existed in public/. This script generates simple but on-brand
placeholder icons (dark background + purple "C" monogram) so the PWA
manifest doesn't 404 when browsers request the icons.

These are intentionally minimal — replace with proper designed icons
before public launch. The colors match the app's theme tokens:
  background: #0f0f0f (var(--bg))
  accent:     #7c3aed (var(--p))
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
OUT_DIR = os.path.abspath(OUT_DIR)

BG = (15, 15, 15, 255)       # #0f0f0f
ACCENT = (124, 58, 237, 255) # #7c3aed
WHITE = (255, 255, 255, 255)

def make_icon(size: int, path: str):
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # Draw a filled rounded-rect accent border
    margin = size // 12
    # Outer accent ring
    ring_width = max(2, size // 64)
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=size // 6,
        outline=ACCENT,
        width=ring_width,
    )

    # Draw "C" monogram in accent color, centered
    font_size = int(size * 0.55)
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            font_size,
        )
    except (OSError, IOError):
        font = ImageFont.load_default()

    # Get text bounding box for centering
    bbox = draw.textbbox((0, 0), "C", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1]
    draw.text((x, y), "C", fill=ACCENT, font=font)

    img.save(path, "PNG")
    print(f"  Generated {path} ({size}x{size})")

print("Generating CineLog PWA icons...")
make_icon(192, os.path.join(OUT_DIR, "icon-192.png"))
make_icon(512, os.path.join(OUT_DIR, "icon-512.png"))
# Also generate the 512 maskable variant (same image, different purpose in manifest)
make_icon(512, os.path.join(OUT_DIR, "icon-512-maskable.png"))
print("Done.")
