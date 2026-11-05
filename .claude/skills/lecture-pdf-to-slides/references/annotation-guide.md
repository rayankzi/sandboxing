# Reading and carrying over instructor annotations

Annotated lecture notes have two layers. The typed layer is the LaTeX template.
The ink layer is what the instructor added in class: highlights, underlines,
circles, arrows, margin notes, sketches, and often whole worked solutions
written into blank space the template left for them. Students study from the
ink layer as much as from the typed one, so the deck must carry it over. A
deck that drops it is missing part of the lecture.

## Where the ink lives

- **Not in the text layer.** `pdftotext` returns only typed text. Sometimes it
  also returns garbled OCR-like fragments of handwriting (for example
  `ñ2 20 64 6 63`). Never take handwriting from the text layer. Read it from
  the page images.
- **Rarely as usable embedded images.** Annotation apps often store ink as
  vector strokes or as hundreds of copies of one small texture. `prepare_pdf.py`
  moves repeated textures to `images/_stamps/`. Ignore that folder.
- **In the rendered pages.** Read each page at full size, then read every zoom
  band (`zoom/page-NN-rK.png`, 2x resolution). Small subscripts, signs and
  faint highlighter are often visible only in the bands. If something is still
  unclear, crop it tighter with `scripts/crop.py ... --zoom 2` and look again.
- **Separated, when the PDF allows it.** `separate_ink.py` (run by
  `prepare_pdf.py`) removes the ink layer and writes `printed/page-NN.png`
  (the notes as printed), `ink/page-NN.png` (the ink alone) and
  `ink/page-NN-map.png` (every ink region boxed and numbered). The pair
  answers "printed or handwritten?" for every mark, including ink drawn on top
  of a printed figure and blanks filled in by hand. The map is your checklist:
  each numbered region ends up in an inventory item's `"regions"` list, or in
  a stray item. Pen and highlighter are mapped separately (black and orange
  boxes), and each pen colour separately, so a highlight or a note in a
  second colour is always a region of its own. `ink/regions.json` also gives
  each region's colour as a hex value; use those for the deck's `--ann-*`
  tokens.

## Classify every mark

Give every mark one of these kinds in the inventory. The right-hand column is
how it appears in the deck. Everything in that column is part of the ink
layer: drawn in the instructor's colour, and hidden by the `A` toggle.

| Kind | What it looks like | How it appears in the deck |
|---|---|---|
| `highlight` | translucent yellow, green, orange or pink swipe over typed text | Same words wrapped in `<span class="hl-yellow">` (or `hl-green`, `hl-orange`, `hl-pink`, `hl-blue`); inside a formula `\hly{…}`. Keep the instructor's colour. |
| `underline` | pen line under typed text or under a formula | `<span class="ul-magenta">` (or `ul-red`, `ul-blue`, `ul-green`, `ul-navy`; `ul2-*` for a double line) on the same words. The span draws under KaTeX too, so wrap the formula itself: `<span class="ul-magenta">\(\mathbb{R}^n\to\mathbb{R}^m\)</span>`. Inside a larger formula use `\ulm{…}`. |
| `circle` / `box` | loop or rectangle around a term, entry, label or vector | `circ-*` / `box-*` on that element, or `\cim{…}` / `\bxm{…}` inside math. A circled matrix column becomes a column highlight inside the matrix (see "Emphasis inside math"). |
| `arrow-link` | arrow from one thing to another, often with a short label ("scalar multiple of the 1st vector") | an `ann-note` placed next to the target, or an SVG arrow on the slide inside `<g class="ann">`. Keep the label text. |
| `margin-note` | short handwritten sentence or formula beside the text | `<div class="ann-note magenta">` with an `ink-label` ("Instructor note") and the text typeset, math in KaTeX, in the ink colour used |
| `fill-in` | handwriting in a blank the printed template leaves ("dimension ____", "L(e₁) =") | the printed blank stays as `.blank` (or the printed "L(e₁) =" stays in black), and the handwritten answer goes inside it as `<span class="hw ink-magenta">` or `\inkm{…}`. With annotations off the blank is empty again, exactly as printed. |
| `worked-solution` | a solution handwritten under a typed problem whose typed solution is missing or partial | Taught step by step with fragments, exactly like a typed solution, but in the ink layer: a `<div class="hw-block ink-magenta">` with `<span class="ink-label">Instructor's solution</span>`, its math in the same colour. Long ones continue on "(cont.)" slides, each with its own ink label. |
| `check` | handwritten verification of a typed claim, e.g. plugging vectors in | A `hw-block` with the label "Instructor's check", on the same slide as the claim or the next one. Verify the arithmetic first (see below). |
| `sketch` | hand-drawn axes, vectors, lines, planes, diagrams, or strokes drawn on a printed figure | Always both: (1) the crop pair from `crop.py --pair` (annotated crop `figure.from-pdf.ann`, printed-only twin `.printed-only`) at a readable size, and (2) a clean SVG redraw, with the instructor's strokes in the ink colour inside `<g class="ann">`. |
| `separator` | horizontal rule the instructor drew to split a solution into parts | No visual. Usually a good place for a slide break. Record it as `structural`. |
| `stray` | accidental ticks, dots, tiny pen marks with no meaning | Do not render. Record with `"disposition": "ignored"`, its `"regions"`, and a reason, so the coverage checks know it was looked at. Never turn a stray into a symbol (a tick after "A =" is not "=:"). |

