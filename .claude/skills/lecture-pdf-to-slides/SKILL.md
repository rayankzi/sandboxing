---
name: lecture-pdf-to-slides
description: Turn a set of lecture notes in PDF form, including handwritten instructor annotations, into a polished single-file HTML slide deck (reveal.js + KaTeX). Every definition, theorem, property, proof, note, remark, example, solution and annotation is carried over, organised as lecture slides (definition → visual → examples), with figures cropped from the PDF or drawn as custom SVG. Use when the user asks to turn lecture notes, course notes, a textbook section or an annotated PDF into slides, a presentation or an HTML deck.
---

# Lecture PDF → HTML slide deck

You are turning one set of lecture notes into a presentation an instructor
could teach from tomorrow and a student could study from tonight. The deck
must be complete and correct, and it should look designed. These three goals
rank in that order: a beautiful deck that drops a remark or copies a wrong
number has failed.

**Output:** one self-contained `.html` file (reveal.js 5.1.0 and KaTeX 0.16.11
from jsDelivr, Google Fonts, every image embedded as a data URI). Name it
`<pdf-stem>-slides.html` and save it where the user asked, or in the current
working directory. Keep working files (page renders, inventory, screenshots)
in the scratchpad or a `work/` folder next to the deck, not in the repository.

**Skill files**
- `scripts/prepare_pdf.py`: renders pages, 2x zoom bands, text layer, embedded images, and runs `separate_ink.py`
- `scripts/separate_ink.py`: splits the instructor's ink from the print: printed-only pages, ink-only pages, and a numbered map of every ink region
- `scripts/crop.py`: crops a page region (fractional coordinates); `--pair` also cuts the printed-only twin and reports whether the crop holds ink
- `scripts/linalg_check.py`: exact-fraction RREF, rank, nullity, bases, consistency and dependency relations
- `scripts/check_deck.js`: renders every slide with annotations on and off and flags layout, math, text-size, figure, density and ink-layer problems; checks coverage against the inventory and the ink map
- `references/deck-template.html`: the starting point, with theme, components, KaTeX macros, annotation layer and toggle
- `references/annotation-guide.md`: how to read ink, how to classify each mark, and exactly how each kind appears in the deck
- `references/review-brief.md`: the brief for the independent review in step 7

Before the first tool call, tell the user in one line what you are about to do.
At the end, give the short report described in step 8.

## Step 1: Prepare the PDF

```bash
python3 <skill>/scripts/prepare_pdf.py NOTES.pdf WORK/prep
```

This writes `pages/page-NN.png` (200 dpi), `zoom/page-NN-rK.png` (four
overlapping bands per page at 400 dpi), `text/page-NN.txt`, `manifest.json`,
and, from `separate_ink.py`:
- `printed/page-NN.png`: the page as printed, with the ink removed
- `ink/page-NN.png`: the ink alone
- `ink/page-NN-map.png`: the page with every ink region boxed and numbered (`r1`, `r2` …)
- `ink/regions.json`: each region's id (`p05-r3`), box, colour name and hex

Open two or three `printed/` pages next to the originals and confirm that only
the ink vanished. If the script says a page has no separable ink layer
(scanned notes, unusual layout), read that page's ink by eye. The rest of the
workflow still applies; only the map is missing there.

The text layer is good for copying typed wording exactly. It does not contain
handwriting and may contain garbled fragments of it, so never take ink content
from it.

## Step 2: Read everything, then build the inventory

Read every page before you plan a single slide: the full page, every zoom
band, and the ink map. Lecture notes are cumulative: a remark on page 7
changes how the definition on page 1 should be presented, and handwriting that
is unreadable at page scale is usually clear in a band. Read
`references/annotation-guide.md` now, before you classify any ink.

The printed-only page settles what was printed and what the instructor
wrote. A blank the template leaves ("dimension ____") is print; what fills it
is ink. Never decide this from memory of the page.

