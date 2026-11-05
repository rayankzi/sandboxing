# Independent review brief

Give this brief, with the paths filled in, to a reviewer who has not seen the
deck being built. The reviewer reads the notes first and the deck second, and
reports what a student or instructor would trip over. They do not edit the deck.

---

You are reviewing an HTML slide deck (reveal.js + KaTeX) that was made from a
set of annotated lecture notes. Your job is to find every place where the deck
falls short of the notes or of a clean lecture presentation, with evidence, so
the author can fix it. Report what a viewer would actually see; hidden
attributes, HTML comments and speaker notes do not count as content.

- Notes (PDF): `PDF_PATH`
- Deck: `DECK_PATH`
- Your work folder: `REVIEW_DIR` (do not open the author's work folder)
- Skill scripts you may use: `SKILL_DIR/scripts/` (prepare_pdf.py,
  separate_ink.py, crop.py, linalg_check.py, check_deck.js)

## 1. Read the notes first, and make your own list

Before you open the deck, run
`python3 SKILL_DIR/scripts/prepare_pdf.py PDF_PATH REVIEW_DIR/prep`
and read every page: the full page, its zoom bands, and its ink map
(`ink/page-NN-map.png`, with the printed-only page next to it). Write a list
of every item, with page number and type:
- typed: section headings, Definitions, Theorems, Properties, Proofs, Notes,
  Remarks, callouts, each Example and each part, each Solution and each part,
  tables, summary and case boxes
- ink: each highlight, underline (including under a formula), circle, box,
  arrow and its label, margin note, filled-in blank, handwritten step,
  solution, check and sketch; mark obvious stray ticks as stray

Recompute every computation (matrices, bases, ranks, checks) with exact
arithmetic, for example `python3 SKILL_DIR/scripts/linalg_check.py "[[...]]"`,
and note any slip in the notes themselves.

## 2. Render the deck

Run `node SKILL_DIR/scripts/check_deck.js DECK_PATH REVIEW_DIR/shots --pages REVIEW_DIR/prep/pages`
for screenshots with annotations on (`slide-NNN.png`) and off
(`noann-NNN.png`), its automatic findings, a sheet per PDF page with the
slides that cite it (`compare-pNN.png`), and every formula slide by slide
(`tex-by-slide.txt`). Then look at every slide yourself, at full size
for anything math-heavy or questionable. Press-test the annotation toggle by
comparing the on and off screenshots.

## 3. Check, item by item

For every item on your list, find the slide where it is visibly rendered;
the `compare-pNN.png` sheets put each page next to its slides, so go mark by
mark across each sheet. Then check:
- **Coverage:** is it there, complete, and on the slide it belongs to? A
  margin note or arrow label must sit with the line it comments on.
- **Accuracy:** wording, every matrix entry, sign, subscript and fraction
  against the page image. A slip copied from the notes without a visible
  correction is an error; a slip corrected with a visible note is right.
- **Ink:** can a viewer tell instantly what was printed and what the
  instructor wrote? Handwritten material must be in the pen's colour (not the
  printed black) and marked as the instructor's. With annotations off, the
  deck should show exactly the printed notes: no handwriting, no ink crops,
  no captions about the ink.
- **Typesetting:** all math in KaTeX (no `x1`, `R^n`, `→`, `θ`, `°` as plain
  text); matrices full size, never `smallmatrix`; notation as in the notes
  (bold vectors); every function has its argument (`cos θ`, not `cos`); no
  awkward line breaks, formulas left alone on a line, orphaned brackets,
  cramped fractions, matrices stretched to fit labels, or uneven gaps.
- **Figures:** every instructor sketch carried over (as a readable crop and/or
  a faithful redraw); custom figures accurate (points at the right
  coordinates, labels right and consistent with the slide's numbers); no
  label touching another label or crossed by a line; crops that cut off a
  bracket or include a fragment of the next line; captions true of the
  figure they describe, and no captions that merely name pen colours.
- **Layout and design:** nothing cut off or overflowing; all text a viewer
  reads at 22px or more on the 1280×720 canvas; slide chrome (arrows, slide
  number, toggle, source tag) not overlapping anything; consistent colours
  for box types; no overloaded slide (a statement plus a correction plus a
  computation is too much for one slide).
- **Structure:** the notes' order; title, roadmap, section dividers, summary;
  each concept stated, then pictured where a picture helps, then proved,
  then worked step by step, then concluded; long solutions split rather than
  shrunk.

## 4. Report

Return a list of findings, most serious first, grouped as: missing or
partial items; mathematical errors; ink problems; typesetting; figures;
layout and design; structure. Each finding gives the slide number (1..N in
reveal.js order), the PDF page, what is wrong, and the exact fix ("slide 17,
p. 5: the blue underline under A^{-1} = A in the Note is missing; add
ul-blue around that formula"). If you cannot read a handwritten value, say
so instead of guessing. End with one line: either "No significant findings"
or the number of findings.
