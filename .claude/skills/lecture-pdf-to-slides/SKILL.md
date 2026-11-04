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
- `scripts/prepare_pdf.py`: renders pages, 2x zoom bands, text layer, embedded images
- `scripts/crop.py`: crops a page region (fractional coordinates), optional zoom, trim and data URI
- `scripts/linalg_check.py`: exact-fraction RREF, rank, nullity, bases, consistency and dependency relations
- `scripts/check_deck.js`: renders every slide, flags overflow, KaTeX errors, untypeset math, broken images and tiny text, writes contact sheets, and checks coverage against the inventory
- `references/deck-template.html`: the starting point, with theme, components, annotation layer and toggle
- `references/annotation-guide.md`: how to read ink, how to classify each mark, and how each kind appears in the deck, with a worked reference from Section 3.6

Before the first tool call, tell the user in one line what you are about to do.
At the end, give the short report described in step 7.

## Step 1: Prepare the PDF

```bash
python3 <skill>/scripts/prepare_pdf.py NOTES.pdf WORK/prep
```

This writes `pages/page-NN.png` (200 dpi), `zoom/page-NN-rK.png` (four
overlapping bands per page at 400 dpi), `text/page-NN.txt` and `manifest.json`.
The text layer is good for copying typed wording exactly. It does not contain
handwriting and may contain garbled fragments of it, so never take ink content
from it.

## Step 2: Read everything, then build the inventory

Read every page before you plan a single slide. Look at the full page first,
then at every zoom band. Lecture notes are cumulative: a remark on page 7
changes how the definition on page 1 should be presented, and handwriting that
is unreadable at page scale is usually clear in a band. Read
`references/annotation-guide.md` now, before you classify any ink.