When a mark is ambiguous between `stray` and meaningful, treat it as meaningful.
A small red tick next to a definition might be the instructor marking it as
important. Render it as emphasis rather than dropping it.

## The ink layer in practice

These snippets cover most slides:

```html
<!-- a printed blank, filled in by hand -->
<p>Since \(L:\mathbb{R}^3\to\mathbb{R}^2\), the matrix has dimension
   <span class="blank"><span class="hw ink-magenta" data-inv="p03-ann-fill-dim">\(2\times 3\)</span></span>.</p>

<!-- a printed "L(e1) =" with the handwritten answer -->
<div class="eq">\[L(\mathbf{e}_1) = \inkm{\begin{bmatrix}0\\1\end{bmatrix}}\]</div>

<!-- a handwritten solution, revealed step by step -->
<div class="hw-block ink-magenta" data-inv="p08-ann-sol">
  <span class="ink-label">Instructor's solution</span>
  <div class="eq fragment">\[\mathbf{a}_1 = L(\mathbf{e}_1) = \begin{bmatrix}1\\0\end{bmatrix}\]</div>
  <div class="eq fragment">\[\mathbf{a}_2 = L(\mathbf{e}_2) = \begin{bmatrix}1\\0\end{bmatrix}\]</div>
</div>

<!-- a caption that describes the ink is ink too -->
<figcaption class="ann">Magenta: the instructor's legs of length \(\sin\theta\) and \(\cos\theta\)</figcaption>
```

- One colour per pen, set from `ink/regions.json`. Do not recolour the
  instructor's blue note magenta because magenta is used nearby.
