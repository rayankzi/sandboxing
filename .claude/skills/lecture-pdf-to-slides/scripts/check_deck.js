#!/usr/bin/env node
/*
 * Render-and-inspect check for a reveal.js lecture deck built with this skill.
 *
 * Usage:
 *   node check_deck.js DECK.html OUT_DIR [--inventory inventory.json] [--no-ann-pass]
 *
 * What it does
 *   - opens the deck in headless Chromium at 1280x720
 *   - visits every slide with all fragments shown, screenshots it to
 *     OUT_DIR/slide-NNN.png, and writes contact sheets (12 slides per image)
 *     to OUT_DIR/contact-N.png so you can review the whole deck quickly
 *   - reports, per slide: content overflowing the 1280x720 canvas, KaTeX
 *     errors, math left untypeset (raw \( \[ $$ in the text), broken images,
 *     and text smaller than 16px
 *   - reports console errors and failed network requests
 *   - with --inventory: compares the ids in inventory.json with the data-inv
 *     attributes in the deck and lists anything missing or unknown
 *   - also screenshots slide 1..N once with the annotation layer hidden to
 *     prove the toggle works (skip with --no-ann-pass)
 *
 * Exit code 0 = no problems found, 1 = problems found (details printed).
 * Uses the preinstalled Playwright: require('playwright') works anywhere.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("usage: node check_deck.js DECK.html OUT_DIR [--inventory inventory.json] [--no-ann-pass]");
  process.exit(2);
}
const deck = path.resolve(args[0]);
const out = path.resolve(args[1]);
const invIdx = args.indexOf("--inventory");
const inventoryPath = invIdx >= 0 ? path.resolve(args[invIdx + 1]) : null;
const annPass = !args.includes("--no-ann-pass");
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("requestfailed", (r) => failedRequests.push(`${r.url()} (${r.failure() && r.failure().errorText})`));

  await page.goto("file://" + deck, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.Reveal && Reveal.isReady && Reveal.isReady(), null, { timeout: 30000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // no transitions while checking, so screenshots never catch a half-faded slide
  await page.evaluate(() => Reveal.configure({ transition: "none", backgroundTransition: "none" }));

  const slides = await page.evaluate(() =>
    Reveal.getSlides().map((s) => { const i = Reveal.getIndices(s); return { h: i.h, v: i.v || 0 }; }));

  const problems = [];
  const shots = [];
  for (let k = 0; k < slides.length; k++) {
    const { h, v } = slides[k];
    await page.evaluate(([h, v]) => {
      Reveal.slide(h, v);
      // reveal every fragment so the check sees the slide in its final state
      Reveal.getCurrentSlide().querySelectorAll(".fragment").forEach((f) => f.classList.add("visible"));
    }, [h, v]);
    await page.waitForTimeout(350);

    const r = await page.evaluate(() => {
      const s = Reveal.getCurrentSlide();
      const W = Reveal.getConfig().width, H = Reveal.getConfig().height;
      const scale = Reveal.getScale();
      const sb = s.getBoundingClientRect();
      const issues = [];
      // overflow: any visible descendant whose box leaves the slide canvas
      const tol = 2;
      let worst = 0, culprit = "";
      s.querySelectorAll("*").forEach((el) => {
        // .katex-mathml is KaTeX's visually-hidden accessibility copy; never on screen
        if (el.closest(".src, aside.notes, .katex-mathml")) return;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") return;
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        const over = Math.max((b.bottom - sb.top) / scale - H, (b.right - sb.left) / scale - W,
                              (sb.top - b.top) / scale, (sb.left - b.left) / scale);
        if (over > worst) {
          worst = over;
          const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
          const cls = typeof el.className === "string" && el.className ? ` class="${el.className.split(" ")[0]}"` : "";
          culprit = `<${el.tagName.toLowerCase()}${cls}> "${txt}"`;
        }
      });
      if (worst > tol) issues.push(`content overflows the 1280x720 canvas by ~${Math.round(worst)}px (worst: ${culprit})`);
      if (s.scrollHeight > H + tol) issues.push(`slide scrollHeight ${s.scrollHeight}px > ${H}px`);
      // horizontally scrolling display math is a sign the equation is too wide
      s.querySelectorAll(".katex-display").forEach((d) => {
        if (d.scrollWidth > d.clientWidth + tol) issues.push("display equation wider than its column (scrolls)");
      });
      const kerr = s.querySelectorAll(".katex-error");
      kerr.forEach((e) => issues.push(`KaTeX error: ${e.getAttribute("title") || e.textContent}`));
      // raw delimiters left in text nodes = math that never got typeset
      const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (n.parentElement.closest(".katex, script, style, aside.notes, svg")) continue;
        if (/\\\(|\\\)|\\\[|\\\]|\$\$|\\frac|\\begin\{|\\mathbf/.test(n.textContent))
          issues.push(`untypeset math: "${n.textContent.trim().slice(0, 60)}"`);
      }
      s.querySelectorAll("img").forEach((img) => {
        if (!img.complete || img.naturalWidth === 0) issues.push(`broken image: ${img.getAttribute("src").slice(0, 60)}`);
        if (!img.getAttribute("alt")) issues.push("image without alt text");
      });
      // tiny text (projected decks need >= 16px on the 1280-wide canvas)
      let tiny = 0;
      s.querySelectorAll("p, li, td, th, figcaption, span, div").forEach((el) => {
        if (el.closest(".katex, .src, svg")) return;
        if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) return;
        if (parseFloat(getComputedStyle(el).fontSize) < 16) tiny++;
      });
      if (tiny) issues.push(`${tiny} text element(s) under 16px`);
      let title = "(no heading)";
      const hd = s.querySelector("h1, h2");
      if (hd) {
        const c = hd.cloneNode(true);
        c.querySelectorAll(".katex").forEach((k) => {
          const tex = k.querySelector("annotation");
          k.replaceWith(tex ? `$${tex.textContent}$` : k.textContent);
        });
        title = c.textContent;
      }
      const inv = [...s.querySelectorAll("[data-inv]")].concat(s.hasAttribute("data-inv") ? [s] : [])
        .flatMap((e) => e.getAttribute("data-inv").split(/\s+/)).filter(Boolean);
      return { issues, title: title.trim().replace(/\s+/g, " ").slice(0, 70), inv };
    });

    const file = path.join(out, `slide-${String(k + 1).padStart(3, "0")}.png`);
    await page.screenshot({ path: file });
    shots.push(file);
    slides[k].title = r.title;
    slides[k].inv = r.inv;
    if (r.issues.length) problems.push({ slide: k + 1, title: r.title, issues: [...new Set(r.issues)] });
  }

  // Annotation toggle check: hide the layer and confirm .ann elements disappear.
  let annReport = "skipped";
  if (annPass) {
    annReport = await page.evaluate(() => {
      const total = document.querySelectorAll(".ann").length;
      document.body.classList.add("no-ann");
      const stillShown = [...document.querySelectorAll(".ann")].filter((e) => getComputedStyle(e).display !== "none").length;
      document.body.classList.remove("no-ann");
      return `${total} .ann elements; ${stillShown} still visible with the layer hidden`;
    });
  }

  // Contact sheets: 12 slides per sheet, 4 x 3 grid.
  const per = 12;
  for (let i = 0; i < shots.length; i += per) {
    const group = shots.slice(i, i + per);
    const html = `<!doctype html><html><body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(4,320px);gap:6px;padding:6px;width:max-content">${
      group.map((f, j) => `<div style="position:relative"><img src="file://${f}" style="width:320px;height:180px;display:block;background:#fff"><span style="position:absolute;left:4px;top:2px;font:bold 14px sans-serif;background:#000;color:#fff;padding:0 4px">${i + j + 1}</span></div>`).join("")
    }</body></html>`;
    const sheet = path.join(out, `_contact-${i / per + 1}.html`);
    fs.writeFileSync(sheet, html);
    const p2 = await browser.newPage({ viewport: { width: 1310, height: 600 } });
    await p2.goto("file://" + sheet, { waitUntil: "load" });
    await p2.screenshot({ path: path.join(out, `contact-${i / per + 1}.png`), fullPage: true });
    await p2.close();
    fs.unlinkSync(sheet);
  }

  // Coverage against the inventory.
  let coverage = null;
  if (inventoryPath) {
    const inv = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
    const items = Array.isArray(inv) ? inv : inv.items;
    const wanted = items.filter((it) => it.disposition !== "ignored").map((it) => it.id);
    const present = new Set(slides.flatMap((s) => s.inv));
    const known = new Set(items.map((it) => it.id));
    coverage = {
      total: wanted.length,
      missing: wanted.filter((id) => !present.has(id)),
      unknown: [...present].filter((id) => !known.has(id)),
      ignored: items.filter((it) => it.disposition === "ignored").map((it) => `${it.id}: ${it.reason || "no reason given"}`),
    };
  }

  // Report.
  console.log(`Deck: ${deck}`);
  console.log(`Slides: ${slides.length}   screenshots + contact sheets: ${out}`);
  console.log("\nOutline:");
  slides.forEach((s, i) => console.log(`  ${String(i + 1).padStart(3)}  ${s.title}${s.inv.length ? "   [" + s.inv.join(" ") + "]" : ""}`));
  console.log(`\nAnnotation toggle: ${annReport}`);
  if (coverage) {
    console.log(`\nCoverage: ${coverage.total - coverage.missing.length}/${coverage.total} inventory items placed`);
    if (coverage.missing.length) console.log("  MISSING: " + coverage.missing.join(", "));
    if (coverage.unknown.length) console.log("  data-inv ids not in inventory: " + coverage.unknown.join(", "));
    if (coverage.ignored.length) console.log("  ignored on purpose:\n    " + coverage.ignored.join("\n    "));
  }
  if (problems.length) {
    console.log("\nSlide problems:");
    problems.forEach((p) => console.log(`  slide ${p.slide} (${p.title}):\n    - ` + p.issues.join("\n    - ")));
  }
  if (consoleErrors.length) console.log("\nConsole errors:\n  " + [...new Set(consoleErrors)].join("\n  "));
  if (failedRequests.length) console.log("\nFailed requests:\n  " + [...new Set(failedRequests)].join("\n  "));

  const annBad = annPass && !/; 0 still visible/.test(annReport);
  const bad = problems.length || consoleErrors.length || failedRequests.length || annBad ||
    (coverage && (coverage.missing.length || coverage.unknown.length));
  console.log(bad ? "\nRESULT: problems found" : "\nRESULT: clean");
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