Record every item in `WORK/inventory.json`. This file is the contract for
completeness. `check_deck.js` fails the deck if any non-ignored item is
missing from it.

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
      "target": "p01-def-row-col-space",
      "content": "'Row Space' highlighted"
    },
    {
      "id": "p10-ann-check-a4",
      "page": 10,
      "kind": "check",
      "source": "annotation",
      "ink": "magenta",
      "content": "Expanded check of a4 = -9/8 a1 - 1/2 a2",
      "correction": "Handwriting uses (-9,4,-3,4)^T (that is a5) as the left side; the correct a4 is (6,-3,-2,2)^T."
    },
    {
      "id": "p01-ann-stray-ticks",
      "page": 1,
      "kind": "stray",
      "source": "annotation",
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
- every annotation mark, classified with the kinds in the annotation guide

IDs are `pNN-<kind>-<slug>`, unique, stable, and lower-case. Keep `content`
close to the source wording. You will typeset from it, and the final
fidelity pass compares against it.

When the inventory is done, go through the pages one more time and check that
every box, every bold label and every patch of ink on each page maps to an
item. Notes PDFs often have a block at the very bottom of a page or a
one-line remark between two boxes. These are the items that get lost.

## Step 3: Verify the mathematics

Recompute every computation in the notes, typed and handwritten: every RREF,
pivot set, basis, rank, nullity, dependency relation, particular solution and
check. For linear algebra:

```bash
python3 <skill>/scripts/linalg_check.py "[[1,4,0,4],[-3,-4,4,-2],[-2,0,4,2]]"
python3 <skill>/scripts/linalg_check.py "[[1,2],[2,4]]" --b "[4,8]" --combo "[[0,2],[4,0],[2,1]]"
```

For other subjects, write a short script with `fractions.Fraction` or exact
integer arithmetic. Record any slip in the item's `correction` field.
`references/annotation-guide.md` explains how to present corrections. The
short version: typeset the correct mathematics and add an `ann-fix` line, so
students comparing the deck with their notes can see why the two differ.

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
to at most one large display block or one figure. If a slide needs more, split
it. A dense slide is the most common way these decks fail on a projector.

**Annotations on the plan.** For each slide, note which ink items it carries
and how: inline emphasis, `ann-note`, typeset worked solution, check, or
sketch. Put a margin note on the slide whose content it comments on, never on
a separate "annotations" slide at the end.

## Step 5: Build the HTML

Copy `references/deck-template.html` and replace all the sample slides. Keep
the CSS tokens, the components, the KaTeX setup and the annotation toggle.

**Components** (all defined in the template):
- `section.title-slide`, `section.divider`
- `.stack` > `h2.slide-title` + `.body` (the body centres sparse content vertically)
- `.box.definition`, `.box.theorem`, `.box.property`, `.box.note`, `.box.remark`, `.box.key`, each with a `<span class="label">`. Use the notes' own label text, e.g. "Theorem 3.6.2: Consistency Theorem for Linear Systems".
- `.proof` with `<span class="label">Proof.</span>` and a `.qed` mark
- `.example-label` / `.solution-label`, `.parts` lists for (a)/(b)
- `.split` (text | figure), `figure`, `figure.from-pdf` with `data-page`
- `table.grid`
- annotation classes: `hl-*`, `ul-*`, `circ-*`, `box-red`, `.ann-note.ann` (+ `red`/`magenta`/`green`), `.ann-fix.ann`
- `.src`: "notes p. N" on every content slide, so students can find the source page

**Coverage markers.** Put `data-inv="id1 id2"` on the element that renders
each inventory item: the box, the paragraph, the figure or the span. Every
non-ignored id must appear at least once. Do not use `data-src`; reveal.js
reserves it for lazy loading.

**Math.** Typeset all mathematics with KaTeX: `\( … \)` inline, `\[ … \]`
display, inside a `<div class="eq">` and never inside `<p>`.
- Match the notation of the notes exactly: bold vectors `\mathbf{a}_1`, `N(A)`, `\mathbb{R}^m`, bracket matrices `bmatrix`, column vectors as `bmatrix` columns. Write fractions as `\tfrac` inside matrices and as `\frac` in display math.
- Use `\begin{aligned}` for chains of `\iff` or `=` (for example the Theorem 3.6.2 proof and the Theorem 3.6.6 proof).
- Never write math as Unicode or plain text (`x1`, `R^n`, `→`). The checker flags raw TeX left in the text, but not Unicode math, so this one is on you.
- Put trailing punctuation inside the math, as in `\(L.\)`, so a period never wraps onto a line by itself.
- Carry highlighted or circled entries into the matrix itself with `\colorbox` / `\fcolorbox`. The annotation guide shows how.

**Fragments.** Use `class="fragment"` for solution steps, proof steps and the
reveal of an answer. Leave definitions and theorem statements fully visible.
Fragments only fade. There are no other animations.

**Speaker notes (optional, recommended).** `<aside class="notes">` can carry
what the instructor would say aloud: why a step works, or a common student
mistake the notes warn about. Never put source content only in speaker notes.
Notes do not count for coverage.

### Visualizations

Use both sources of figures.

1. **From the PDF.** For every instructor `sketch`, crop it with
   `scripts/crop.py … --trim --datauri` and embed it in `figure.from-pdf`
   with `data-page` and alt text. Use the same method for any printed figure
   in the notes.
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

Every SVG must be mathematically accurate (a point labelled (1, 2) sits at
(1, 2) on the drawn axes) and labelled with KaTeX-style italics for variables.
It should use the deck's colour tokens, with ink colours for things the
instructor drew, and carry `role="img"` and an `aria-label`. Compute
coordinates rather than eyeballing them.

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
  well next to KaTeX's Computer Modern), Caveat only for the small "Instructor
  note" label
- 1280×720 canvas, generous margins, left-aligned text, one strong focal
  element per slide

Avoid these patterns. Each one is a default that makes a deck look generic or
reads badly in a lecture hall:
- cream, beige or off-white backgrounds, dark-mode-only decks, and full-bleed gradient backgrounds
- gradient text, glassmorphism, drop-shadow-heavy cards, and decorative blobs
- numbered "01 / 02 / 03" section labels, monospace labels, and pill-shaped buttons or tags
- italic accent words inside headings, and headings in all caps
- emoji or icon-font bullets
- centred paragraphs of body text
- fly-in, zoom, spin or "convex" transitions
- body text under 22px on the canvas (captions, `ann-fix` lines and source labels may go down to 16px, nothing smaller)

## Step 6: Render, inspect, fix, repeat

```bash
node <skill>/scripts/check_deck.js DECK.html WORK/shots --inventory WORK/inventory.json
```

Fix everything it reports. Then look at every contact sheet
(`WORK/shots/contact-N.png`), and open any slide that looks off at full size
(`slide-NNN.png`). The script catches overflow and broken math. It cannot
tell you that a figure is misleading, a slide is cramped, a highlight landed on
the wrong word, or two slides in a row look identical. You can see those
things in the screenshots. Rerun after each round of fixes until the result
is `RESULT: clean` and every slide looks right.

Then do a **fidelity pass** against the source. Go through the PDF page by
page. For each item, find its slide and compare wording, every number, every
sign and every subscript against the page image. Also confirm that each ink
mark landed on the right words in the right colour. A wrong sign in a matrix
is the error students notice first.

Keep a checklist of the open steps (for example in `WORK/progress.md`). Do not
stop while the checklist has open items. If something genuinely blocks you,
such as an unreadable page, a missing font or no network for the CDNs, say
exactly what is blocked and finish everything else.

## Step 7: Report

Reply with a short report:
- the deck path and slide count
- coverage, as `N/N inventory items placed`, plus the ignored marks and why
- every correction you made to typed or handwritten math (page, what it said, what is correct)
- any low-confidence readings of handwriting
- how to use the deck: arrow keys or space to navigate, `A` to toggle annotations, `S` for speaker notes, `?print-pdf` in the URL to export a PDF

## Definition of done

- [ ] Every page read at full size and in every zoom band
- [ ] `inventory.json` covers every typed block and every ink mark, and strays are ignored with reasons
- [ ] All math recomputed, and slips corrected with `ann-fix` notes
- [ ] Order follows the notes. Each concept goes definition → visual (when useful) → proof → examples → takeaway
- [ ] Each instructor sketch is both cropped from the PDF and redrawn as SVG, and custom figures sit where they help
- [ ] All math is in KaTeX, in the notes' notation, with no Unicode stand-ins
- [ ] The annotation layer is complete, in the instructor's colours, and toggles with `A`
- [ ] `check_deck.js` prints `RESULT: clean`, and every contact sheet has been reviewed by eye
- [ ] The fidelity pass is done, page by page
