#!/usr/bin/env python3
"""Separate the instructor's ink from the printed notes.

Annotated notes usually store the ink in one of two ways:
  * as PDF annotations (/Annots: Ink, Highlight, Underline, FreeText ...), or
  * flattened into the page: the annotation app appends its strokes to the end
    of the page's content stream, after the last typed text, normally inside a
    group that starts with a full-page clip ("q 0 0 W H re W n").
This script removes both and writes, inside OUT_DIR:

  printed-only.pdf            the notes without the ink
  printed/page-NN.png         printed-only render (same DPI as pages/)
  ink/page-NN.png             the ink alone on white
  ink/page-NN-map.png         the page with printed content faded and every ink
                              region boxed and numbered (p05-r3 ...)
  ink/regions.json            per page: separation method and every ink region
                              (id, fractional bbox, pixel count, colour name, hex)

Use it to tell print from ink (filled-in blanks, ink drawn on printed figures),
to get printed-only crops for the "annotations off" view, and as a completeness
map: every region id must end up in some inventory item's "regions" list (or in
a stray item), and check_deck.js verifies that.

Usage:
  python3 separate_ink.py NOTES.pdf OUT_DIR [--dpi 200]
Normally run for you by prepare_pdf.py. Needs pypdf, numpy, Pillow, pdftoppm.
If a page has no separable ink layer (scanned notes, or a layout this script
does not recognise) it says so; read that page's ink by eye as usual.
"""
import argparse
import json
import re
import subprocess
import sys
from collections import deque
from pathlib import Path

try:
    import numpy as np
    import pypdf
    from pypdf.generic import NameObject, StreamObject
    from PIL import Image, ImageDraw, ImageFont
except ImportError as e:  # degrade gracefully: the rest of the skill still works
    print(f"separate_ink: skipped ({e}); read the ink by eye", file=sys.stderr)
    sys.exit(0)

MARKUP = {"/Ink", "/Highlight", "/Underline", "/StrikeOut", "/Squiggly", "/FreeText", "/Square",
          "/Circle", "/Line", "/Polygon", "/PolyLine", "/Caret", "/Text", "/Stamp"}
NUM = rb"(-?[\d.]+)"
CLIP = re.compile(rb"(?<![A-Za-z])q\s+" + NUM + rb"\s+" + NUM + rb"\s+" + NUM + rb"\s+" + NUM + rb"\s+re\s+W\*?\s+n")
TOKEN_Q = re.compile(rb"(?<![A-Za-z0-9/])([qQ])(?![A-Za-z0-9])")

NAMED = {  # ink colours seen in annotated notes; nearest name is reported
    "yellow-highlight": (250, 238, 110), "green-highlight": (160, 232, 185), "orange-highlight": (255, 196, 120),
    "pink-highlight": (250, 170, 215), "blue-highlight": (160, 210, 250),
    "red": (214, 51, 42), "magenta": (194, 24, 155), "pink": (232, 90, 170), "purple": (120, 60, 180),
    "blue": (31, 111, 224), "navy": (35, 41, 122), "green": (23, 128, 74), "orange": (230, 120, 30),
    "black": (30, 30, 30), "grey": (128, 128, 128),
}


def colour_name(rgb):
    return min(NAMED, key=lambda k: sum((a - b) ** 2 for a, b in zip(NAMED[k], rgb)))


def strip_stream(data, mbox):
    """Return (printed_bytes, removed) by cutting the flattened ink group."""
    ets = [m.end() for m in re.finditer(rb"(?<![A-Za-z])ET(?![A-Za-z])", data)]
    last_text = ets[-1] if ets else 0
    W = float(mbox.width); H = float(mbox.height)
    for m in CLIP.finditer(data, last_text):
        w, h = abs(float(m.group(3))), abs(float(m.group(4)))
        if w * h >= 0.9 * W * H:
            cut = data[:m.start()]
            if re.search(rb"(?<![A-Za-z])BT(?![A-Za-z])", data[m.start():]):
                return data, False  # typed text after the group: not an ink layer
            depth = 0
            for t in TOKEN_Q.finditer(cut):
                depth += 1 if t.group(1) == b"q" else -1
            if depth > 0:
                cut += b"\n" + b"Q " * depth
            return cut, True
    return data, False


def render(pdf, page, dpi, base):
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(dpi), "-png", "-singlefile",
                    str(pdf), str(base)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return Path(f"{base}.png")


