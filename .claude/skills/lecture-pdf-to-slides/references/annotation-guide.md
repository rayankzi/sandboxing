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

## Classify every mark

Give every mark one of these kinds in the inventory. The right-hand column is
how it appears in the deck.

| Kind | What it looks like | How it appears in the deck |
|---|---|---|
| `highlight` | translucent yellow, green or orange swipe over typed text | Same words wrapped in `<span class="hl-yellow">` (or `hl-green`, `hl-orange`). Keep the instructor's colour. |
| `underline` | pen line under typed text | `<span class="ul-red">` (or `ul-blue`, `ul-magenta`) on the same words |
| `circle` / `box` | loop or rectangle around a term, entry, label or vector | `circ-*` / `box-red` on that element. A circled matrix column becomes a column highlight inside the matrix (see "Emphasis inside math"). |
| `arrow-link` | arrow from one thing to another, often with a short label ("scalar multiple of the 1st vector") | an `ann-note` placed next to the target, or an SVG arrow on the slide. Keep the label text. |
| `margin-note` | short handwritten sentence or formula beside the text | `<div class="ann-note ann">` with the text typeset, math in KaTeX, in the ink colour used |
| `worked-solution` | a full solution handwritten under a typed problem whose typed solution is missing or partial | First-class solution content. Typeset it step by step with fragments, exactly like a typed solution, and mark the wrapper `ann`-free (it is content, not decoration). Record `"source": "annotation"` in the inventory. |
| `check` | handwritten verification of a typed claim, e.g. plugging vectors in | Typeset on the same or the next slide as "Check:". Verify the arithmetic first (see below). |
| `sketch` | hand-drawn axes, vectors, lines, planes, diagrams | Always both: (1) a clean custom SVG redraw that is accurate and labelled, and (2) the crop of the original sketch (`figure.from-pdf`), on the same slide if it fits or as a small inset. |
| `separator` | horizontal rule the instructor drew to split a solution into parts | No visual. Usually a good place for a slide break. Record it as `structural`. |
| `stray` | accidental ticks, dots, tiny pen marks with no meaning | Do not render. Record with `"disposition": "ignored"` and a reason, so the coverage check knows it was looked at. |

When a mark is ambiguous between `stray` and meaningful, treat it as meaningful.
A small red tick next to a definition might be the instructor marking it as
important. Render it as emphasis rather than dropping it.

## Emphasis inside math

KaTeX supports colour inside formulas. Use it to carry over highlights and
circles drawn on matrices and vectors:

```latex
\begin{bmatrix}
\colorbox{#fff08a}{$1$} & -2 & \colorbox{#bdf2d5}{$0$} & -1\\
0 & 0 & \colorbox{#bdf2d5}{$1$} & 1
\end{bmatrix}
```

- Highlighted pivot entries or columns: `\colorbox{...}{$...$}` on each entry,
  or `\textcolor{...}{...}` when a box makes the matrix too wide.
- Circled entries: `\boxed{1}` or `\fcolorbox{#d6332a}{white}{$1$}`.
- Whole highlighted vectors in a basis: wrap the vector in `\colorbox`.

Use the same hex values as the CSS tokens (`--hl-yellow` is about `#fff08a`
when flattened on white, `--hl-green` about `#bdf2d5`, `--hl-orange` about
`#ffd59e`, red ink `#d6332a`, blue `#2453d6`, magenta `#c2189b`).

## Verify handwritten mathematics before typesetting it

Instructors make slips when they write fast. Copying a slip into a clean,
authoritative-looking slide makes it worse. Before typesetting any handwritten
computation, recompute it with `scripts/linalg_check.py` (linear algebra) or a
short Python script using `fractions.Fraction` (anything else).

- If it is correct, typeset it as written.
- If it has a slip, typeset the correct version. Add a short `ann-fix` line
  saying what the handwriting had and what the correct value is. Record the
  slip in the inventory `correction` field and list it in the final report.
  Students who compare the deck with their notes should see why they differ.
- If you cannot read a value and the math does not settle it, set
  `"confidence": "low"` and name it in the final report. Do not guess silently.

Typed text can contain typos too, for example a transpose symbol in the wrong
place. Fix these the same way, with an `ann-fix` note only when the meaning
changes.

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
- **p.5** Top-right `sketch` of the line L through (1,2). Redraw it as SVG and
  include the crop. Magenta margin note "column space of A = span(…) = span(…)
  = line L". Blue "→ infinitely many solutions to Ax = b".
- **p.6** Handwritten α(0,1,0)ᵀ + β(1,0,1)ᵀ = (β, α, β)ᵀ, "α, β any real
  number". This is the key step of the solution, so it is `worked-solution`,
  not decoration. Also "col space = span(…) subspace of ℝ³" and
  "dim(col. space) = 2".
- **p.7** Blue note under the Remark: "b/c N(A) has no basis since the zero
  vector cannot be in a basis". Magenta "zero vector" pointing at **0**.
- **p.8** The whole solution (row-space basis, rank = 3 = # of pivots,
  free variables x₃, x₄, parametric solution, nullspace basis, nullity = 2,
  rank + nullity = 3 + 2 = 5) is handwritten: `worked-solution`, several
  slides with fragments. The blue horizontal line is a `separator`.
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
