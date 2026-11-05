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
--pair     also write OUT-printed.png: the same box cut from the printed-only
           render (prepare_pdf.py writes it to printed/page-NN.png next to
           pages/), and report how much ink the crop contains (from
           ink/page-NN.png). Use the pair for the annotation toggle: the
           annotated crop is .ann, the printed one .printed-only. If it
           reports "ink: none", the crop is printed-only: mark it data-ink="none".
"""
import argparse
import base64
import io
from pathlib import Path

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
    ap.add_argument("--pair", action="store_true")
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
            inner = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(c.width, bbox[2] + pad), min(c.height, bbox[3] + pad))
            box = (box[0] + inner[0], box[1] + inner[1], box[0] + inner[2], box[1] + inner[3])
            c = im.crop(box)

    def finish(img, out):
        if a.zoom != 1.0:
            img = img.resize((int(img.width * a.zoom), int(img.height * a.zoom)), Image.LANCZOS)
        img.save(out, optimize=True)
        if a.datauri:
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            print("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())

    # warn when the box cuts through content: dark pixels on an edge of the crop
    # mean a bracket, a label or a stroke is cut off (or a fragment of the
    # neighbouring line got in). Move that edge until it runs through white.
    import sys
    g = c.convert("L")
    cw, ch = g.size
    edges = {"top": g.crop((0, 0, cw, 2)), "bottom": g.crop((0, ch - 2, cw, ch)),
             "left": g.crop((0, 0, 2, ch)), "right": g.crop((cw - 2, 0, cw, ch))}
    cut = [k for k, e in edges.items() if sum(e.point(lambda v: 255 if v < 200 else 0).histogram()[255:]) > 2]
    if cut:
        print(f"warning: content touches the {', '.join(cut)} edge of the crop; it is cut off or includes a neighbouring line. Adjust the box.", file=sys.stderr)

    finish(c, a.out)
    if a.pair:
        src = Path(a.image).resolve()
        printed = src.parent.parent / "printed" / src.name
        ink = src.parent.parent / "ink" / src.name
        if not printed.exists():
            raise SystemExit(f"--pair: {printed} not found (run prepare_pdf.py, which runs separate_ink.py)")
        pim = Image.open(printed).convert("RGB")
        if pim.size != im.size:
            raise SystemExit("--pair: printed render has a different size; use pages/ and printed/ from the same run")
        out2 = Path(a.out).with_name(Path(a.out).stem + "-printed.png")
        finish(pim.crop(box), out2)
        n = 0
        if ink.exists():
            m = ImageChops.difference(Image.open(ink).convert("RGB").crop(box), Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (255, 255, 255)))
            n = sum(m.convert("L").histogram()[25:])
        print(f"wrote {a.out} and {out2}; ink: {'none' if n == 0 else str(n) + ' px'}", file=sys.stderr)


if __name__ == "__main__":
    main()
