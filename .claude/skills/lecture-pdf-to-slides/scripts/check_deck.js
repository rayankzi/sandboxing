#!/usr/bin/env node
/*
 * Render-and-inspect check for a reveal.js lecture deck built with this skill.
 *
 * Usage:
 *   node check_deck.js DECK.html OUT_DIR [--inventory inventory.json] [--regions ink/regions.json] [--pages prep/pages]
 *
 * It opens the deck in headless Chromium at 1280x720, visits every slide with
 * all fragments shown, writes OUT_DIR/slide-NNN.png and contact sheets
 * (OUT_DIR/contact-N.png, 12 slides each), then does the same with the
 * annotation layer hidden (OUT_DIR/noann-NNN.png, noann-contact-N.png).
 *
 * Problems reported per slide (each one fails the run):
 *   layout     content outside the 1280x720 canvas; display math that scrolls;
 *              slide chrome (controls, slide number, toggle, source tag)
 *              overlapping each other or the slide content
 *   math       KaTeX errors; raw TeX left in the text; Unicode/plain-text math
 *              outside KaTeX (R^n, x1, ℝ, →, θ, ², 45° ...); smallmatrix or
 *              \scriptsize math; math glyphs under 14px (math set below 20px,
 *              nested scripts); a "(" left at the end of a
 *              line or ")" "." "," pushed to the start of the next one
 *   text       readable text under 22px (only the source tag, slide number and
 *              toggle may be 18-20px); SVG labels under 18px
 *   figures    labels overlapping each other or crossed by a drawn line or
 *              arrow; images shown too small to read (< 200px tall and
 *              < 320px wide); images without alt; SVG without role/aria-label
 *   density    more than 75 words of prose, or words + 12 x display equations >= 85
 *   ink        an inventory item with "source": "annotation" whose element is
 *              not in the ink layer (.hw, .hw-block, .ann-note, .ann, hl-/ul-/
 *              circ-/box- emphasis); instructor material (.hw, .ann-note,
 *              .hw-block) set in the body
 *              colour instead of an ink colour
 *   ann-off    anything still visible with annotations hidden that belongs to
 *              the ink layer: .ann/.hw elements, text in an ink colour, PDF
 *              crops not marked printed-only, captions that talk about the
 *              instructor's ink
 * More checks: a function with no argument (\cos & ...) or an empty group; a
 * formula left alone on the last line of a note; an underline running into
 * the line below; matrices stretched apart by labels; content crowding the
 * title or the chrome (< 8-10px); captions that describe pen colours.
 *
 * Fidelity aids: OUT_DIR/tex-by-slide.txt (every formula, slide by slide) and,
 * with --pages, OUT_DIR/compare-pNN.png (each PDF page next to every slide
 * whose source tag cites it; a page no slide cites is reported).
 *
 * Also: console errors, failed requests, inventory coverage (data-inv ids) and,
 * with --regions, that every ink region from separate_ink.py is claimed by an
 * inventory item ("regions": [...]) or by an ignored stray item.
 *
 * Escape hatches, for the rare intentional case (say why in an HTML comment):
 *   data-overlap-ok  on a label or line that may touch another
 *   data-small-ok    on an image that is meant to be small (an icon)
 *   data-dense-ok    on a summary slide that is meant to be dense
 *   data-noann-ok    on text that may stay visible with annotations off
 *   data-plain-ok    on text where a Unicode symbol is not math
 *   data-widow-ok    on a block whose last line may be a lone formula
 *   data-stretch-ok  on a matrix whose wide columns are intended
 *
 * Exit code 0 = RESULT: clean, 1 = problems found.
 * Uses the preinstalled Playwright: require('playwright') works anywhere.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("usage: node check_deck.js DECK.html OUT_DIR [--inventory inventory.json] [--regions regions.json]");
  process.exit(2);
}
const deck = path.resolve(args[0]);
const out = path.resolve(args[1]);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? path.resolve(args[i + 1]) : null; };
const inventoryPath = opt("--inventory");
const regionsPath = opt("--regions");
const pagesDir = opt("--pages");
fs.mkdirSync(out, { recursive: true });

/* ---------------------------------------------------------------- per-slide checks (run in the page) */
function inspectSlide(arg) {
  const mode = arg.mode, annIds = new Set(arg.annIds || []);
  const s = Reveal.getCurrentSlide();
  const W = Reveal.getConfig().width, H = Reveal.getConfig().height;
  const scale = Reveal.getScale();
  const sb = s.getBoundingClientRect();
  const issues = [];
  const px = (v) => v / scale;                         // screen px -> canvas px
  const vis = (el) => {
    if (el.closest(".katex-mathml")) return false;       // KaTeX's visually hidden MathML copy
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    }
    return el.getClientRects().length > 0;
  };
  const snip = (t) => (t || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const ownText = (el) => [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join("").trim();
  const skipZone = ".src, aside.notes, .katex-mathml, script, style";
  const toRgb = (c) => { const d = document.createElement("span"); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
  const root = getComputedStyle(document.documentElement);
  const inkRgb = new Set();
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch (e) { continue; }
    for (const r of rules) if (r.style) for (const p of r.style) if (/^--ann-/.test(p)) { const v = root.getPropertyValue(p).trim(); if (v) inkRgb.add(toRgb(v)); }
  }
  const bodyInk = getComputedStyle(document.querySelector(".reveal")).color;

  if (mode === "on") {
    // ---- overflow (ignore KaTeX's clipped 400em radical/arrow SVGs)
    let worst = 0, culprit = "";
    s.querySelectorAll("*").forEach((el) => {
      if (el.closest(skipZone) || el.closest(".katex .hide-tail, .katex svg")) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") return;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return;
      const over = Math.max(px(b.bottom - sb.top) - H, px(b.right - sb.left) - W, px(sb.top - b.top), px(sb.left - b.left));
      if (over > worst) { worst = over; culprit = `<${el.tagName.toLowerCase()}> "${snip(el.textContent)}"`; }
    });
    if (worst > 2) issues.push(`layout: content overflows the 1280x720 canvas by ~${Math.round(worst)}px (worst: ${culprit})`);
    s.querySelectorAll(".katex-display").forEach((d) => { if (d.scrollWidth > d.clientWidth + 2) issues.push("layout: display equation wider than its column (scrolls)"); });

    // ---- chrome collisions: controls, slide number, toggle, source tag, slide content
    const chrome = [];
    document.querySelectorAll(".reveal .controls button").forEach((b) => { if (vis(b) && parseFloat(getComputedStyle(b).opacity) > 0.15) chrome.push(["navigation arrow", b.getBoundingClientRect()]); });
    const sn = document.querySelector(".reveal .slide-number"); if (sn && vis(sn) && sn.textContent.trim()) chrome.push(["slide number", sn.getBoundingClientRect()]);
    const tg = document.getElementById("ann-toggle"); if (tg && vis(tg)) chrome.push(["annotation toggle", tg.getBoundingClientRect()]);
    s.querySelectorAll(".src").forEach((e) => { if (vis(e)) chrome.push(["source tag", e.getBoundingClientRect()]); });
    const inter = (a, b, pad = 0) => !(a.right <= b.left + pad || b.right <= a.left + pad || a.bottom <= b.top + pad || b.bottom <= a.top + pad);
    for (let i = 0; i < chrome.length; i++) for (let j = i + 1; j < chrome.length; j++) {
      if (chrome[i][0] === "navigation arrow" && chrome[j][0] === "navigation arrow") continue;
      if (inter(chrome[i][1], chrome[j][1])) issues.push(`layout: ${chrome[i][0]} overlaps ${chrome[j][0]}`);
    }
    const contentEls = [...s.querySelectorAll("p, li, td, th, h1, h2, h3, figure, .box, .eq, .katex-display, img, svg, table, .ann-note")].filter((e) => vis(e) && !e.closest(".src, aside.notes"));
    const grow = (r, g) => ({ left: r.left - g, right: r.right + g, top: r.top - g, bottom: r.bottom + g });
    for (const [name, r] of chrome) {
      const hit = contentEls.find((e) => inter(e.getBoundingClientRect(), grow(r, 8 * scale)));
      if (hit) issues.push(`layout: ${name} overlaps or crowds slide content (closer than 8px) <${hit.tagName.toLowerCase()}> "${snip(hit.textContent)}"`);
    }
    // content crowding the slide title
    const ttl = s.querySelector("h2.slide-title");
    if (ttl && vis(ttl)) {
      const tb = ttl.getBoundingClientRect().bottom;
      const first = contentEls.filter((e) => e !== ttl && !ttl.contains(e) && !e.contains(ttl)).map((e) => e.getBoundingClientRect().top).filter((t) => t >= tb - 40);
      if (first.length && px(Math.min(...first) - tb) < 10) issues.push(`layout: content starts ${Math.max(0, Math.round(px(Math.min(...first) - tb)))}px under the title (leave at least 10px; split the slide if it is full)`);
    }

    // ---- TeX lint: a function with no argument (\\cos & ...), empty bold, empty scripts
    s.querySelectorAll(".katex annotation").forEach((a) => {
      const t = a.textContent;
      const m = t.match(/\\(sin|cos|tan|cot|sec|csc|log|ln|exp|det|dim)\s*(?=$|&|\\\\|\\end|[}\])=,]|\\right|\\quad|\\qquad)/);
      if (m) issues.push(`math: "\\${m[1]}" with no argument in "${snip(t).slice(0, 50)}" (a dropped variable, e.g. \\cos\\theta?)`);
      if (/\\math(bf|bb|rm|cal)\{\s*\}|\^\{\s*\}|_\{\s*\}/.test(t)) issues.push(`math: empty group in "${snip(t).slice(0, 50)}"`);
    });

    // ---- KaTeX errors, raw TeX, Unicode math, orphaned brackets
    s.querySelectorAll(".katex-error").forEach((e) => issues.push(`math: KaTeX error: ${e.getAttribute("title") || e.textContent}`));
    const uni = /[ℝℕℤℚℂ→←↦⇒⇐⇔↔≤≥≠≈≡∈∉⊂⊆⊃⊇∪∩∅∑∏∫√∞∀∃θαβγδλμπσφψωΘΛΣΦΩ²³¹⁰⁴⁵⁶⁷⁸⁹⁻ⁿ₀₁₂₃₄₅₆₇₈₉ₙᵀ⋅·×−±°]/;
    const plain = /(\b[A-Za-z]\^[0-9a-z]\b)|(\b[a-zA-Z][0-9]\b(?![.:]\d))|(\bR\^?[23n]\b)|(\b[a-z]_[0-9a-z]\b)/;
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const pe = n.parentElement;
      if (!pe || pe.closest(".katex, script, style, aside.notes, [data-plain-ok], .src")) continue;
      const t = n.textContent;
      if (!t.trim()) continue;
      if (/\\\(|\\\)|\\\[|\\\]|\$\$|\\frac|\\begin\{|\\mathbf|\\operatorname/.test(t)) issues.push(`math: untypeset TeX: "${snip(t)}"`);
      else if (!pe.closest("svg") && (uni.test(t) || plain.test(t))) issues.push(`math: plain-text/Unicode math outside KaTeX: "${snip(t)}" (typeset it with \\( \\), or add data-plain-ok if it is not math)`);
      else if (pe.closest("svg") && uni.test(t) && /[ℝ→⇔≤≥∈θαβλπ²³₁₂ᵀ]/.test(t)) issues.push(`math: Unicode math in an SVG label: "${snip(t)}" (draw the label as KaTeX in an HTML overlay)`);
    }
    // orphaned "(" at a line end, or ")" "." "," pushed to the start of the next line
    const blockish = (e) => /^(block|flex|grid|list-item|table-cell|table|inline-flex|inline-grid)$/.test(getComputedStyle(e).display);
    const glyphRect = (node, dir) => {           // first (dir>0) or last (dir<0) non-space glyph of a text node
      const t = node.textContent; let i = dir > 0 ? 0 : t.length - 1;
      while (i >= 0 && i < t.length && /\s/.test(t[i])) i += dir;
      if (i < 0 || i >= t.length) return null;
      const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); return r.getBoundingClientRect();
    };
    const neighbour = (node, i, dir) => {        // rect of the nearest visible glyph before/after char i
      const t = node.textContent;
      for (let j = i + dir; j >= 0 && j < t.length; j += dir) if (!/\s/.test(t[j])) { const r = document.createRange(); r.setStart(node, j); r.setEnd(node, j + 1); return r.getBoundingClientRect(); }
      let cur = node;
      while (cur && cur !== s) {
        for (let sib = dir > 0 ? cur.nextSibling : cur.previousSibling; sib; sib = dir > 0 ? sib.nextSibling : sib.previousSibling) {
          if (sib.nodeType === 3) { const r = glyphRect(sib, dir); if (r) return r; continue; }
          if (sib.nodeType !== 1 || !vis(sib) || sib.matches("aside.notes, script, style")) continue;
          if (blockish(sib)) return null;
          const rs = sib.getClientRects(); if (rs.length) return dir > 0 ? rs[0] : rs[rs.length - 1];
        }
        cur = cur.parentElement;
        if (!cur || blockish(cur)) return null;
      }
      return null;
    };
    const tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = tw.nextNode())) {
      const pe = tn.parentElement;
      if (!pe || pe.closest(".katex, svg, aside.notes, script, style, .src") || !vis(pe)) continue;
      const t = tn.textContent;
      for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (!/[(\[{)\]}.,;:]/.test(ch)) continue;
        const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 1); const cr = r.getBoundingClientRect();
        if (!cr.height) continue;
        if (/[(\[{]/.test(ch)) { const nx = neighbour(tn, i, 1); if (nx && nx.top >= cr.bottom - 2) issues.push(`math: "${ch}" left alone at the end of a line ("${snip(t.slice(Math.max(0, i - 25), i + 1))}"); keep the parenthetical together with <span class="nowrap">`); }
        else { const pv = neighbour(tn, i, -1); if (pv && cr.top >= pv.bottom - 2) issues.push(`math: "${ch}" pushed to the start of a line ("${snip(t.slice(i, i + 25))}"); put punctuation inside the math or use <span class="nowrap">`); }
      }
    }
    // smallmatrix and shrunken math in the source TeX
    s.querySelectorAll(".katex annotation").forEach((a) => {
      if (/\\begin\{smallmatrix\}|\\scriptsize|\\tiny|\\footnotesize|\\small\b|\\scriptstyle/.test(a.textContent) && !a.closest("[data-small-ok]"))
        issues.push(`math: shrunken math (smallmatrix/\\scriptsize/\\scriptstyle) in "${snip(a.textContent).slice(0, 40)}": use full-size bmatrix columns as the notes do`);
    });
    // tiny math glyphs
    const tinyMath = new Set();
    s.querySelectorAll(".katex-html").forEach((kh) => {
      if (!vis(kh)) return;
      kh.querySelectorAll("span").forEach((sp) => {
        if (sp.closest(".vlist-s") || !ownText(sp).replace(/[\u200b-\u200d\ufeff]/g, "")) return;
        const fz = px(parseFloat(getComputedStyle(sp).fontSize) * scale);
        if (fz < 14) { const a = kh.parentElement.querySelector("annotation"); tinyMath.add(snip(a ? a.textContent : kh.textContent).slice(0, 40)); }
      });
    });
    tinyMath.forEach((t) => issues.push(`math: glyphs under 14px in "${t}" (math set below 20px, or nested scripts; enlarge it)`));

    // ---- text sizes (fonts are in canvas px; Reveal scales the whole canvas)
    const small = [];
    s.querySelectorAll("*").forEach((el) => {
      if (el.closest(".katex, aside.notes, svg, script, style") || !ownText(el) || !vis(el)) return;
      const fz = parseFloat(getComputedStyle(el).fontSize);
      const chromeEl = el.closest(".src");
      if ((chromeEl && fz < 18) || (!chromeEl && fz < 22)) small.push(`${fz}px "${snip(ownText(el)).slice(0, 30)}"`);
    });
    // inline math broken across two lines (KaTeX breaks after top-level = + x ...)
    s.querySelectorAll(".katex").forEach((k) => {
      if (k.closest(".katex-display") || k.parentElement.closest(".katex") || !vis(k)) return;
      const bases = [...k.querySelectorAll(":scope > .katex-html > .base")];
      if (bases.length < 2) return;
      const tops = bases.map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
      if (tops.some((r) => r.top >= tops[0].bottom - 2)) {
        const a = k.querySelector("annotation");
        issues.push(`math: inline math "${snip(a ? a.textContent : k.textContent).slice(0, 40)}" breaks across lines (give it room, or white-space: nowrap)`);
      }
    });
    // a formula left alone on the last line of a note or paragraph ("= line of equation" / "y = -x")
    s.querySelectorAll("p, li, figcaption, .ann-note, .hw-block, .cap, .box > div").forEach((blk) => {
      if (!vis(blk) || blk.closest("[data-widow-ok]")) return;
      const parts = [];
      const walk = (node) => {
        for (const c of node.childNodes) {
          if (c.nodeType === 3) { if (c.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(c); [...r.getClientRects()].forEach((q) => q.width > 1 && parts.push({ math: false, r: q, t: c.textContent })); } }
          else if (c.nodeType === 1 && vis(c)) {
            if (c.classList.contains("katex-display") || /^(block|flex|grid|list-item)$/.test(getComputedStyle(c).display)) continue;
            if (c.classList.contains("katex")) { const kh = c.querySelector(".katex-html"); if (kh) [...kh.getClientRects()].forEach((q) => parts.push({ math: true, r: q })); }
            else if (!c.classList.contains("ink-label")) walk(c);
          }
        }
      };
      walk(blk);
      if (parts.length < 2) return;
      const lines = [];
      parts.sort((a, b) => a.r.top - b.r.top).forEach((pt) => {
        const ln = lines.find((l) => pt.r.top < l.bottom - 4 && pt.r.bottom > l.top + 4);
        if (ln) { ln.items.push(pt); ln.top = Math.min(ln.top, pt.r.top); ln.bottom = Math.max(ln.bottom, pt.r.bottom); }
        else lines.push({ top: pt.r.top, bottom: pt.r.bottom, items: [pt] });
      });
      if (lines.length < 2) return;
      const last = lines[lines.length - 1].items;
      const words = last.filter((x) => !x.math).map((x) => x.t).join(" ").replace(/[.,;:)\]\s]/g, "");
      const prev = lines[lines.length - 2].items;
      if (last.some((x) => x.math) && !words && prev.some((x) => !x.math))
        issues.push(`math: a formula is left alone on the last line of "${snip(blk.textContent).slice(0, 40)}" (keep it with the words before it in a .nowrap span, or break the line earlier)`);
    });
    // underlines running into the line below (a radical bar, a fraction, a box)
    s.querySelectorAll("[class*='ul-'], [class*='ul2-']").forEach((u) => {
      if (u.closest(".katex") || !vis(u)) return;
      const blk = u.closest("p, li, .ann-note, .hw-block, .box, figcaption") || u.parentElement;
      [...u.getClientRects()].forEach((ur) => {
        const y = ur.bottom;
        const hit = [...blk.querySelectorAll(".katex-html, [class*='box-'], [class*='circ-']")].find((k) => !u.contains(k) && !k.contains(u) && [...k.getClientRects()].some((kr) =>
          kr.top < y + 2 && kr.top > ur.top + ur.height * 0.6 && kr.left < ur.right && kr.right > ur.left));
        if (hit) issues.push(`text: the underline under "${snip(u.textContent).slice(0, 30)}" runs into the line below (more line-height, or move the formula to its own line)`);
      });
    });
    // matrices stretched by wide labels in another row (narrow entries, huge gaps)
    s.querySelectorAll(".katex .mtable").forEach((mt) => {
      if (!vis(mt) || mt.closest("[data-stretch-ok]")) return;
      const cols = [...mt.children].filter((c) => /col-align/.test(c.className));
      if (cols.length < 2) return;
      const glyphs = (sp) => {                       // extent of the cell's visible glyphs, not its padded box
        const tw = document.createTreeWalker(sp, NodeFilter.SHOW_TEXT); let n, l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
        while ((n = tw.nextNode())) { if (!n.textContent.replace(/[\u200b\s]/g, "")) continue; const rg = document.createRange(); rg.selectNodeContents(n);
          for (const q of rg.getClientRects()) if (q.width > 0) { l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom); } }
        return l < r ? { left: l, right: r, width: r - l, top: t, bottom: b } : { width: 0 };
      };
      const cells = cols.map((c) => [...c.querySelectorAll(":scope > .vlist-t > .vlist-r > .vlist > span")].map(glyphs));
      const fz = parseFloat(getComputedStyle(mt).fontSize) * scale;
      const nrows = Math.min(...cells.map((c) => c.length));
      for (let r = 0; r < nrows; r++) {
        const row = cells.map((c) => c[r]).filter((q) => q && q.width > 0);
        if (row.length < 2 || row.some((q) => q.width > 1.6 * fz)) continue;
        const gaps = row.slice(1).map((q, i) => q.left - row[i].right);
        if (Math.min(...gaps) > 2.2 * fz) {
          const a = mt.closest(".katex").querySelector("annotation");
          issues.push(`math: matrix columns stretched far apart in "${snip(a ? a.textContent : "").slice(0, 40)}" (labels under the columns widen them: colour-code the columns and set the labels on their own line, or wrap each label in \\mathclap)`);
          break;
        }
      }
    });

    // short labels (a matrix shape, a tag) must not wrap onto two lines
    s.querySelectorAll("*").forEach((el) => {
      if (el.closest(".katex, aside.notes, svg, script, style") || !vis(el)) return;
      const t = el.textContent.trim();
      if (!t || t.length > 14 || el.children.length > 3 || !/^(inline|inline-block|block|flex|grid|table-cell)$/.test(getComputedStyle(el).display)) return;
      if (el.querySelector("br, .katex, div, p, li") || el.closest("td, th")) return;
      const r = document.createRange(); r.selectNodeContents(el);
      const tops = new Set([...r.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 4)));
      if (tops.size > 1 && [...r.getClientRects()].every((q) => q.height < 60)) issues.push(`text: short label "${snip(t)}" wraps onto two lines (widen its box or add white-space: nowrap)`);
    });
    if (small.length) issues.push(`text: ${small.length} element(s) under 22px: ${small.slice(0, 4).join("; ")}${small.length > 4 ? " ..." : ""}`);
    s.querySelectorAll("svg text").forEach((t) => {
      if (!vis(t) || !t.textContent.trim()) return;
      const ctm = t.getScreenCTM(); if (!ctm) return;
      const fz = px(parseFloat(getComputedStyle(t).fontSize) * Math.hypot(ctm.a, ctm.b));
      if (fz < 18) small.push(`svg ${Math.round(fz)}px "${snip(t.textContent)}"`) && issues.push(`text: SVG label "${snip(t.textContent)}" renders at ${Math.round(fz)}px (min 18px)`);
    });

    // ---- figures: label collisions, small images, accessibility
    s.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) issues.push(`figures: broken image ${String(img.getAttribute("src")).slice(0, 50)}`);
      if (!img.getAttribute("alt")) issues.push("figures: image without alt text");
      if (!vis(img) || img.closest("[data-small-ok]")) return;
      const b = img.getBoundingClientRect();
      if (px(b.height) < 200 && px(b.width) < 320) issues.push(`figures: image shown at ${Math.round(px(b.width))}x${Math.round(px(b.height))}px, too small to read on a projector (give it its own slide or more room)`);
    });
    s.querySelectorAll("figure svg, .plot svg, .box svg, svg[role]").forEach((svg) => {
      if (!svg.getAttribute("role") || !(svg.getAttribute("aria-label") || svg.querySelector("title"))) issues.push("figures: SVG without role=\"img\" and aria-label");
    });
    const figs = [...s.querySelectorAll("figure, .plot, .fig")].filter((f) => vis(f) && !f.parentElement.closest("figure, .plot, .fig"));
    const shrink = (r, f) => ({ left: r.left + r.width * f, right: r.right - r.width * f, top: r.top + r.height * f, bottom: r.bottom - r.height * f });
    figs.forEach((fig) => {
      const labels = [];
      fig.querySelectorAll("svg text").forEach((t) => { if (vis(t) && t.textContent.trim() && !t.closest("[data-overlap-ok]")) labels.push([snip(t.textContent), t.getBoundingClientRect()]); });
      fig.querySelectorAll("*").forEach((e) => {
        if (e.closest("svg, figcaption, [data-overlap-ok]") || !vis(e)) return;
        if (e.classList.contains("katex") && !e.parentElement.closest(".katex")) labels.push([snip(e.querySelector("annotation") ? e.querySelector("annotation").textContent : e.textContent), e.getBoundingClientRect()]);
        else if (!e.closest(".katex") && ownText(e) && getComputedStyle(e).position === "absolute") labels.push([snip(ownText(e)), e.getBoundingClientRect()]);
      });
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i][1], b = labels[j][1];
        if (a.width * a.height === 0 || b.width * b.height === 0) continue;
        const gx = Math.max(a.left, b.left) - Math.min(a.right, b.right);   // >0: horizontal gap, <0: overlap
        const gy = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
        const mh = Math.min(a.height, b.height), mw = Math.min(a.width, b.width);
        if ((gx < 3 && gy < -0.4 * mh) || (gy < 1 && gx < -0.4 * mw)) issues.push(`figures: labels overlap or touch: "${labels[i][0]}" and "${labels[j][0]}"`);
      }
      const strokes = [...fig.querySelectorAll("svg line, svg path, svg polyline, svg polygon")].filter((g) => {
        if (g.closest("defs, marker, clipPath, [data-overlap-ok]") || !vis(g)) return false;
        const cs = getComputedStyle(g);
        if (cs.stroke === "none" || parseFloat(cs.strokeWidth) < 0.8 || parseFloat(cs.strokeOpacity) < 0.5) return false;
        const m = cs.stroke.match(/\d+(\.\d+)?/g); if (!m) return false;
        const [r, gg, b] = m.map(Number); const light = (Math.max(r, gg, b) + Math.min(r, gg, b)) / 510;
        return light < 0.82;                                   // faint grid lines may run under labels
      });
      const crossed = new Set();
      strokes.forEach((g) => {
        let len = 0; try { len = g.getTotalLength(); } catch (e) { return; }
        const ctm = g.getScreenCTM(); if (!ctm || !len) return;
        const k = Math.hypot(ctm.a, ctm.b) || 1, step = Math.max(0.5, 2 / k);
        const pt = g.ownerSVGElement.createSVGPoint();
        for (let d = 0; d <= len; d += step) {
          const p = g.getPointAtLength(d); pt.x = p.x; pt.y = p.y; const q = pt.matrixTransform(ctm);
          for (const [name, r] of labels) {
            const c = shrink(r, 0.22);
            if (q.x > c.left && q.x < c.right && q.y > c.top && q.y < c.bottom) crossed.add(name);
          }
        }
      });
      crossed.forEach((name) => issues.push(`figures: label "${name}" is crossed by a drawn line or arrow`));
      // strokes must not run into the caption under the figure either
      fig.querySelectorAll("figcaption").forEach((fc) => {
        if (!vis(fc)) return;
        const c = shrink(fc.getBoundingClientRect(), 0.05);
        const hit = strokes.some((g) => {
          let len = 0; try { len = g.getTotalLength(); } catch (e) { return false; }
          const ctm = g.getScreenCTM(); if (!ctm || !len) return false;
          const pt = g.ownerSVGElement.createSVGPoint(), step = Math.max(0.5, 2 / (Math.hypot(ctm.a, ctm.b) || 1));
          for (let d = 0; d <= len; d += step) { const p = g.getPointAtLength(d); pt.x = p.x; pt.y = p.y; const q = pt.matrixTransform(ctm); if (q.x > c.left && q.x < c.right && q.y > c.top && q.y < c.bottom) return true; }
          return false;
        });
        if (hit) issues.push(`figures: a drawn line runs into the caption "${snip(fc.textContent)}" (keep strokes inside the plot)`);
      });
    });

    // ---- captions that describe the ink in words instead of showing it
    s.querySelectorAll("figcaption, .cap, p").forEach((c) => {
      if (!vis(c) || c.closest("[data-noann-ok], .ann-note, .hw-block")) return;
      const t = c.textContent;
      if (/\b(magenta|pink|blue|red|green|navy|yellow|orange|purple)\b/i.test(t) && /\b(ink|pen|instructor|in the notes|handwrit|drawn|written|highlight)/i.test(t))
        issues.push(`clutter: caption describes the pen colours in words: "${snip(t)}" (show the marks; the ink labels already say what is handwritten)`);
    });

    // ---- density
    if (!s.closest("[data-dense-ok]") && !s.hasAttribute("data-dense-ok")) {
      let words = 0;
      const w2 = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      let m;
      while ((m = w2.nextNode())) {
        const pe = m.parentElement;
        if (!pe || pe.closest(".katex, aside.notes, .src, h1, h2, svg, script, style") || !vis(pe)) continue;
        words += (m.textContent.match(/[A-Za-z]{2,}/g) || []).length;
      }
      const disp = [...s.querySelectorAll(".katex-display")].filter(vis).length;
      if (words > 75 || words + 12 * disp >= 85) issues.push(`density: ${words} words of prose and ${disp} display equations on one slide (split it; aim for under 45 words next to one display block)`);
    }

    // ---- ink must look like ink, and every annotation item must live in the ink layer
    const INK = ".ann, .hw, .hw-block, .ann-note, [class*='hl-'], [class*='ul-'], [class*='circ-'], [class*='box-']";
    [...s.querySelectorAll("[data-inv]")].concat(s.hasAttribute("data-inv") ? [s] : []).forEach((el) => {
      const ids = el.getAttribute("data-inv").split(/\s+/).filter((id) => annIds.has(id));
      if (!ids.length || el.matches(INK) || el.closest(INK) || el.querySelector(INK)) return;
      issues.push(`ink: annotation item(s) ${ids.join(", ")} rendered as printed content: put the instructor's material in the ink layer (.hw / .hw-block / .ann-note / emphasis class, in the ink colour)`);
    });
    s.querySelectorAll(".hw, .ann-note, .hw-block").forEach((el) => {
      if (!vis(el)) return;
      const bad = [el, ...el.querySelectorAll("*")].find((e) => !e.closest(".ann-fix, figure, .label, .ink-label") && ownText(e) && getComputedStyle(e).color === bodyInk);
      if (bad) issues.push(`ink: instructor material in the body text colour: "${snip(ownText(bad))}" (use the ink colour from the PDF)`);
    });
  } else {
    // ---- annotations hidden: nothing from the ink layer may remain
    s.querySelectorAll(".ann, .hw").forEach((el) => { if (vis(el)) issues.push(`ann-off: ink-layer element still visible: "${snip(el.textContent) || el.tagName}"`); });
    s.querySelectorAll("*").forEach((el) => {
      if (el.closest("aside.notes, script, style, [data-noann-ok]") || !vis(el)) return;
      const t = ownText(el);
      if (t && inkRgb.has(getComputedStyle(el).color)) issues.push(`ann-off: text in an ink colour still visible: "${snip(t)}"`);
      if (t && /\binstructor|handwrit|\bink\b|in class\b|\bpen\b/i.test(t) && !el.closest("#ann-toggle")) issues.push(`ann-off: text about the ink still visible: "${snip(t)}" (give it class ann, or data-noann-ok)`);
    });
    s.querySelectorAll("figure.from-pdf, img[data-page]").forEach((f) => {
      if (vis(f) && !f.closest(".printed-only, [data-ink='none']")) issues.push("ann-off: PDF crop still visible: mark ink-bearing crops .ann (with a .printed-only twin) or the figure data-ink=\"none\"");
    });
  }

  let title = "(no heading)";
  const hd = s.querySelector("h1, h2");
  if (hd) {
    const c = hd.cloneNode(true);
    c.querySelectorAll(".katex").forEach((k) => { const tex = k.querySelector("annotation"); k.replaceWith(tex ? `$${tex.textContent}$` : k.textContent); });
    title = c.textContent;
  }
  const inv = [...s.querySelectorAll("[data-inv]")].concat(s.hasAttribute("data-inv") ? [s] : [])
    .filter((e) => vis(e) || e.closest(".fragment") || e.querySelector(".fragment"))
    .flatMap((e) => e.getAttribute("data-inv").split(/\s+/)).filter(Boolean);
  const tex = [...s.querySelectorAll(".katex annotation")].filter((a) => !a.closest(".katex .katex")).map((a) => a.textContent.trim());
  const pages = [...new Set([...s.querySelectorAll(".src, figure.from-pdf[data-page]")].flatMap((e) => {
    const t = e.getAttribute("data-page") || e.textContent;
    const out = [];
    (t.match(/\d+\s*[–-]\s*\d+|\d+/g) || []).forEach((m) => { const [a, b] = m.split(/\s*[–-]\s*/).map(Number); for (let i = a; i <= (b || a); i++) out.push(i); });
    return out;
  }))];
  return { issues: [...new Set(issues)], title: title.trim().replace(/\s+/g, " ").slice(0, 70), inv, tex, pages };
}