def regions_from_mask(mask, cell, grow):
    h, w = mask.shape
    gh, gw = (h + cell - 1) // cell, (w + cell - 1) // cell
    pad = np.zeros((gh * cell, gw * cell), bool)
    pad[:h, :w] = mask
    grid = pad.reshape(gh, cell, gw, cell).sum(axis=(1, 3))
    occ = grid > 0
    dil = occ.copy()
    for dy in range(-grow, grow + 1):
        for dx in range(-grow, grow + 1):
            dil |= np.roll(np.roll(occ, dy, 0), dx, 1)
    seen = np.zeros_like(dil)
    out = []
    for y0, x0 in zip(*np.nonzero(dil)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; cells = []
        while q:
            y, x = q.popleft(); cells.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < gh and 0 <= nx < gw and dil[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        ys = [c[0] for c in cells if occ[c]]; xs = [c[1] for c in cells if occ[c]]
        if not ys:
            continue
        out.append((min(ys) * cell, min(xs) * cell, min(h, (max(ys) + 1) * cell), min(w, (max(xs) + 1) * cell)))
    out.sort(key=lambda b: (b[0] // (cell * 6), b[1]))  # reading order: rows, then left to right
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--dpi", type=int, default=200)
    a = ap.parse_args()
    pdf = Path(a.pdf).resolve(); out = Path(a.out).resolve()
    (out / "printed").mkdir(parents=True, exist_ok=True)
    (out / "ink").mkdir(parents=True, exist_ok=True)

    reader = pypdf.PdfReader(str(pdf))
    writer = pypdf.PdfWriter()
    methods = []
    for page in reader.pages:
        how = []
        np_ = writer.add_page(page)
        annots = page.get("/Annots")
        if annots:
            kept = [x for x in annots if x.get_object().get("/Subtype") not in MARKUP]
            if len(kept) != len(annots):
                how.append("annotations")
                np_[NameObject("/Annots")] = pypdf.generic.ArrayObject(kept)
        try:
            data = page.get_contents().get_data()
        except Exception:
            data = None
        if data:
            clean, removed = strip_stream(data, page.mediabox)
            if removed:
                how.append("content-stream")
                s = StreamObject(); s._data = clean
                np_[NameObject("/Contents")] = writer._add_object(s)
        methods.append(how)
    printed_pdf = out / "printed-only.pdf"
    with open(printed_pdf, "wb") as f:
        writer.write(f)

    n = len(reader.pages)
    width = len(str(n)) if n >= 10 else 2
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", max(14, a.dpi // 9))
    except OSError:
        font = ImageFont.load_default()
    report = {"pdf": str(pdf), "dpi": a.dpi, "pages": {}}
    for i in range(1, n + 1):
        tag = f"{i:0{width}d}"
        full_png = out / "pages" / f"page-{tag}.png"
        if not full_png.exists():
            full_png = render(pdf, i, a.dpi, out / "ink" / f"_full-{tag}")
        pr_png = render(printed_pdf, i, a.dpi, out / "printed" / f"page-{tag}")
        full = np.asarray(Image.open(full_png).convert("RGB")).astype(np.int16)
        prn = np.asarray(Image.open(pr_png).convert("RGB")).astype(np.int16)
        if full.shape != prn.shape:
            report["pages"][str(i)] = {"method": "none", "note": "render size mismatch", "regions": []}
            continue
        mask = np.abs(full - prn).max(axis=2) > 28
        entry = {"method": "+".join(methods[i - 1]) or "none", "ink_fraction": round(float(mask.mean()), 4), "regions": []}
        ink = np.where(mask[..., None], full, 255).astype(np.uint8)
        Image.fromarray(ink).save(out / "ink" / f"page-{tag}.png", optimize=True)
        fade = (prn * 0.35 + 255 * 0.65).astype(np.uint8)
        mp = Image.fromarray(np.where(mask[..., None], full.astype(np.uint8), fade))
        d = ImageDraw.Draw(mp)
        H, W = mask.shape
        cell = max(4, a.dpi // 33)
        k = 0
        for (y0, x0, y1, x1) in regions_from_mask(mask, cell, grow=3):
            px = full[y0:y1, x0:x1][mask[y0:y1, x0:x1]]
            if len(px) < 12:
                continue  # sub-pixel speck
            k += 1
            med = tuple(int(v) for v in np.median(px, axis=0))
            rid = f"p{i:02d}-r{k}"
            entry["regions"].append({"id": rid, "bbox": [round(x0 / W, 3), round(y0 / H, 3), round(x1 / W, 3), round(y1 / H, 3)],
                                     "pixels": int(len(px)), "colour": colour_name(med), "hex": "#%02x%02x%02x" % med})
            d.rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], outline=(20, 20, 20), width=2)
            lab = f"r{k}"
            tw = d.textlength(lab, font=font)
            ty = y0 - font.size - 6 if y0 > font.size + 8 else y1 + 4
            d.rectangle([x0 - 3, ty, x0 + tw + 5, ty + font.size + 4], fill=(20, 20, 20))
            d.text((x0 + 1, ty + 1), lab, fill=(255, 255, 255), font=font)
        mp.save(out / "ink" / f"page-{tag}-map.png", optimize=True)
        report["pages"][str(i)] = entry
        for tmp in (out / "ink").glob("_full-*.png"):
            tmp.unlink()
    (out / "ink" / "regions.json").write_text(json.dumps(report, indent=1))

    total = sum(len(p["regions"]) for p in report["pages"].values())
    print(f"ink separation -> {out}/printed, {out}/ink ({total} ink regions)")
    for p, e in report["pages"].items():
        cols = sorted({r["colour"] for r in e["regions"]})
        print(f"  p{int(p):02d}: {e['method']:<15} {len(e['regions']):>3} regions  {', '.join(cols)}")
    none = [p for p, e in report["pages"].items() if e["method"] == "none"]
    if none:
        print(f"  no separable ink layer on pages {', '.join(none)}: read their ink by eye (scanned or unusual layout).")
    print("  Verify: printed/page-NN.png should show every typed line and printed figure, with only the ink gone.")


if __name__ == "__main__":
    main()