- The `ink-label` names what the ink is ("Instructor note", "Instructor's
  solution", "Instructor's check", "filled in by the instructor"). Use it on
  every block of handwriting, so a viewer never has to guess.
- Keep emphasis that sits on one line from colliding with a box on the next
  line: if the instructor underlined a phrase directly above a boxed formula,
  put the box on its own line with a little space above it.
- When a slide is split, every note, arrow label and check moves with the line
  it belongs to.
- Labels the instructor wrote under matrix columns ("L(e₁) L(e₂) L(e₃)" with
  arrows) go on their own line under a normal `bmatrix`, in column order and
  in the ink colour. Do not pad the matrix to fit them.
- Do not write captions that describe the ink ("magenta: the instructor's
  marks"). Draw the mark in its colour; the `ink-label` does the explaining.

## Emphasis inside math

The template defines KaTeX macros that put the ink-layer classes on the
formula, so emphasis inside math matches the CSS tokens and hides with the
toggle like everything else:

```latex
\begin{bmatrix}
\hly{1} & -2 & \hlg{0} & -1\\
0 & 0 & \hlg{1} & 1
\end{bmatrix}
\qquad \bxr{\mathbf{a}_j = L(\mathbf{e}_j)} \qquad \ulm{L : \mathbb{R}^2\to\mathbb{R}^2}
```

- Highlights: `\hly{}` yellow, `\hlg{}` green, `\hlo{}` orange, `\hlp{}` pink, `\hlb{}` blue.
- Underlines: `\ulr{}`, `\ulm{}`, `\ulb{}`, `\ulg{}`, `\uln{}` (red, magenta, blue, green, navy).
- Boxes: `\bxr{}`, `\bxm{}`, `\bxb{}`, `\bxg{}`, `\bxn{}`. Circles: `\cir{}`, `\cim{}`, `\cib{}`, `\cig{}`.
- Handwritten math: `\inkr{}`, `\inkm{}`, `\inkb{}`, `\inkg{}`, `\inkn{}` in that pen's colour.
- Highlighted pivot entries or columns: the macro on each entry. A highlighted
  whole vector or matrix: `\hly{\,\begin{bmatrix}…\end{bmatrix}\,}`, with the
  thin spaces so the brackets are not cramped.
- Do not hard-code colours with `\colorbox{#…}` or `\textcolor{#…}`: those
  stay visible with annotations off and drift from the tokens.

## Verify handwritten mathematics before typesetting it

Instructors make slips when they write fast. Copying a slip into a clean,
authoritative-looking slide makes it worse. Before typesetting any handwritten
computation, recompute it with `scripts/linalg_check.py` (linear algebra) or a
short Python script using `fractions.Fraction` (anything else).

- If it is correct, typeset it as written.
- If it has a slip, typeset the correct version. Add a short
  `<p class="ann-fix ann">` line saying what the handwriting had and what the
  correct value is. Record the slip in the inventory `correction` field and
  list it in the final report. Students who compare the deck with their notes
  should see why they differ.
- Loose handwritten notation that a student could copy wrongly ("Basis =
  {…} = ℝ³", where the span is meant) gets the same treatment: typeset the
  precise statement and say so in an `ann-fix` line.
- If you cannot read a value and the math does not settle it, set
  `"confidence": "low"` and name it in the final report. Do not guess silently.

Typed text can contain typos too, for example a transpose symbol in the wrong
place or a matrix that disagrees with the same matrix on another page. Fix
these the same way, with `<p class="ann-fix typed">` (it stays visible with
annotations off, because the typed content it explains does too) whenever
the meaning changes. Pure spelling typos can be fixed silently.

## Worked reference: Section 3.6 (Row Space and Column Space)

These are real marks from the reference notes, with the classification and
deck treatment they need. Use them to calibrate.

- **p.1** Yellow highlight on "Row Space", green on "Definition" and "Rank":
  `highlight`. A red box around "Property 3.6.1" and red underlines across the
  proof: `box` + `underline`. Two tiny red ticks near the first definition:
  `stray`, ignored with a reason.
- **p.2** The "It follows…" callout has its key clause highlighted green and
  underlined. The parts "(a)" and "(b)" have green dots. The two nonzero RREF
  rows are circled red, and the basis vectors are highlighted yellow. Red boxes
  surround "row₃ = row₁ + row₂". All are emphasis. Put the circled RREF rows
  inside the math with `\colorbox`/`\fcolorbox`.
- **p.3** Red margin note beside Theorem 3.6.2: "i.e. iff **b** can be written
  as a linear combination of the columns of A": `margin-note`.
- **p.4** Blue margin note: "A is 2×3. Since the rows are vectors in ℝ³, the row
  space of A is a subspace of ℝ³; since the columns are vectors in ℝ², the
  column space is a subspace of ℝ²". Magenta arrow from (6,2)ᵀ: "scalar
  multiple of the 1st vector". Red note: "dim(ℝ²) = 2 → any pair of linearly
  independent vectors is a basis of ℝ²". Blue "NOTE: rank of A = 2 since
  dimension of column space is 2." Each is its own inventory item.
- **p.5** Top-right `sketch` of the line L through (1,2). Redraw it as SVG (the
  line in magenta inside `<g class="ann">`) and include the crop pair. Magenta margin note "column space of A = span(…) = span(…)
  = line L". Blue "→ infinitely many solutions to Ax = b".
- **p.6** Handwritten α(0,1,0)ᵀ + β(1,0,1)ᵀ = (β, α, β)ᵀ, "α, β any real
  number". This is the key step of the solution, so it is `worked-solution`:
  a `hw-block` in the pen's colour, revealed as fragments. Also "col space = span(…) subspace of ℝ³" and
  "dim(col. space) = 2".
- **p.7** Blue note under the Remark: "b/c N(A) has no basis since the zero
  vector cannot be in a basis". Magenta "zero vector" pointing at **0**.
- **p.8** The whole solution (row-space basis, rank = 3 = # of pivots,
  free variables x₃, x₄, parametric solution, nullspace basis, nullity = 2,
  rank + nullity = 3 + 2 = 5) is handwritten: `worked-solution`, several
  slides of `hw-block`s with fragments, each slide labelled. The blue horizontal line is a `separator`.
- **p.9** Two `sketch`es: the y-axis as span of (0,1)ᵀ, the x-axis as span of
  (1,0)ᵀ. A side-by-side SVG makes "A and U have different column spaces"
  obvious. Column labels u₁…u₅ and the expanded check of u₃ = ¼u₁ − u₂.
- **p.10** Handwritten checks of a₃ and a₄. **The a₄ check writes the left side
  as (−9, 4, −3, 4)ᵀ, which is a₅. The correct a₄ is (6, −3, −2, 2)ᵀ.** The
  relation a₄ = −⁹⁄₈a₁ − ½a₂ holds for the real a₄. Typeset the corrected
  check with an `ann-fix` line.
- **p.11** Handwritten solution: pivots in columns 1 and 3, basis {a₁, a₃},
  then u₂ = −2u₁, u₄ = −u₁ + u₃, and the same relations for A with checks.
  **The a₂ check writes (−2, 2, 4)ᵀ. The correct a₂ is (−2, 2, −4)ᵀ.**
- **p.12** Handwritten conclusion: pivots in columns 1 and 2, so v₁, v₂ form a
  basis, with the basis highlighted. Pivots circled in magenta.
- **p.13–14** No ink. Every typed box (Theorem 3.6.6 with proof, Case I,
  Case II, the four-possibilities table, Examples of 2, 3, 4) is still an
  inventory item.