async function contactSheets(browser, files, prefix) {
  const per = 12;
  for (let i = 0; i < files.length; i += per) {
    const group = files.slice(i, i + per);
    const html = `<!doctype html><html><body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(4,320px);gap:6px;padding:6px;width:max-content">${
      group.map((f, j) => `<div style="position:relative"><img src="file://${f}" style="width:320px;height:180px;display:block;background:#fff"><span style="position:absolute;left:4px;top:2px;font:bold 14px sans-serif;background:#000;color:#fff;padding:0 4px">${i + j + 1}</span></div>`).join("")
    }</body></html>`;
    const sheet = path.join(out, `_${prefix}-${i / per + 1}.html`);
    fs.writeFileSync(sheet, html);
    const p2 = await browser.newPage({ viewport: { width: 1310, height: 600 } });
    await p2.goto("file://" + sheet, { waitUntil: "load" });
    await p2.screenshot({ path: path.join(out, `${prefix}-${i / per + 1}.png`), fullPage: true });
    await p2.close();
    fs.unlinkSync(sheet);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors = [], failedRequests = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("requestfailed", (r) => failedRequests.push(`${r.url().slice(0, 100)} (${r.failure() && r.failure().errorText})`));

  await page.addInitScript(() => { try { localStorage.setItem("deck-ann", "1"); } catch (e) {} });
  await page.goto("file://" + deck, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.Reveal && Reveal.isReady && Reveal.isReady(), null, { timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.evaluate(() => Reveal.configure({ transition: "none", backgroundTransition: "none" }));
  const slides = await page.evaluate(() => Reveal.getSlides().map((s) => { const i = Reveal.getIndices(s); return { h: i.h, v: i.v || 0 }; }));

  // annotation items (instructor ink) from the inventory, to check they render in the ink layer
  let annIds = [];
  if (inventoryPath) {
    const inv0 = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
    annIds = (Array.isArray(inv0) ? inv0 : inv0.items)
      .filter((it) => it.source === "annotation" && it.disposition !== "ignored" && !/^(stray|separator|structural)$/.test(it.kind || ""))
      .map((it) => it.id);
  }
  const problems = new Map();
  const add = (k, title, list) => { if (!list.length) return; const p = problems.get(k) || { title, issues: [] }; p.issues.push(...list); problems.set(k, p); };
  const shotsOn = [], shotsOff = [];
  for (const mode of ["on", "off"]) {
    await page.evaluate((m) => document.body.classList.toggle("no-ann", m === "off"), mode);
    for (let k = 0; k < slides.length; k++) {
      const { h, v } = slides[k];
      await page.evaluate(([h, v]) => { Reveal.slide(h, v); Reveal.getCurrentSlide().querySelectorAll(".fragment").forEach((f) => f.classList.add("visible")); }, [h, v]);
      await page.waitForTimeout(mode === "on" ? 300 : 120);
      const r = await page.evaluate(inspectSlide, { mode, annIds });
      const file = path.join(out, `${mode === "on" ? "slide" : "noann"}-${String(k + 1).padStart(3, "0")}.png`);
      await page.screenshot({ path: file });
      (mode === "on" ? shotsOn : shotsOff).push(file);
      if (mode === "on") { slides[k].title = r.title; slides[k].inv = r.inv; slides[k].tex = r.tex; slides[k].pages = r.pages; }
      add(k + 1, slides[k].title, r.issues);
    }
  }
  const annCount = await page.evaluate(() => document.querySelectorAll(".ann, .hw").length);
  await page.evaluate(() => document.body.classList.remove("no-ann"));
  await contactSheets(browser, shotsOn, "contact");
  await contactSheets(browser, shotsOff, "noann-contact");

  // every formula, slide by slide, for checking entries against the notes
  fs.writeFileSync(path.join(out, "tex-by-slide.txt"), slides.map((s, i) =>
    `== slide ${i + 1}: ${s.title}  (notes p. ${(s.pages || []).join(", ") || "?"})\n` + (s.tex || []).map((t) => "  " + t.replace(/\s+/g, " ")).join("\n")).join("\n\n") + "\n");

  // page-vs-slides sheets: each PDF page next to every slide that cites it
  if (pagesDir) {
    const pngs = fs.readdirSync(pagesDir).filter((f) => /^page-\d+\.png$/.test(f)).sort();
    for (const f of pngs) {
      const n = parseInt(f.match(/\d+/)[0], 10);
      const idx = slides.map((s, i) => ((s.pages || []).includes(n) ? i : -1)).filter((i) => i >= 0);
      const html = `<!doctype html><html><body style="margin:0;background:#888;display:flex;gap:8px;padding:8px;width:max-content;align-items:flex-start">
        <img src="file://${path.join(pagesDir, f)}" style="height:1500px;background:#fff">
        <div style="display:grid;grid-template-columns:repeat(2,640px);gap:8px">${idx.map((i) => `<div style="position:relative"><img src="file://${shotsOn[i]}" style="width:640px;height:360px;display:block"><span style="position:absolute;left:4px;top:2px;font:bold 18px sans-serif;background:#000;color:#fff;padding:0 6px">${i + 1}</span></div>`).join("") || '<div style="font:24px sans-serif;color:#fff;padding:20px">no slide cites this page</div>'}</div></body></html>`;
      const sheet = path.join(out, `_cmp-${n}.html`);
      fs.writeFileSync(sheet, html);
      const p2 = await browser.newPage({ viewport: { width: 2400, height: 1516 } });
      await p2.goto("file://" + sheet, { waitUntil: "load" });
      await p2.screenshot({ path: path.join(out, `compare-p${String(n).padStart(2, "0")}.png`), fullPage: true });
      await p2.close();
      fs.unlinkSync(sheet);
      if (!idx.length) add(0, "(deck)", [`coverage: no slide cites notes p. ${n} in its source tag`]);
    }
  }

  // ---- coverage against the inventory, and ink regions
  let coverage = null, regionReport = null;
  if (inventoryPath) {
    const inv = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
    const items = Array.isArray(inv) ? inv : inv.items;
    const wanted = items.filter((it) => it.disposition !== "ignored").map((it) => it.id);
    const present = new Set(slides.flatMap((s) => s.inv));
    const known = new Set(items.map((it) => it.id));
    const dup = items.map((it) => it.id).filter((id, i, a) => a.indexOf(id) !== i);
    coverage = {
      total: wanted.length,
      missing: wanted.filter((id) => !present.has(id)),
      unknown: [...present].filter((id) => !known.has(id)),
      dup: [...new Set(dup)],
      ignored: items.filter((it) => it.disposition === "ignored").map((it) => `${it.id}: ${it.reason || "NO REASON GIVEN"}`),
      noReason: items.filter((it) => it.disposition === "ignored" && !it.reason).map((it) => it.id),
    };
    if (regionsPath) {
      const reg = JSON.parse(fs.readFileSync(regionsPath, "utf8"));
      const all = Object.values(reg.pages).flatMap((p) => p.regions.map((r) => r.id));
      const claimed = new Set(items.flatMap((it) => it.regions || []));
      regionReport = { total: all.length, unclaimed: all.filter((id) => !claimed.has(id)), bogus: [...claimed].filter((id) => !all.includes(id)) };
    }
  }

  // ---- report
  console.log(`Deck: ${deck}`);
  console.log(`Slides: ${slides.length}   screenshots + contact sheets (annotations on and off): ${out}`);
  console.log("\nOutline:");
  slides.forEach((s, i) => console.log(`  ${String(i + 1).padStart(3)}  ${s.title}${s.inv.length ? "   [" + s.inv.join(" ") + "]" : ""}`));
  console.log(`\nAnnotation layer: ${annCount} .ann/.hw elements`);
  if (coverage) {
    console.log(`\nCoverage: ${coverage.total - coverage.missing.length}/${coverage.total} inventory items placed`);
    if (coverage.missing.length) console.log("  MISSING: " + coverage.missing.join(", "));
    if (coverage.unknown.length) console.log("  data-inv ids not in inventory: " + coverage.unknown.join(", "));
    if (coverage.dup.length) console.log("  duplicate inventory ids: " + coverage.dup.join(", "));
    if (coverage.ignored.length) console.log("  ignored on purpose:\n    " + coverage.ignored.join("\n    "));
  }
  if (regionReport) {
    console.log(`\nInk regions: ${regionReport.total - regionReport.unclaimed.length}/${regionReport.total} claimed by inventory items`);
    if (regionReport.unclaimed.length) console.log("  UNCLAIMED (open ink/page-NN-map.png, find each mark, add it to an item's \"regions\" or to a stray item): " + regionReport.unclaimed.join(", "));
    if (regionReport.bogus.length) console.log("  region ids in the inventory that do not exist: " + regionReport.bogus.join(", "));
  }
  if (problems.size) {
    console.log("\nSlide problems:");
    [...problems.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, p]) => console.log(`  slide ${k} (${p.title}):\n    - ` + [...new Set(p.issues)].join("\n    - ")));
  }
  if (consoleErrors.length) console.log("\nConsole errors:\n  " + [...new Set(consoleErrors)].join("\n  "));
  if (failedRequests.length) console.log("\nFailed requests:\n  " + [...new Set(failedRequests)].join("\n  "));
  const counts = {};
  [...problems.values()].forEach((p) => p.issues.forEach((i) => { const c = i.split(":")[0]; counts[c] = (counts[c] || 0) + 1; }));
  if (Object.keys(counts).length) console.log("\nBy kind: " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));

  const bad = problems.size || consoleErrors.length || failedRequests.length ||
    (coverage && (coverage.missing.length || coverage.unknown.length || coverage.dup.length || coverage.noReason.length)) ||
    (regionReport && (regionReport.unclaimed.length || regionReport.bogus.length));
  console.log(bad ? "\nRESULT: problems found" : "\nRESULT: clean");
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