Record every item in `WORK/inventory.json`. This file is the contract for
completeness: `check_deck.js` fails the deck if any non-ignored item is
missing from it, if an annotation item is not rendered in the ink layer, or if
any ink region is unclaimed.

```json
{
  "source": "Section_3.6_template_with_annotations.pdf",
  "items": [
    {
      "id": "p01-def-row-col-space",
      "page": 1,
      "kind": "definition",
      "source": "typed",
      "title": "Row Space and Column Space",
      "content": "Let A be m×n. Row space = subspace of R^n spanned by rows; column space = subspace of R^m spanned by columns. 'In other words…' sentence.",
      "annotations": ["p01-ann-hl-rowspace"]
    },
    {
      "id": "p01-ann-hl-rowspace",
      "page": 1,
      "kind": "highlight",
      "source": "annotation",
      "ink": "yellow",
      "regions": ["p01-r2"],
      "target": "p01-def-row-col-space",
      "content": "'Row Space' highlighted"
    },
    {
      "id": "p10-ann-check-a4",
      "page": 10,
      "kind": "check",
      "source": "annotation",
      "ink": "magenta",
      "regions": ["p10-r5", "p10-r6"],
      "content": "Expanded check of a4 = -9/8 a1 - 1/2 a2",
      "correction": "Handwriting uses (-9,4,-3,4)^T (that is a5) as the left side; the correct a4 is (6,-3,-2,2)^T."
    },
    {
      "id": "p01-ann-stray-ticks",
      "page": 1,
      "kind": "stray",
      "source": "annotation",
      "regions": ["p01-r7"],
      "disposition": "ignored",
      "reason": "two tiny red ticks with no attached meaning"
    }
  ]
}
```

**What counts as an item.** If a student would miss it when it is gone, it is
an item. That always includes:
- section and subsection headings
- every Definition, Theorem, Property, Lemma and Corollary (one item each)
- every Proof
- every Note, Remark, callout box and "It follows that…" box
- every Example, with each part (a), (b), 1., 2., 3. as its own item
- every Solution, typed or handwritten, with each part as its own item
- every table, every summary box and every case (Case I, Case II …)
- every annotation mark, classified with the kinds in the annotation guide:
  each highlight, each underline (also those under a formula), each circle
  and box, each arrow and its label, each margin note, each filled-in blank,
  each handwritten step, check and sketch

IDs are `pNN-<kind>-<slug>`, unique, stable, and lower-case. Every ink item has
`"source": "annotation"` and lists the ink-map regions it covers in
`"regions"`. Keep `content` close to the source wording. You will typeset from
it, and the fidelity pass compares against it.

**Second sweep, with the map.** Open each `ink/page-NN-map.png` and walk the
numbered regions in order. Every region must belong to an item, or to a
`stray` item with a reason. One region can hold several items (a note and its
arrow), and one item can span several regions (a long underline broken in
two). Then check the typed side the same way: every box, every bold label and
every line of print on `printed/page-NN.png` maps to an item. A block at the
very bottom of a page, a one-line remark between two boxes, and a short
underline under a formula are the items that get lost.

## Step 3: Verify the mathematics

Recompute every computation in the notes, typed and handwritten: every RREF,
pivot set, basis, rank, nullity, dependency relation, particular solution and
check. For linear algebra:

```bash
python3 <skill>/scripts/linalg_check.py "[[1,4,0,4],[-3,-4,4,-2],[-2,0,4,2]]"
python3 <skill>/scripts/linalg_check.py "[[1,2],[2,4]]" --b "[4,8]" --combo "[[0,2],[4,0],[2,1]]"
```

For other subjects, write a short script with `fractions.Fraction` or exact
integer arithmetic. Also compare every typed matrix with every other place the
same object appears (a rotation matrix printed on p. 8 and again on p. 13
should agree). Record any slip in the item's `correction` field.
`references/annotation-guide.md` explains how to present corrections. The
short version: typeset the correct mathematics and add a visible `ann-fix`
line, so students comparing the deck with their notes can see why the two
differ.

