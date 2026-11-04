#!/usr/bin/env python3
"""Crop a region of a rendered PDF page, for close reading or for embedding.

Coordinates are fractions of the page (0..1), so they work at any DPI:
  python3 crop.py pages/page-05.png 0.70 0.00 1.00 0.18 out.png
  python3 crop.py pages/page-05.png 0.70 0.00 1.00 0.18 out.png --zoom 2
  python3 crop.py pages/page-05.png 0.70 0.00 1.00 0.18 out.png --datauri > sketch.txt

--zoom N   upscale the crop N times (helps when reading small handwriting)
--datauri  also print a data:image/png;base64,... string to stdout, ready to
           paste into <img src="..."> so the deck stays a single file
--trim     remove the white margin around the ink before saving
"""
import argparse
import base64
import io

from PIL import Image, ImageChops


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("x0", type=float)
    ap.add_argument("y0", type=float)
    ap.add_argument("x1", type=float)
    ap.add_argument("y1", type=float)
    ap.add_argument("out")
    ap.add_argument("--zoom", type=float, default=1.0)
    ap.add_argument("--datauri", action="store_true")
    ap.add_argument("--trim", action="store_true")
    a = ap.parse_args()

    im = Image.open(a.image).convert("RGB")
    W, H = im.size
    box = (int(a.x0 * W), int(a.y0 * H), int(a.x1 * W), int(a.y1 * H))
    c = im.crop(box)
    if a.trim:
        bg = Image.new("RGB", c.size, (255, 255, 255))
        diff = ImageChops.difference(c, bg).convert("L").point(lambda v: 255 if v > 24 else 0)
        bbox = diff.getbbox()
        if bbox:
            pad = 12
            c = c.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                        min(c.width, bbox[2] + pad), min(c.height, bbox[3] + pad)))
    if a.zoom != 1.0:
        c = c.resize((int(c.width * a.zoom), int(c.height * a.zoom)), Image.LANCZOS)
    c.save(a.out, optimize=True)
    if a.datauri:
        buf = io.BytesIO()
        c.save(buf, format="PNG", optimize=True)
        print("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())


if __name__ == "__main__":
    main()
