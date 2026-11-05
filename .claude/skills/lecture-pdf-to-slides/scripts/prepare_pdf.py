#!/usr/bin/env python3
"""Prepare a lecture-notes PDF for close reading.

Creates, inside OUT_DIR:
  pages/page-NN.png        full page at --dpi (default 200)
  zoom/page-NN-rK.png      the page cut into overlapping horizontal bands at
                           2x the base resolution, for reading handwriting,
                           small subscripts and faint highlighter
  text/page-NN.txt         pdftotext -layout output (typed text only;
                           handwritten ink is NOT in here)
  images/                  distinct embedded raster images (pdfimages -png);
                           repeated pen/highlighter texture stamps go to
                           images/_stamps and can be ignored
  manifest.json            page count and file lists
  printed/, ink/           from separate_ink.py (run automatically): the
                           printed-only page renders, the ink alone, a
                           numbered map of every ink region per page
                           (ink/page-NN-map.png) and ink/regions.json

Usage:
  python3 prepare_pdf.py NOTES.pdf OUT_DIR [--dpi 200] [--bands 4]

Requires poppler-utils (pdftoppm, pdftotext, pdfimages) and Pillow.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def page_count(pdf):
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    raise SystemExit("could not read page count (is pdfinfo installed?)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--bands", type=int, default=4, help="horizontal zoom bands per page")
    a = ap.parse_args()

    pdf = Path(a.pdf).resolve()
    out = Path(a.out).resolve()
    for d in ("pages", "zoom", "text", "images"):
        (out / d).mkdir(parents=True, exist_ok=True)

    n = page_count(pdf)
    width = len(str(n)) if n >= 10 else 2
    manifest = {"pdf": str(pdf), "pages": n, "dpi": a.dpi, "files": []}

    for p in range(1, n + 1):
        tag = f"{p:0{width}d}"
        base = out / "pages" / f"page-{tag}"
        run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", str(a.dpi), "-png", "-singlefile", str(pdf), str(base)])
        hi = out / "zoom" / f"_hi-{tag}"
        run(["pdftoppm", "-f", str(p), "-l", str(p), "-r", str(a.dpi * 2), "-png", "-singlefile", str(pdf), str(hi)])
        txt = out / "text" / f"page-{tag}.txt"
        run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", str(pdf), str(txt)])

        im = Image.open(f"{hi}.png")
        W, H = im.size
        band = H / a.bands
        overlap = int(band * 0.15)
        zooms = []
        for k in range(a.bands):
            top = max(0, int(k * band) - overlap)
            bot = min(H, int((k + 1) * band) + overlap)
            z = out / "zoom" / f"page-{tag}-r{k + 1}.png"
            im.crop((0, top, W, bot)).save(z)
            zooms.append(str(z.relative_to(out)))
        Path(f"{hi}.png").unlink()
        manifest["files"].append({
            "page": p,
            "image": str(Path(f"{base}.png").relative_to(out)),
            "zoom": zooms,
            "text": str(txt.relative_to(out)),
            "text_chars": len(txt.read_text(errors="ignore").strip()),
        })

    try:
        run(["pdfimages", "-png", str(pdf), str(out / "images" / "img")])
    except subprocess.CalledProcessError:
        print("pdfimages failed; continuing without embedded images", file=sys.stderr)
    # Annotation apps often embed the same pen/highlighter texture hundreds of
    # times. Keep only distinct, reasonably large images as candidate figures.
    import hashlib
    stamps = out / "images" / "_stamps"
    stamps.mkdir(exist_ok=True)
    seen = {}
    for img in sorted((out / "images").glob("*.png")):
        seen.setdefault(hashlib.md5(img.read_bytes()).hexdigest(), []).append(img)
    kept = []
    for group in seen.values():
        w, h = Image.open(group[0]).size
        if len(group) > 2 or min(w, h) < 80:
            for g in group:
                g.rename(stamps / g.name)
        else:
            kept.append(group[0])
            for g in group[1:]:
                g.rename(stamps / g.name)
    manifest["embedded_images"] = sorted(str(p.relative_to(out)) for p in kept)

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"{n} pages -> {out}")
    print(f"  pages/  zoom/ ({a.bands} bands/page)  text/  images/ ({len(manifest['embedded_images'])} distinct embedded figures; repeated pen/texture stamps moved to images/_stamps)")
    low = [f["page"] for f in manifest["files"] if f["text_chars"] < 40]
    if low:
        print(f"  pages with little or no extractable text (scanned or handwritten?): {low}")

    # Separate the ink from the print (printed/, ink/, ink/regions.json).
    sep = Path(__file__).resolve().parent / "separate_ink.py"
    r = subprocess.run([sys.executable, str(sep), str(pdf), str(out), "--dpi", str(a.dpi)], capture_output=True, text=True)
    print(r.stdout.rstrip())
    if r.returncode != 0:
        print("separate_ink.py failed; read the ink by eye:\n" + r.stderr[-800:], file=sys.stderr)


if __name__ == "__main__":
    main()