A pen mark is not a symbol until the handwriting shows one. A tick after
"A =" is a stray, not "=:". When a mark could be either, zoom in, compare
with the printed-only page, and decide from the mathematics.

## Step 4: Plan the deck

Write `WORK/outline.md` before any HTML: slide by slide, with a title, a
purpose line, and the inventory ids each slide covers. Planning on paper is
much cheaper than rebuilding slides later.

**Order.** Follow the order of the notes. The instructor sequenced the
material deliberately, and students will flip between the deck and the PDF.
Add slides (intuition, visuals, recap) between source items. Do not reorder
the source items themselves.

**Lecture rhythm.** Each concept gets the arc a good lecturer uses:

1. **Definition, theorem or property**: the formal statement in its coloured
   box, on its own slide when it is long.
2. **Visual or intuition**: a picture or a one-sentence plain-language reading
   that makes the statement click. Add it whenever a picture helps (see
   "Visualizations" below). Skip it only when a picture would be filler.
3. **Proof**: on its own slide when it is longer than about four lines, with
   steps revealed as fragments.
4. **Examples**: the problem statement first, then the solution step by step
   with fragments, one reasoning step per fragment. Long solutions continue
   on "(cont.)" slides. Do not shrink the font to make them fit.
5. **Takeaway**: when the notes draw a conclusion ("Thus we cannot use the
   columns of U…"), give it a `box key` so it reads as the point of the
   example.

Start the deck with a title slide and a short roadmap slide that lists the
section's ideas. Mark each heading in the notes with a divider slide. End with
a summary slide that collects the definitions and theorems in compact form,
plus the notes' own summary material if the notes have it.

**Slide budget.** One idea per slide. Prose stays under about 45 words, next
to at most one large display block or one figure. A slide with a statement,
a correction and a computation is three slides. If a slide needs more, split
it. A dense slide is the most common way these decks fail on a projector, and
`check_deck.js` flags the worst cases.

**Annotations on the plan.** For each slide, note which ink items it carries
and how (see the annotation guide): emphasis, `ann-note`, filled-in blank,
`hw-block` solution or check, crop, or SVG redraw. Every ink item sits on the
slide whose content it comments on. When you split a slide, the notes, arrow
labels and checks move with the line they belong to. Never collect
annotations on an "annotations" slide at the end.

## Step 5: Build the HTML

Copy `references/deck-template.html` and replace all the sample slides. Keep
the CSS tokens, the components, the KaTeX setup and macros, and the
annotation toggle. Set the `--ann-*` ink tokens to the hex values that
`ink/regions.json` reports for each pen, so the deck's ink matches the notes.

**Components** (all defined in the template):
- `section.title-slide`, `section.divider`
- `.stack` > `h2.slide-title` + `.body` (the body centres sparse content vertically; `.body.top` aligns it to the top)
- `.box.definition`, `.box.theorem`, `.box.property`, `.box.note`, `.box.remark`, `.box.key`, each with a `<span class="label">`. Use the notes' own label text, e.g. "Theorem 3.6.2: Consistency Theorem for Linear Systems".
- `.proof` with `<span class="label">Proof.</span>` and a `.qed` mark
- `.example-label` / `.solution-label`, `.parts` lists for (a)/(b), `.blank` for a printed blank
- `.split` (text | figure), `figure`, `.plot` (SVG + KaTeX labels), `figure.from-pdf` with `data-page`, `.printed-only`
- `table.grid`
- the ink layer: `hl-*`, `ul-*`, `ul2-*`, `circ-*`, `box-*`, `.hw` + `.ink-*`, `.hw-block`, `.ann-note`, `.ann-fix`, and the math macros `\hly{}`, `\ulm{}`, `\bxr{}`, `\cim{}`, `\inkm{}` …
- `.src`: "notes p. N" on every content slide, so students can find the source page
- `.cap`: a caption line of your own; `.nowrap` to keep a short phrase on one line

**Coverage markers.** Put `data-inv="id1 id2"` on the element that renders
each inventory item: the box, the paragraph, the figure or the span. Every
non-ignored id must appear at least once. Do not use `data-src`; reveal.js
reserves it for lazy loading.

### The ink layer

Students must be able to tell, on every slide, what was printed and what the
instructor wrote. The annotation guide has the details. These rules hold for
every deck:

1. **Everything the instructor wrote is in the ink layer, in the pen's
   colour.** That includes worked solutions, filled-in blanks, column
   computations, final answers, checks, margin notes and sketches. Handwritten
   text and math use `.hw ink-magenta` (inline) or `.hw-block ink-magenta`
   (a passage with an `ink-label` such as "Instructor's solution"). Inside a
   formula use `\inkm{…}`. A handwritten solution is still taught step by step
   with fragments; being ink does not make it secondary.
2. **Emphasis lands on the same words, also under math.** Use `ul-*`/`hl-*`
   spans around text and math alike (they draw under KaTeX), or the macros
   inside a formula (`\ulm{L(\mathbf{x})}`, `\hly{…}`, `\bxr{…}`).
3. **`A` hides the whole layer.** With annotations off the deck shows exactly
   the printed notes: blanks stay blank, ink crops swap to their printed-only
   twins, SVG ink strokes (wrapped in `<g class="ann">`) disappear, and so do
   captions that talk about the ink. Give those captions class `ann`. A slide
   that is entirely handwritten shows a short `.printed-only` line such as
   "The notes leave this space for the solution worked in class (press A)"
   with `data-noann-ok`.
4. **Your own words are not ink.** Captions, intuition lines and takeaways you
   add use the body or `--ink-soft` colour, never an ink colour, and custom
   figures use the `--fig-*` tokens, never an `--ann-*` colour.

### Math

Typeset all mathematics with KaTeX: `\( … \)` inline, `\[ … \]` display,
inside a `<div class="eq">` and never inside `<p>`.
- Match the notation of the notes exactly: bold vectors `\mathbf{a}_1`, `N(A)`, `\mathbb{R}^m`, bracket matrices `bmatrix`, column vectors as full-size `bmatrix` columns. Never `smallmatrix` or `\scriptsize` to save space: split the line or the slide instead.
- Write fractions as `\tfrac` inside matrices and as `\frac` in display math. A matrix whose entries are all fractions gets room (`\\[4pt]` between rows) or, when the notes do so, the scalar factored out.
- Use `\begin{aligned}` for chains of `\iff` or `=` (for example the Theorem 3.6.2 proof and the Theorem 3.6.6 proof).
- Labels under terms (`\underset{L(\mathbf{e}_1)}{…}`) widen the term; wrap the label in `\mathclap{…}` so the spacing of the formula stays even.
- Never write math as Unicode or plain text (`x1`, `R^n`, `→`, `θ`, `²`, `45°`), not in prose, captions, tables or figure labels. The checker flags most of these.
- Put trailing punctuation inside the math, as in `\(L.\)`, so a period never wraps onto a line by itself. Keep a parenthetical together with `<span class="nowrap">(…)</span>`.
- Carry highlighted or circled entries into the matrix itself with the macros. A highlight around a whole matrix gets a thin space inside, `\hly{\,\begin{bmatrix}…\end{bmatrix}\,}`, so the brackets are not cramped.

**Fragments.** Use `class="fragment"` for solution steps, proof steps and the
reveal of an answer. Leave definitions and theorem statements fully visible.
Fragments only fade. There are no other animations.

**Speaker notes (optional, recommended).** `<aside class="notes">` can carry
what the instructor would say aloud: why a step works, or a common student
mistake the notes warn about. Never put source content only in speaker notes.
Notes do not count for coverage.

### Visualizations

Use both sources of figures.

1. **From the PDF.** For every instructor `sketch`, and every printed figure
   the instructor drew on, crop it with
   `scripts/crop.py pages/page-NN.png x0 y0 x1 y1 out.png --trim --pair --datauri`.
   Embed the annotated crop as `figure.from-pdf.ann` and its printed-only twin
   as `figure.from-pdf.printed-only` (same `data-page`, same framing). A crop
   that `--pair` reports as "ink: none" is printed-only: one figure with
   `data-ink="none"`, and its caption must not claim ink. Show every crop at a
   readable size, at least 240px tall on the canvas and never as a thumbnail.
   Put it on the slide it belongs to; if there is no room, give it the very
   next slide ("(cont.): the instructor's sketch"), not a gallery at the end.
2. **Custom-made.** Redraw every sketch as a clean, accurate inline SVG, and
   add new figures where a picture explains the idea better than text. In
   linear algebra that typically means:
   - span of one vector as a line, and of two independent vectors as a plane (an oblique 3D view is enough)
   - the column picture of A**x** = **b**: **b** reached as x₁**a**₁ + x₂**a**₂, as arrows tip to tail
   - side-by-side column spaces of A and its RREF U (the y-axis versus the x-axis)
   - RREF with pivot columns tinted, linked to the matching columns of A
   - the dependency relation as colour-coded columns (u₃ = ¼u₁ − u₂ next to a₃ = ¼a₁ − a₂)
   - rank + nullity = n as one bar of n columns, split into pivot and free columns
   - matrix-shape glyphs (tall and thin, short and wide, square) for the four-cases table

**Figure rules.** Every SVG must be mathematically accurate (a point labelled
(1, 2) sits at (1, 2) on the drawn axes). Compute coordinates in a script
rather than eyeballing them. Put math labels in a `.plot` as KaTeX `.pl`
spans positioned from the same data coordinates, at 24px; plain tick numbers
may be SVG text at 20px or more. Leave clear space around every label: no
label touches another label, an axis or an arrow, and tick labels at a shared
corner (the two "−1"s) are offset or one is dropped. Keep every stroke inside
the plot box so nothing runs into the caption. The instructor's strokes are in
the ink colours inside `<g class="ann">`, and everything else uses the
`--fig-*` tokens. Each SVG carries `role="img"` and an `aria-label`.

A small interactive figure is welcome when it teaches something a static one
cannot, for example a slider for α and β that moves α**a**₁ + β**a**₂ around
a plane. Keep it within the slide and make it work by keyboard.

### Design direction

The template is the design system. Keep its decisions unless the source PDF
uses a different colour code, in which case match the PDF:
- white page and near-black ink, for projector contrast
- crimson slide titles, matching the notes' section headings
- the box colours mirror the notes: lavender Definition, green
  Theorem/Property, yellow Note/Remark, peach "It follows" callout, blue
  EXAMPLE/Solution labels
- Source Sans 3 for headings and labels, Source Serif 4 for body text (it sits
  well next to KaTeX's Computer Modern), Caveat only for the small ink labels
  ("Instructor note", "Instructor's solution")
- 1280×720 canvas, generous margins, left-aligned text, one strong focal
  element per slide
- **every piece of text a viewer reads is at least 22px**: body, captions,
  `ann-fix` lines, table cells and KaTeX figure labels. Only the source tag
  and the slide number are smaller (20px). Do not shrink text to fit; split.
- the chrome stays out of the way: navigation arrows at the side edges, the
  slide number in the bottom-right corner, the source tag to its left, the
  toggle bottom-left. Do not move them or put content in those corners.

Avoid these patterns. Each one is a default that makes a deck look generic or
reads badly in a lecture hall:
- cream, beige or off-white backgrounds, dark-mode-only decks, and full-bleed gradient backgrounds
- gradient text, glassmorphism, drop-shadow-heavy cards, and decorative blobs
- numbered "01 / 02 / 03" section labels, monospace labels, and pill-shaped buttons or tags
- italic accent words inside headings, and headings in all caps
- emoji or icon-font bullets
- centred paragraphs of body text
- fly-in, zoom, spin or "convex" transitions

## Step 6: Render, inspect, fix, repeat

```bash
node <skill>/scripts/check_deck.js DECK.html WORK/shots --inventory WORK/inventory.json --regions WORK/prep/ink/regions.json
```

Fix everything it reports, and rerun until it prints `RESULT: clean`. Use the
`data-*-ok` escape hatches only for a genuinely intentional case, with an HTML
comment saying why. Then look at every contact sheet, both
`WORK/shots/contact-N.png` (annotations on) and `noann-contact-N.png`
(annotations off), and open any slide that looks off at full size. The script
catches overflow, broken math, small text, collisions and ink leaks. It cannot
tell you that a figure is misleading, a slide is cramped, a highlight landed
on the wrong word, a caption says something false, or two slides in a row
look identical. You can see those things in the screenshots.

Then do a **fidelity pass** against the source. Go through the PDF page by
page. For each item, find its slide and compare wording, every number, every
sign and every subscript against the page image. Also confirm that each ink
mark landed on the right words in the right colour, and that every caption
is true of the figure it sits under. A wrong sign in a matrix is the error
students notice first.

Keep a checklist of the open steps (for example in `WORK/progress.md`). Do not
stop while the checklist has open items. If something genuinely blocks you,
such as an unreadable page, a missing font or no network for the CDNs, say
exactly what is blocked and finish everything else.

## Step 7: Independent review

You have looked at this deck for hours, and you will not see what you got
used to. Get a fresh reader. If you can start a subagent (an Agent or Task
tool), start a new one with no access to your inventory, outline or notes,
give it the brief in `references/review-brief.md` with the PDF and deck
paths filled in, and wait for its findings. If you cannot start one, follow
the brief yourself, cold: build its list from the page images before you look
at your inventory again.

Fix every finding that holds up against the PDF, rerun `check_deck.js` until
it is clean, and send the deck to a new reviewer (not the same one) for one
more round. Stop when a round finds no missing item, no mathematical error, no
ink that reads as print, and nothing a student would stumble on, or after
three rounds; then name in the report anything left open.

## Step 8: Report

Reply with a short report:
- the deck path and slide count
- coverage, as `N/N inventory items placed` and `N/N ink regions claimed`, plus the ignored marks and why
- every correction you made to typed or handwritten math (page, what it said, what is correct)
- any low-confidence readings of handwriting
- what the independent review found and what you changed
- how to use the deck: arrow keys or space to navigate, `A` to toggle annotations, `S` for speaker notes, `?print-pdf` in the URL to export a PDF

## Definition of done

- [ ] Every page read at full size, in every zoom band, and on its ink map
- [ ] `inventory.json` covers every typed block and every ink mark; every ink region is claimed; strays are ignored with reasons
- [ ] All math recomputed, and slips corrected with visible `ann-fix` notes
- [ ] Order follows the notes. Each concept goes definition → visual (when useful) → proof → examples → takeaway
- [ ] Each instructor sketch is both cropped from the PDF (annotated + printed-only twin, readable size) and redrawn as SVG, and custom figures sit where they help
- [ ] All math is in KaTeX, in the notes' notation, full size, with no Unicode stand-ins
- [ ] Everything handwritten is in the ink layer, in the instructor's colours, on the slide it comments on, and `A` leaves exactly the printed notes
- [ ] `check_deck.js` prints `RESULT: clean`, and both sets of contact sheets have been reviewed by eye
- [ ] The fidelity pass is done, page by page
- [ ] An independent review round found nothing significant (or the report names what is open)
